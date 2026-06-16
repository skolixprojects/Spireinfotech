package com.spire.backend.mail.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/**
 * One participant's view of a message: their folder + flags. The sender
 * gets a SENT entry (read=true); each recipient an INBOX entry
 * (read=false). All folder listing, flagging, and search operate ONLY
 * over the caller's own entries. Soft-delete moves to TRASH; a permanent
 * delete sets {@code deletedAt} (a tombstone excluded from every view).
 */
@Entity
@Table(name = "mail_mailbox_entries", indexes = {
        @Index(name = "idx_mail_mbox_acct_folder", columnList = "account_id, folder"),
        @Index(name = "idx_mail_mbox_acct_folderid", columnList = "account_id, folder_id"),
        @Index(name = "idx_mail_mbox_msg", columnList = "message_id")
})
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MailMailboxEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "account_id", nullable = false)
    private MailAccount account;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "message_id", nullable = false)
    private MailMessage message;

    /**
     * Vestigial since Phase 14 — the folder model ({@link #folderRef}) is the
     * source of truth. Still written non-null on creation (system folders) to
     * satisfy the live NOT-NULL column; no longer read for routing.
     */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Folder folder;

    /** The folder this entry lives in (Phase 14). Nullable so ddl-auto can add
     *  it to the live table; backfilled from {@link #folder} on boot. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "folder_id")
    private MailFolder folderRef;

    @Column(name = "is_read", nullable = false)
    @Builder.Default
    private Boolean isRead = false;

    @Column(name = "is_starred", nullable = false)
    @Builder.Default
    private Boolean isStarred = false;

    @Column(name = "is_important", nullable = false)
    @Builder.Default
    private Boolean isImportant = false;

    @Column(columnDefinition = "TEXT")
    private String labels;

    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;

    public enum Folder {
        INBOX, SENT, DRAFTS, ARCHIVE, TRASH
    }
}
