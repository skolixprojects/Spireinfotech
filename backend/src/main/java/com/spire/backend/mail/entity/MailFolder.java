package com.spire.backend.mail.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

/**
 * A per-account folder in the mail folder tree. Five SYSTEM folders
 * (INBOX/SENT/DRAFTS/ARCHIVE/TRASH) are seeded per account and are
 * undeletable/unrenamable; CUSTOM folders are arbitrarily nestable under
 * any folder the account owns. Strictly per-account — every folder belongs
 * to exactly one {@link MailAccount} and ops verify ownership.
 *
 * <p>The unique constraint guards (account, parent, name); since SQL treats
 * NULL parents as distinct, root-level duplicate names are also rejected in
 * code (see MailFolderService).
 */
@Entity
@Table(name = "mail_folders",
        uniqueConstraints = {
                @UniqueConstraint(name = "uq_mail_folder_acct_parent_name",
                        columnNames = {"account_id", "parent_folder_id", "name"}),
                // One system folder per (account, key). CUSTOM rows have a NULL
                // system_key (NULLs are distinct), so they're unconstrained — this
                // only blocks duplicate SYSTEM folders from a concurrent first-touch.
                @UniqueConstraint(name = "uq_mail_folder_acct_systemkey",
                        columnNames = {"account_id", "system_key"})
        },
        indexes = {
                @Index(name = "idx_mail_folder_acct_parent", columnList = "account_id, parent_folder_id")
        })
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MailFolder {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "account_id", nullable = false)
    private MailAccount account;

    @Column(nullable = false, length = 255)
    private String name;

    /** Parent in the tree; null = root level. Self-FK. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "parent_folder_id")
    private MailFolder parent;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Kind kind;

    /** For SYSTEM folders only: INBOX/SENT/DRAFTS/ARCHIVE/TRASH. Null for CUSTOM. */
    @Column(name = "system_key", length = 20)
    private String systemKey;

    @Column(name = "sort_order", nullable = false)
    @Builder.Default
    private Integer sortOrder = 0;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    public enum Kind { SYSTEM, CUSTOM }

    public boolean isSystem() {
        return kind == Kind.SYSTEM;
    }
}
