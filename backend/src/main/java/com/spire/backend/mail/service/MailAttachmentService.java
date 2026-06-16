package com.spire.backend.mail.service;

import com.spire.backend.exception.ResourceNotFoundException;
import com.spire.backend.exception.UnauthorizedException;
import com.spire.backend.mail.dto.MailAttachmentSummary;
import com.spire.backend.mail.entity.MailAccount;
import com.spire.backend.mail.entity.MailAttachment;
import com.spire.backend.mail.entity.MailMailboxEntry;
import com.spire.backend.mail.entity.MailMessage;
import com.spire.backend.mail.repository.MailAccountRepository;
import com.spire.backend.mail.repository.MailAttachmentRepository;
import com.spire.backend.mail.repository.MailMailboxEntryRepository;
import com.spire.backend.mail.repository.MailMessageRepository;
import com.spire.backend.mail.security.MailPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;

/**
 * Attachment lifecycle. Add/remove are restricted to a DRAFT the caller
 * owns; downloads go through a walled proxy that checks the caller has a
 * mailbox entry for the parent message BEFORE serving bytes. The raw
 * blob URL is never returned to clients (see {@link MailBlobStore}).
 */
@Service
@RequiredArgsConstructor
public class MailAttachmentService {

    @Value("${mail.attachment-max-bytes}")
    private long maxBytes;

    private final MailBlobStore blobStore;
    private final MailAccountRepository mailAccountRepository;
    private final MailMessageRepository mailMessageRepository;
    private final MailMailboxEntryRepository mailboxRepository;
    private final MailAttachmentRepository mailAttachmentRepository;

    // Self-reference so download() can call the @Transactional resolveDownload()
    // through the proxy (a plain this.call would bypass the tx boundary).
    @Lazy
    @Autowired
    private MailAttachmentService self;

    public record Download(byte[] data, String contentType, String filename) {}

    /** Authorized scalars for a download — resolved inside a tx, fetched outside it. */
    public record DownloadRef(String storageKey, String contentType, String filename) {}

