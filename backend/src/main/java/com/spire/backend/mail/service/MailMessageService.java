package com.spire.backend.mail.service;

import com.spire.backend.exception.ResourceNotFoundException;
import com.spire.backend.exception.UnauthorizedException;
import com.spire.backend.mail.dto.*;
import com.spire.backend.mail.entity.MailAccount;
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
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

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
public class MailMessageService {

    private static final String RECIPIENT_REJECT = "One or more recipients could not be resolved.";

    private final MailAccountRepository mailAccountRepository;
    private final MailMessageRepository mailMessageRepository;
    private final MailMessageRecipientRepository mailRecipientRepository;
    private final MailMailboxEntryRepository mailboxRepository;

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
        draft.setIsRead(true);
        mailboxRepository.save(draft);
        deliverToRecipients(sender, msg, resolved);
        return toDetail(msg, draft, sender);
    }

    // ─── Read ───────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public MailFolderListing listFolder(MailPrincipal principal, String folderStr, Pageable pageable) {
        MailAccount caller = loadCaller(principal);
        Folder folder = parseFolder(folderStr);
        Page<MailMailboxEntry> page = mailboxRepository
                .findByAccount_IdAndFolderAndDeletedAtIsNullOrderByMessage_CreatedAtDesc(caller.getId(), folder, pageable);
        long unread = mailboxRepository
                .countByAccount_IdAndFolderAndIsReadFalseAndDeletedAtIsNull(caller.getId(), folder);
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
        List<MailMessageDetail> messages = mailMessageRepository
                .findByThreadIdOrderByCreatedAtAscIdAsc(threadId).stream()
                .filter(m -> byMessage.containsKey(m.getId()))
                .map(m -> toDetail(m, byMessage.get(m.getId()), caller))
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
            Folder f = parseFolder(req.getFolder());
            if (f == Folder.DRAFTS || f == Folder.SENT) {
                throw new IllegalArgumentException("Cannot move a message into a system folder.");
            }
            entry.setFolder(f);
        }
        mailboxRepository.save(entry);
        return toDetail(entry.getMessage(), entry, caller);
    }

    @Transactional
    public void softDelete(MailPrincipal principal, Long id) {
        MailAccount caller = loadCaller(principal);
        MailMailboxEntry entry = requireEntry(caller, id);
        entry.setFolder(Folder.TRASH);
        mailboxRepository.save(entry);
    }

    @Transactional
    public void permanentDelete(MailPrincipal principal, Long id) {
        MailAccount caller = loadCaller(principal);
        MailMailboxEntry entry = requireEntry(caller, id);
        entry.setDeletedAt(LocalDateTime.now());   // tombstone — excluded from all views
        mailboxRepository.save(entry);
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
        Map<String, Long> out = new LinkedHashMap<>();
        for (Folder f : Folder.values()) out.put(f.name(), 0L);
        for (Object[] row : mailboxRepository.countUnreadByFolder(caller.getId())) {
            out.put(((Folder) row[0]).name(), (Long) row[1]);
        }
        return out;
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

    /** One INBOX entry per distinct recipient, excluding the sender. */
    private void deliverToRecipients(MailAccount sender, MailMessage msg, List<Resolved> resolved) {
        Set<Long> seen = new HashSet<>();
        seen.add(sender.getId());
        for (Resolved r : resolved) {
            if (seen.add(r.account().getId())) {
                mailboxRepository.save(entry(r.account(), msg, Folder.INBOX, false));
            }
        }
    }

    private MailMailboxEntry entry(MailAccount account, MailMessage msg, Folder folder, boolean read) {
        return MailMailboxEntry.builder()
                .account(account).message(msg).folder(folder).isRead(read).build();
    }

    private MailMailboxEntry requireEntry(MailAccount caller, Long messageId) {
        return mailboxRepository.findByAccount_IdAndMessage_IdAndDeletedAtIsNull(caller.getId(), messageId)
                .orElseThrow(() -> new ResourceNotFoundException("MailMessage", "id", messageId));
    }

    private MailMailboxEntry ownDraft(MailAccount sender, Long messageId) {
        MailMailboxEntry entry = requireEntry(sender, messageId);
        if (entry.getFolder() != Folder.DRAFTS) {
            throw new IllegalArgumentException("That message is not a draft.");
        }
        return entry;
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
                    .hasAttachments(m.getHasAttachments()).folder(e.getFolder().name())
                    .build());
        }
        return out;
    }

    private MailMessageDetail toDetail(MailMessage m, MailMailboxEntry entry, MailAccount caller) {
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
                .folder(entry.getFolder().name())
                .read(entry.getIsRead()).starred(entry.getIsStarred()).important(entry.getIsImportant())
                .build();
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

    private Folder parseFolder(String s) {
        if (s == null || s.isBlank()) throw new IllegalArgumentException("Folder is required.");
        try {
            return Folder.valueOf(s.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Invalid folder: " + s);
        }
    }
}
