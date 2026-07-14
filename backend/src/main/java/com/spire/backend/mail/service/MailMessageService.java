package com.spire.backend.mail.service;

import com.spire.backend.exception.ResourceNotFoundException;
import com.spire.backend.exception.UnauthorizedException;
import com.spire.backend.mail.dto.*;
import com.spire.backend.mail.entity.MailAccount;
import com.spire.backend.mail.entity.MailFolder;
import com.spire.backend.mail.entity.MailMailboxEntry;
import com.spire.backend.mail.entity.MailMailboxEntry.Folder;
import com.spire.backend.mail.entity.MailMessage;
import com.spire.backend.mail.entity.MailMessageRecipient;
import com.spire.backend.mail.entity.MailMessageRecipient.Type;
import com.spire.backend.mail.repository.MailAccountRepository;
import com.spire.backend.mail.repository.MailMailboxEntryRepository;
import com.spire.backend.mail.repository.MailMessageRecipientRepository;
import com.spire.backend.mail.repository.MailMessageRepository;
import com.spire.backend.mail.security.MailPrincipal;
import jakarta.persistence.criteria.Join;
import jakarta.persistence.criteria.Predicate;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.LocalDateTime;
import java.util.*;

/**
 * Mail messaging core. Every op resolves the caller from the
 * authenticated {@link MailPrincipal} (re-loaded); account/domain are
 * NEVER trusted from the request body.
 *
 * <p>Walling invariant: a message can only be sent to ACTIVE accounts in
 * the SENDER's own domain — any cross-domain / unknown / suspended
 * recipient rejects the whole send with one generic, non-enumerating
 * error. Reads/flags/search operate ONLY over the caller's own
 * {@link MailMailboxEntry} rows.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class MailMessageService {

    private static final String RECIPIENT_REJECT = "One or more recipients could not be resolved.";

    private final MailAccountRepository mailAccountRepository;
    private final MailMessageRepository mailMessageRepository;
    private final MailMessageRecipientRepository mailRecipientRepository;
    private final MailMailboxEntryRepository mailboxRepository;
    private final com.spire.backend.mail.repository.MailAttachmentRepository mailAttachmentRepository;
    private final MailBlobStore blobStore;
    private final MailSseService mailSseService;
    private final MailFolderService mailFolderService;
    private final MailRuleEngine mailRuleEngine;

    // ─── Send ───────────────────────────────────────────────────────

    @Transactional
    public MailMessageDetail send(MailPrincipal principal, MailComposeRequest req) {
        MailAccount sender = loadCaller(principal);
        List<Resolved> resolved = resolveAll(req, sender);
        if (resolved.isEmpty()) {
            throw new IllegalArgumentException("At least one recipient is required.");
        }
        MailMessage parent = resolveParent(req.getInReplyToId(), sender);
        MailMessage msg = persistMessage(sender, req, parent);
        persistRecipients(msg, resolved);
        deliver(sender, msg, resolved);
        MailMailboxEntry senderEntry = mailboxRepository
                .findByAccount_IdAndMessage_IdAndDeletedAtIsNull(sender.getId(), msg.getId())
                .orElseThrow();
        return toDetail(msg, senderEntry, sender);
    }

    // ─── Drafts ─────────────────────────────────────────────────────

    @Transactional
    public MailMessageDetail saveDraft(MailPrincipal principal, MailComposeRequest req) {
        MailAccount sender = loadCaller(principal);
        MailMessage parent = resolveParent(req.getInReplyToId(), sender);
        MailMessage msg = persistMessage(sender, req, parent);
        persistRecipients(msg, resolveAll(req, sender)); // drafts: any provided recipient must wall; none is ok
        MailMailboxEntry draft = mailboxRepository.save(entry(sender, msg, Folder.DRAFTS, true));
        return toDetail(msg, draft, sender);
    }

    @Transactional
    public MailMessageDetail updateDraft(MailPrincipal principal, Long id, MailComposeRequest req) {
        MailAccount sender = loadCaller(principal);
        MailMailboxEntry entry = ownDraft(sender, id);
        MailMessage msg = entry.getMessage();
        msg.setSubject(blankToNull(req.getSubject()));
        msg.setBodyHtml(req.getBodyHtml());
        msg.setBodyText(req.getBodyText());
        mailMessageRepository.save(msg);
        mailRecipientRepository.deleteByMessage_Id(msg.getId());
        persistRecipients(msg, resolveAll(req, sender));
        return toDetail(msg, entry, sender);
    }

    @Transactional
    public MailMessageDetail sendDraft(MailPrincipal principal, Long id) {
        MailAccount sender = loadCaller(principal);
        MailMailboxEntry draft = ownDraft(sender, id);
        MailMessage msg = draft.getMessage();
        List<MailMessageRecipient> rows = mailRecipientRepository.findByMessage_Id(msg.getId());
        if (rows.isEmpty()) {
            throw new IllegalArgumentException("At least one recipient is required.");
        }
        // Re-wall at send time — an account may have been suspended/moved
        // since the draft was saved.
        List<Resolved> resolved = new ArrayList<>();
        for (MailMessageRecipient r : rows) {
            MailAccount a = r.getRecipient();
            if (!a.getDomain().getId().equals(sender.getDomain().getId())
                    || a.getStatus() != MailAccount.Status.ACTIVE) {
                throw new IllegalArgumentException(RECIPIENT_REJECT);
            }
            resolved.add(new Resolved(a, r.getType()));
        }
        // Reuse the existing draft entry AS the sender's SENT entry (don't
        // insert a second one — that would leave two rows for
        // (account, message) and break the Optional entry finder), then fan
        // out INBOX entries to the recipients.
        draft.setFolder(Folder.SENT);
        draft.setFolderRef(mailFolderService.systemFolder(sender, Folder.SENT));
        draft.setIsRead(true);
        mailboxRepository.save(draft);
        deliverToRecipients(sender, msg, resolved);
        return toDetail(msg, draft, sender);
    }

    // ─── Read ───────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public MailFolderListing listFolder(MailPrincipal principal, String folderStr, Pageable pageable) {
        MailAccount caller = loadCaller(principal);
        MailFolder folder = mailFolderService.resolveByKeyOrId(caller, folderStr); // system key OR custom id, walled
        Page<MailMailboxEntry> page = mailboxRepository
                .findByAccount_IdAndFolderRef_IdAndDeletedAtIsNullOrderByMessage_CreatedAtDescIdDesc(
                        caller.getId(), folder.getId(), pageable);
        long unread = mailboxRepository
                .countByAccount_IdAndFolderRef_IdAndIsReadFalseAndDeletedAtIsNull(caller.getId(), folder.getId());
        return MailFolderListing.from(page, toSummaries(page.getContent()), unread);
    }

    /** Cross-folder Starred view — the caller's starred, non-deleted entries. */
    @Transactional(readOnly = true)
    public MailFolderListing listStarred(MailPrincipal principal, Pageable pageable) {
        MailAccount caller = loadCaller(principal);
        Page<MailMailboxEntry> page = mailboxRepository
                .findByAccount_IdAndIsStarredTrueAndDeletedAtIsNullOrderByMessage_CreatedAtDescIdDesc(caller.getId(), pageable);
        long unread = mailboxRepository.countByAccount_IdAndIsStarredTrueAndIsReadFalseAndDeletedAtIsNull(caller.getId());
        return MailFolderListing.from(page, toSummaries(page.getContent()), unread);
    }

    @Transactional(readOnly = true)
    public MailMessageDetail getMessage(MailPrincipal principal, Long id) {
        MailAccount caller = loadCaller(principal);
        MailMailboxEntry entry = requireEntry(caller, id);
        return toDetail(entry.getMessage(), entry, caller);
    }

    @Transactional(readOnly = true)
    public MailThreadView getThread(MailPrincipal principal, Long threadId) {
        MailAccount caller = loadCaller(principal);
        List<MailMailboxEntry> entries = mailboxRepository
                .findByAccount_IdAndMessage_ThreadIdAndDeletedAtIsNull(caller.getId(), threadId);
        if (entries.isEmpty()) {
            throw new ResourceNotFoundException("MailThread", "id", threadId);
        }
        Map<Long, MailMailboxEntry> byMessage = new HashMap<>();
        for (MailMailboxEntry e : entries) byMessage.putIfAbsent(e.getMessage().getId(), e);
        // Batch-load attachments for the whole thread once (avoids an N+1 of one
        // attachment query per message).
        Map<Long, List<MailAttachmentSummary>> attsByMsg = new HashMap<>();
        for (com.spire.backend.mail.entity.MailAttachment a
                : mailAttachmentRepository.findByMessage_IdIn(new ArrayList<>(byMessage.keySet()))) {
            attsByMsg.computeIfAbsent(a.getMessage().getId(), k -> new ArrayList<>())
                    .add(MailAttachmentSummary.builder()
                            .id(a.getId()).filename(a.getFilename())
                            .contentType(a.getContentType()).sizeBytes(a.getSizeBytes()).build());
        }
        List<MailMessageDetail> messages = mailMessageRepository
                .findByThreadIdOrderByCreatedAtAscIdAsc(threadId).stream()
                .filter(m -> byMessage.containsKey(m.getId()))
                .map(m -> toDetail(m, byMessage.get(m.getId()), caller, attsByMsg.getOrDefault(m.getId(), List.of())))
                .toList();
        return MailThreadView.builder().threadId(threadId).messages(messages).build();
    }

    @Transactional(readOnly = true)
    public PagedResponse<MailMessageSummary> search(MailPrincipal principal, String q, Pageable pageable) {
        MailAccount caller = loadCaller(principal);
        String like = "%" + (q == null ? "" : q.trim().toLowerCase()) + "%";
        Specification<MailMailboxEntry> spec = (root, query, cb) -> {
            Join<Object, Object> msg = root.join("message");
            Join<Object, Object> sender = msg.join("sender");
            Predicate match = cb.or(
                    cb.like(cb.lower(cb.coalesce(msg.<String>get("subject"), "")), like),
                    cb.like(cb.lower(cb.coalesce(msg.<String>get("bodyText"), "")), like),
                    cb.like(cb.lower(sender.<String>get("localPart")), like),
                    cb.like(cb.lower(cb.coalesce(sender.<String>get("displayName"), "")), like));
            return cb.and(
                    cb.equal(root.get("account").get("id"), caller.getId()),
                    cb.isNull(root.get("deletedAt")),
                    match);
        };
        Page<MailMailboxEntry> page = mailboxRepository.findAll(spec, pageable);
        return PagedResponse.from(page, toSummaries(page.getContent()));
    }

    // ─── Flags / organize ───────────────────────────────────────────

    @Transactional
    public MailMessageDetail applyFlags(MailPrincipal principal, Long id, MailFlagUpdateRequest req) {
        MailAccount caller = loadCaller(principal);
        MailMailboxEntry entry = requireEntry(caller, id);
        if (req.getRead() != null) entry.setIsRead(req.getRead());
        if (req.getStarred() != null) entry.setIsStarred(req.getStarred());
        if (req.getImportant() != null) entry.setIsImportant(req.getImportant());
        if (req.getFolder() != null) {
            // Target may be a system key ("ARCHIVE"/"TRASH") or a custom folder id;
            // resolveByKeyOrId walls it to the caller. DRAFTS/SENT can't be moved into.
            MailFolder target = mailFolderService.resolveByKeyOrId(caller, req.getFolder());
            if ("DRAFTS".equals(target.getSystemKey()) || "SENT".equals(target.getSystemKey())) {
                throw new IllegalArgumentException("Cannot move a message into a system folder.");
            }
            entry.setFolderRef(target);
        }
        mailboxRepository.save(entry);
        return toDetail(entry.getMessage(), entry, caller);
    }

    @Transactional
    public void softDelete(MailPrincipal principal, Long id) {
        MailAccount caller = loadCaller(principal);
        MailMailboxEntry entry = requireEntry(caller, id);
        entry.setFolderRef(mailFolderService.systemFolder(caller, Folder.TRASH));
        mailboxRepository.save(entry);
    }

    @Transactional
    public void permanentDelete(MailPrincipal principal, Long id) {
        MailAccount caller = loadCaller(principal);
        MailMailboxEntry entry = requireEntry(caller, id);          // a LIVE entry the caller holds
        Long messageId = entry.getMessage().getId();

        // Lock the shared message row so the reference-count-then-act below is
        // atomic per message: two participants permanently deleting the SAME
        // message serialize, and the loser re-counts AFTER the winner's tombstone
        // commits — so they can't both tombstone and strand an un-purgeable orphan.
        if (mailMessageRepository.findByIdForUpdate(messageId).isEmpty()) {
            return; // already purged by a concurrent last-holder delete
        }

        // Reference count: this entry is live, so the count includes it. If it's
        // the ONLY live entry, the caller is the last holder → purge the shared
        // message (rows + blobs). Otherwise just tombstone this participant's view.
        if (mailboxRepository.countByMessage_IdAndDeletedAtIsNull(messageId) <= 1) {
            purgeMessage(messageId);
        } else {
            entry.setDeletedAt(LocalDateTime.now());   // tombstone — excluded from all views
            mailboxRepository.save(entry);
        }
    }

    /**
     * Purge a shared message no participant holds anymore: best-effort blob
     * deletes first (never blocking), then the attachment / recipient / entry
     * rows, then any inbound in_reply_to references, then the message itself.
     * Bulk DML runs immediately so child rows are gone before the message
     * delete (FKs have no ON DELETE rule).
     */
    private void purgeMessage(Long messageId) {
        for (com.spire.backend.mail.entity.MailAttachment a : mailAttachmentRepository.findByMessage_Id(messageId)) {
            try {
                blobStore.delete(a.getStorageKey());   // idempotent + best-effort
            } catch (Exception e) {
                // Never let a failed blob delete block the DB purge — an orphaned
                // object is recoverable; a half-purge that strands the message is worse.
                log.warn("Best-effort attachment blob delete failed (message {}): {}", messageId, e.toString());
            }
        }
        mailAttachmentRepository.purgeByMessageId(messageId);
        mailRecipientRepository.purgeByMessageId(messageId);
        mailboxRepository.purgeByMessageId(messageId);
        mailMessageRepository.clearInReplyTo(messageId);
        mailMessageRepository.deleteById(messageId);
    }

    /**
     * Purge all of an account's mail data when its mailbox is hard-deleted:
     * every message it SENT is fully purged (the sender FK is NOT NULL, so those
     * rows must go — this also removes recipients' copies + attachments + blobs);
     * every entry it holds is removed (received mail — any message thereby left
     * with no holders is purged); and its recipient rows on messages still held
     * by others are deleted. Called from the account hard-purge, never a request.
     */
    @Transactional
    public void purgeAccountMailData(Long accountId) {
        for (MailMessage m : mailMessageRepository.findBySender_Id(accountId)) {
            purgeMessage(m.getId());
        }
        for (MailMailboxEntry e : mailboxRepository.findByAccount_Id(accountId)) {
            Long msgId = e.getMessage().getId();
            mailboxRepository.delete(e);
            if (mailboxRepository.countByMessage_Id(msgId) == 0) {
                purgeMessage(msgId);   // orphaned received message — nobody holds it anymore
            }
        }
        mailRecipientRepository.deleteByRecipient_Id(accountId);
    }

    // ─── Contacts / counts ──────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<MailContactDto> contacts(MailPrincipal principal, String q) {
        MailAccount caller = loadCaller(principal);
        String like = "%" + (q == null ? "" : q.trim().toLowerCase()) + "%";
        Specification<MailAccount> spec = (root, query, cb) -> cb.and(
                cb.equal(root.get("domain").get("id"), caller.getDomain().getId()),
                cb.equal(root.get("status"), MailAccount.Status.ACTIVE),
                cb.notEqual(root.get("id"), caller.getId()),
                cb.or(
                        cb.like(cb.lower(root.<String>get("localPart")), like),
                        cb.like(cb.lower(cb.coalesce(root.<String>get("displayName"), "")), like)));
        return mailAccountRepository.findAll(spec, PageRequest.of(0, 10, Sort.by("localPart")))
                .getContent().stream()
                .map(a -> MailContactDto.builder()
                        .id(a.getId()).email(emailOf(a))
                        .displayName(a.getDisplayName()).role(a.getRole().name()).build())
                .toList();
    }

    @Transactional(readOnly = true)
    public Map<String, Long> unreadCounts(MailPrincipal principal) {
        MailAccount caller = loadCaller(principal);
        return mailFolderService.systemUnreadCounts(caller);   // {INBOX:n, SENT:0, ...} by system key
    }

    // ─── Internals ──────────────────────────────────────────────────

    private record Resolved(MailAccount account, Type type) {}

    private MailAccount loadCaller(MailPrincipal principal) {
        MailAccount caller = mailAccountRepository.findById(principal.accountId())
                .orElseThrow(() -> new UnauthorizedException("Session is no longer valid."));
        if (caller.getStatus() != MailAccount.Status.ACTIVE
                || Boolean.FALSE.equals(caller.getDomain().getIsActive())) {
            throw new UnauthorizedException("Session is no longer valid.");
        }
        return caller;
    }

    /** Resolve + wall every recipient; any failure rejects the whole set. */
    private List<Resolved> resolveAll(MailComposeRequest req, MailAccount sender) {
        List<Resolved> out = new ArrayList<>();
        collect(out, req.getTo(), Type.TO, sender);
        collect(out, req.getCc(), Type.CC, sender);
        collect(out, req.getBcc(), Type.BCC, sender);
        return out;
    }

    private void collect(List<Resolved> out, List<String> addrs, Type type, MailAccount sender) {
        if (addrs == null) return;
        for (String raw : addrs) {
            if (raw == null || raw.isBlank()) continue;
            out.add(new Resolved(resolveOne(raw, sender), type));
        }
    }

    private MailAccount resolveOne(String raw, MailAccount sender) {
        String t = raw.trim().toLowerCase();
        String localPart;
        if (t.indexOf('@') >= 0) {
            String[] parts;
            try {
                parts = MailAuthService.splitEmail(t);
            } catch (IllegalArgumentException e) {
                throw new IllegalArgumentException(RECIPIENT_REJECT);
            }
            if (!parts[1].equals(sender.getDomain().getDomain())) {  // cross-domain → walled out
                throw new IllegalArgumentException(RECIPIENT_REJECT);
            }
            localPart = parts[0];
        } else {
            localPart = t;
        }
        MailAccount acct = mailAccountRepository
                .findByLocalPartAndDomain_Id(localPart, sender.getDomain().getId())
                .orElseThrow(() -> new IllegalArgumentException(RECIPIENT_REJECT));
        if (acct.getStatus() != MailAccount.Status.ACTIVE) {
            throw new IllegalArgumentException(RECIPIENT_REJECT);
        }
        return acct;
    }

    private MailMessage resolveParent(Long inReplyToId, MailAccount sender) {
        if (inReplyToId == null) return null;
        MailMessage parent = mailMessageRepository.findById(inReplyToId)
                .orElseThrow(() -> new ResourceNotFoundException("MailMessage", "id", inReplyToId));
        // The sender must actually be a participant in the parent.
        mailboxRepository.findByAccount_IdAndMessage_IdAndDeletedAtIsNull(sender.getId(), inReplyToId)
                .orElseThrow(() -> new ResourceNotFoundException("MailMessage", "id", inReplyToId));
        return parent;
    }

    private MailMessage persistMessage(MailAccount sender, MailComposeRequest req, MailMessage parent) {
        MailMessage msg = mailMessageRepository.save(MailMessage.builder()
                .sender(sender)
                .subject(blankToNull(req.getSubject()))
                .bodyHtml(req.getBodyHtml())
                .bodyText(req.getBodyText())
                .messageUid(UUID.randomUUID().toString())
                .inReplyTo(parent)
                .hasAttachments(false)
                .threadId(parent != null ? parent.getThreadId() : null)
                .build());
        if (msg.getThreadId() == null) {           // new conversation → root is itself
            msg.setThreadId(msg.getId());
            msg = mailMessageRepository.save(msg);
        }
        return msg;
    }

    private void persistRecipients(MailMessage msg, List<Resolved> resolved) {
        for (Resolved r : resolved) {
            mailRecipientRepository.save(MailMessageRecipient.builder()
                    .message(msg).recipient(r.account()).type(r.type()).build());
        }
    }

    /** Fresh SENT entry for the sender (read) + INBOX entries for recipients.
     *  Used by send(); sendDraft() reuses the existing draft row instead. */
    private void deliver(MailAccount sender, MailMessage msg, List<Resolved> resolved) {
        mailboxRepository.save(entry(sender, msg, Folder.SENT, true));
        deliverToRecipients(sender, msg, resolved);
    }

    /** One inbound entry per distinct recipient (excluding the sender), routed +
     *  flagged by the recipient's own inbox rules (Phase 17, fail-open). */
    private void deliverToRecipients(MailAccount sender, MailMessage msg, List<Resolved> resolved) {
        Set<Long> seen = new HashSet<>();
        seen.add(sender.getId());
        MailRuleEngine.MessageFacts facts = buildFacts(sender, msg, resolved);
        List<Delivery> delivered = new ArrayList<>();
        for (Resolved r : resolved) {
            if (seen.add(r.account().getId())) {
                MailMailboxEntry saved = mailboxRepository.save(inboundEntryFor(r.account(), msg, facts));
                // The event carries the ACTUAL folder the entry landed in — a rule's
                // destination folder when one applied, else the recipient's Inbox.
                delivered.add(new Delivery(r.account().getId(), saved.getFolderRef().getId()));
            }
        }
        publishNewMailAfterCommit(sender, msg, delivered);
    }

    /** A delivered inbox entry: the recipient account and the folder it landed in. */
    private record Delivery(Long accountId, Long folderId) {}

    /** Message fields the rules engine matches on, materialized once per send.
     *  TO/CC are the visible envelope (BCC is hidden — no BCC condition exists). */
    private MailRuleEngine.MessageFacts buildFacts(MailAccount sender, MailMessage msg, List<Resolved> resolved) {
        List<String> to = new ArrayList<>();
        List<String> cc = new ArrayList<>();
        for (Resolved r : resolved) {
            if (r.type() == Type.TO) to.add(emailOf(r.account()));
            else if (r.type() == Type.CC) cc.add(emailOf(r.account()));
        }
        return new MailRuleEngine.MessageFacts(
                emailOf(sender), to, cc, msg.getSubject(), Boolean.TRUE.equals(msg.getHasAttachments()));
    }

    /**
     * Build the recipient's inbound entry from their inbox-rules decision.
     * Ultimate fail-open: if the engine itself were to fail, the message is
     * STILL delivered to Inbox/unread — a rule must never drop a message.
     */
    private MailMailboxEntry inboundEntryFor(MailAccount recipient, MailMessage msg, MailRuleEngine.MessageFacts facts) {
        try {
            MailRuleEngine.DeliveryDecision d = mailRuleEngine.resolveDelivery(recipient, facts);
            return MailMailboxEntry.builder()
                    .account(recipient).message(msg)
                    .folder(enumOf(d.folder()))     // vestigial enum, kept non-null
                    .folderRef(d.folder())          // source of truth (rule destination or Inbox)
                    .isRead(d.read()).isStarred(d.starred()).isImportant(d.important())
                    .build();
        } catch (Exception e) {
            log.warn("Rule engine error for account {}; delivering to Inbox. {}", recipient.getId(), e.toString());
            return entry(recipient, msg, Folder.INBOX, false);
        }
    }

    /** The vestigial enum for an entry's folder: the matching system value when
     *  the target is a system folder, else INBOX (a custom folder has none). */
    private Folder enumOf(MailFolder f) {
        if (f.getSystemKey() != null) {
            try { return Folder.valueOf(f.getSystemKey()); } catch (IllegalArgumentException ignore) { /* custom */ }
        }
        return Folder.INBOX;
    }

    /**
     * Best-effort live new-mail push to each recipient — AFTER the send commits,
     * so a client that resyncs on the event sees the new INBOX entry. A failed
     * publish is logged and NEVER breaks the send. Walled: only the resolved
     * recipient accounts are notified. Sender display/subject are materialized
     * here (the session is still open) so the off-thread SSE fan-out reads only
     * plain values — never a lazy JPA association.
     */
    private void publishNewMailAfterCommit(MailAccount sender, MailMessage msg, List<Delivery> deliveries) {
        if (deliveries.isEmpty()) return;
        final String fromName = sender.getDisplayName();
        final String fromEmail = emailOf(sender);
        final String subject = msg.getSubject();
        final Long messageId = msg.getId();
        Runnable publish = () -> deliveries.forEach(d -> safePublishNewMail(
                d.accountId(),
                new MailSseService.NewMailEvent(d.folderId(), messageId, fromName, fromEmail, subject)));
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override public void afterCommit() { publish.run(); }
            });
        } else {
            publish.run();
        }
    }

    private void safePublishNewMail(Long accountId, MailSseService.NewMailEvent event) {
        try {
            mailSseService.publishNewMail(accountId, event);
        } catch (Exception e) {
            log.warn("SSE new-mail publish failed for account {} (message {}): {}", accountId, event.messageId(), e.toString());
        }
    }

    private MailMailboxEntry entry(MailAccount account, MailMessage msg, Folder folder, boolean read) {
        return MailMailboxEntry.builder()
                .account(account).message(msg)
                .folder(folder)                                              // vestigial, kept non-null
                .folderRef(mailFolderService.systemFolder(account, folder))  // source of truth (Phase 14)
                .isRead(read).build();
    }

    private MailMailboxEntry requireEntry(MailAccount caller, Long messageId) {
        return mailboxRepository.findByAccount_IdAndMessage_IdAndDeletedAtIsNull(caller.getId(), messageId)
                .orElseThrow(() -> new ResourceNotFoundException("MailMessage", "id", messageId));
    }

    private MailMailboxEntry ownDraft(MailAccount sender, Long messageId) {
        // Pessimistic write lock: serializes a draft mutation/send against a
        // concurrent attachment change on the same draft (TOCTOU guard).
        MailMailboxEntry entry = mailboxRepository
                .findWithLockByAccount_IdAndMessage_IdAndDeletedAtIsNull(sender.getId(), messageId)
                .orElseThrow(() -> new ResourceNotFoundException("MailMessage", "id", messageId));
        if (!isDraftFolder(entry)) {
            throw new IllegalArgumentException("That message is not a draft.");
        }
        return entry;
    }

    /** True when the entry lives in the caller's DRAFTS folder (folder_id, with a
     *  vestigial-enum fallback for any not-yet-backfilled row). */
    private boolean isDraftFolder(MailMailboxEntry e) {
        if (e.getFolderRef() != null) return "DRAFTS".equals(e.getFolderRef().getSystemKey());
        return e.getFolder() == Folder.DRAFTS;
    }

    // ─── Mapping ────────────────────────────────────────────────────

    private List<MailMessageSummary> toSummaries(List<MailMailboxEntry> entries) {
        if (entries.isEmpty()) return List.of();
        List<Long> msgIds = entries.stream().map(e -> e.getMessage().getId()).toList();
        Map<Long, List<String>> visibleTo = new HashMap<>();
        for (MailMessageRecipient r : mailRecipientRepository.findByMessage_IdIn(msgIds)) {
            if (r.getType() == Type.BCC) continue;   // BCC never shown in listings
            visibleTo.computeIfAbsent(r.getMessage().getId(), k -> new ArrayList<>()).add(emailOf(r.getRecipient()));
        }
        List<MailMessageSummary> out = new ArrayList<>(entries.size());
        for (MailMailboxEntry e : entries) {
            MailMessage m = e.getMessage();
            out.add(MailMessageSummary.builder()
                    .messageId(m.getId()).threadId(m.getThreadId())
                    .from(emailOf(m.getSender())).fromName(m.getSender().getDisplayName())
                    .to(visibleTo.getOrDefault(m.getId(), List.of()))
                    .subject(m.getSubject()).snippet(snippet(m.getBodyText()))
                    .createdAt(m.getCreatedAt())
                    .read(e.getIsRead()).starred(e.getIsStarred()).important(e.getIsImportant())
                    .hasAttachments(m.getHasAttachments())
                    .folder(folderLabel(e)).folderId(folderIdOf(e))
                    .build());
        }
        return out;
    }

    private MailMessageDetail toDetail(MailMessage m, MailMailboxEntry entry, MailAccount caller) {
        return toDetail(m, entry, caller, attachmentSummaries(m.getId()));
    }

    /** Variant taking pre-fetched attachments (used by the batched thread view). */
    private MailMessageDetail toDetail(MailMessage m, MailMailboxEntry entry, MailAccount caller,
                                       List<MailAttachmentSummary> attachments) {
        List<MailMessageRecipient> rows = mailRecipientRepository.findByMessage_Id(m.getId());
        boolean isSender = m.getSender().getId().equals(caller.getId());
        return MailMessageDetail.builder()
                .messageId(m.getId()).threadId(m.getThreadId()).messageUid(m.getMessageUid())
                .from(emailOf(m.getSender())).fromName(m.getSender().getDisplayName())
                .to(emailsOfType(rows, Type.TO))
                .cc(emailsOfType(rows, Type.CC))
                .bcc(isSender ? emailsOfType(rows, Type.BCC) : null) // recipients never see BCC
                .subject(m.getSubject()).bodyHtml(m.getBodyHtml()).bodyText(m.getBodyText())
                .createdAt(m.getCreatedAt()).hasAttachments(m.getHasAttachments())
                .inReplyToId(m.getInReplyTo() != null ? m.getInReplyTo().getId() : null)
                .attachments(attachments)
                .folder(folderLabel(entry)).folderId(folderIdOf(entry))
                .read(entry.getIsRead()).starred(entry.getIsStarred()).important(entry.getIsImportant())
                .build();
    }

    /** Display key for the entry's folder: the system key (INBOX/…) for system
     *  folders, else the custom folder's name; enum fallback pre-backfill. */
    private String folderLabel(MailMailboxEntry e) {
        MailFolder f = e.getFolderRef();
        if (f != null) return f.getSystemKey() != null ? f.getSystemKey() : f.getName();
        return e.getFolder() != null ? e.getFolder().name() : null;
    }

    private Long folderIdOf(MailMailboxEntry e) {
        return e.getFolderRef() != null ? e.getFolderRef().getId() : null;
    }

    private List<com.spire.backend.mail.dto.MailAttachmentSummary> attachmentSummaries(Long messageId) {
        return mailAttachmentRepository.findByMessage_Id(messageId).stream()
                .map(a -> com.spire.backend.mail.dto.MailAttachmentSummary.builder()
                        .id(a.getId()).filename(a.getFilename())
                        .contentType(a.getContentType()).sizeBytes(a.getSizeBytes()).build())
                .toList();
    }

    private List<String> emailsOfType(List<MailMessageRecipient> rows, Type type) {
        return rows.stream().filter(r -> r.getType() == type).map(r -> emailOf(r.getRecipient())).toList();
    }

    private String emailOf(MailAccount a) {
        return a.getLocalPart() + "@" + a.getDomain().getDomain();
    }

    private String snippet(String body) {
        if (body == null) return "";
        String s = body.replaceAll("\\s+", " ").trim();
        return s.length() > 140 ? s.substring(0, 140) + "…" : s;
    }

    private String blankToNull(String s) {
        return (s == null || s.isBlank()) ? null : s;
    }
}
