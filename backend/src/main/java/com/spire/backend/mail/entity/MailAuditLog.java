package com.spire.backend.mail.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

/**
 * Append-only audit trail of mutating Mail Admin actions. One row is
 * written for every domain/mailbox mutation (create, update, suspend,
 * reactivate, link issuance, role change) so admin activity is
 * reviewable. {@code actorAccount} is the authenticated admin who
 * performed the action; {@code targetType}/{@code targetId} identify
 * what was changed (a MAILBOX or DOMAIN). Never updated after insert.
 */
@Entity
@Table(name = "mail_audit_log", indexes = {
        @Index(name = "idx_mail_audit_actor", columnList = "actor_account_id"),
        @Index(name = "idx_mail_audit_created", columnList = "created_at")
})
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MailAuditLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "actor_account_id", nullable = false)
    private MailAccount actorAccount;

    /** e.g. MAILBOX_CREATE, MAILBOX_SUSPEND, DOMAIN_UPDATE. */
    @Column(nullable = false, length = 64)
    private String action;

    /** MAILBOX | DOMAIN. */
    @Column(name = "target_type", length = 32)
    private String targetType;

    @Column(name = "target_id")
    private Long targetId;

    @Column(columnDefinition = "TEXT")
    private String details;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;
}