    /**
     * Add an attachment to a draft. Orchestrated so the (possibly remote) blob
     * write never holds a DB transaction, connection, or row lock:
     *   1. validate size + draft ownership in a short read tx (fail fast);
     *   2. store the blob OUTSIDE any tx;
     *   3. persist the row in a short write tx that re-locks + re-asserts the
     *      draft (TOCTOU guard); if the draft was sent/deleted meanwhile, the
     *      just-stored blob is cleaned up so nothing is orphaned.
     * Calls go through {@code self} so the @Transactional helpers are proxied.
     */
    public MailAttachmentSummary upload(MailPrincipal principal, Long draftId, MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("File is empty.");
        }
        if (file.getSize() > maxBytes) {
            throw new IllegalArgumentException(
                    "Attachment exceeds the maximum size of " + (maxBytes / (1024 * 1024)) + " MB.");
        }
        self.assertUploadTarget(principal, draftId);

        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (java.io.IOException e) {
            throw new IllegalStateException("Could not read the uploaded file.", e);
        }
        String storageKey = blobStore.store(bytes);
        try {
            return self.persistAttachment(principal, draftId, file, storageKey);
        } catch (RuntimeException e) {
            // The draft was sent/deleted between validation and persist (or the
            // insert failed) — don't strand the blob we just wrote.
            blobStore.delete(storageKey);
            throw e;
        }
    }

    /** Fail-fast authorization before the (expensive) blob write — no write lock held. */
    @Transactional(readOnly = true)
    public void assertUploadTarget(MailPrincipal principal, Long draftId) {
        ownDraftNoLock(loadCaller(principal), draftId);
    }

    /** Persist the attachment row under a short write tx that re-locks the draft. */
    @Transactional
    public MailAttachmentSummary persistAttachment(MailPrincipal principal, Long draftId,
                                                   MultipartFile file, String storageKey) {
        MailAccount caller = loadCaller(principal);
        MailMessage msg = ownDraft(caller, draftId).getMessage(); // pessimistic lock + re-assert DRAFTS

        MailAttachment att = mailAttachmentRepository.save(MailAttachment.builder()
                .message(msg)
                .filename(sanitizeName(file.getOriginalFilename()))
                .contentType(file.getContentType())
                .sizeBytes(file.getSize())
                .storageKey(storageKey)
                .build());

        if (!Boolean.TRUE.equals(msg.getHasAttachments())) {
            msg.setHasAttachments(true);
            mailMessageRepository.save(msg);
        }
        return toSummary(att);
    }

    @Transactional
    public void remove(MailPrincipal principal, Long attachmentId) {
        MailAccount caller = loadCaller(principal);
        MailAttachment att = mailAttachmentRepository.findById(attachmentId)
                .orElseThrow(() -> new ResourceNotFoundException("MailAttachment", "id", attachmentId));
        MailMessage msg = att.getMessage();
        // Must be a draft the caller owns (also rejects already-sent messages).
        // A missing entry is reported against the attachment id the caller
        // supplied — never the parent message id (non-enumerating, matches download).
        try {
            ownDraft(caller, msg.getId());
        } catch (ResourceNotFoundException e) {
            throw new ResourceNotFoundException("MailAttachment", "id", attachmentId);
        }

        final String key = att.getStorageKey();
        mailAttachmentRepository.delete(att);
        if (mailAttachmentRepository.countByMessage_Id(msg.getId()) == 0) {
            msg.setHasAttachments(false);
            mailMessageRepository.save(msg);
        }
        // Destroy the blob only AFTER the row is durably removed, so a rollback
        // can never strand a live row over a deleted blob.
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override public void afterCommit() { blobStore.delete(key); }
        });
    }

    /**
     * Walled download. The DB resolve + authorization happens in a short
     * read-only tx; the blob fetch runs OUTSIDE any tx so the pooled JDBC
     * connection is never held across the (possibly remote) blob read.
     */
    public Download download(MailPrincipal principal, Long attachmentId) {
        DownloadRef ref = self.resolveDownload(principal, attachmentId);
        byte[] data;
        try {
            data = blobStore.fetch(ref.storageKey());
        } catch (MailBlobStore.BlobNotFoundException e) {
            // The blob is gone (e.g. evicted/cleaned out-of-band) — 404, no internal detail.
            throw new ResourceNotFoundException("MailAttachment", "id", attachmentId);
        }
        return new Download(data, ref.contentType(), ref.filename());
    }

    /** Resolve + authorize a download inside a tx; returns only the scalars needed. */
    @Transactional(readOnly = true)
    public DownloadRef resolveDownload(MailPrincipal principal, Long attachmentId) {
        MailAccount caller = loadCaller(principal);
        MailAttachment att = mailAttachmentRepository.findById(attachmentId)
                .orElseThrow(() -> new ResourceNotFoundException("MailAttachment", "id", attachmentId));
        // 404 (not 403) when the caller has no entry — non-enumerating.
        mailboxRepository.findByAccount_IdAndMessage_IdAndDeletedAtIsNull(caller.getId(), att.getMessage().getId())
                .orElseThrow(() -> new ResourceNotFoundException("MailAttachment", "id", attachmentId));
        String ct = (att.getContentType() == null || att.getContentType().isBlank())
                ? "application/octet-stream" : att.getContentType();
        return new DownloadRef(att.getStorageKey(), ct, att.getFilename());
    }

    // ─── helpers ──

    private MailAccount loadCaller(MailPrincipal principal) {
        MailAccount caller = mailAccountRepository.findById(principal.accountId())
                .orElseThrow(() -> new UnauthorizedException("Session is no longer valid."));
        if (caller.getStatus() != MailAccount.Status.ACTIVE
                || Boolean.FALSE.equals(caller.getDomain().getIsActive())) {
            throw new UnauthorizedException("Session is no longer valid.");
        }
        return caller;
    }

    /**
     * The caller's own DRAFTS entry for the message, or 404/400. Takes a
     * pessimistic write lock on the entry so an attachment change serializes
     * against a concurrent send of the same draft (TOCTOU guard).
     */
    private MailMailboxEntry ownDraft(MailAccount caller, Long messageId) {
        MailMailboxEntry entry = mailboxRepository
                .findWithLockByAccount_IdAndMessage_IdAndDeletedAtIsNull(caller.getId(), messageId)
                .orElseThrow(() -> new ResourceNotFoundException("MailMessage", "id", messageId));
        if (entry.getFolder() != MailMailboxEntry.Folder.DRAFTS) {
            throw new IllegalArgumentException("Attachments can only be changed on a draft.");
        }
        return entry;
    }

    /** Non-locking variant for the fail-fast pre-check (no write lock acquired). */
    private MailMailboxEntry ownDraftNoLock(MailAccount caller, Long messageId) {
        MailMailboxEntry entry = mailboxRepository
                .findByAccount_IdAndMessage_IdAndDeletedAtIsNull(caller.getId(), messageId)
                .orElseThrow(() -> new ResourceNotFoundException("MailMessage", "id", messageId));
        if (entry.getFolder() != MailMailboxEntry.Folder.DRAFTS) {
            throw new IllegalArgumentException("Attachments can only be changed on a draft.");
        }
        return entry;
    }

    private MailAttachmentSummary toSummary(MailAttachment a) {
        return MailAttachmentSummary.builder()
                .id(a.getId()).filename(a.getFilename())
                .contentType(a.getContentType()).sizeBytes(a.getSizeBytes()).build();
    }

    private String sanitizeName(String name) {
        if (name == null || name.isBlank()) return "attachment";
        // Drop any path components a client might send.
        String base = name.replace("\\", "/");
        base = base.substring(base.lastIndexOf('/') + 1).trim();
        return base.isEmpty() ? "attachment" : base;
    }
}
