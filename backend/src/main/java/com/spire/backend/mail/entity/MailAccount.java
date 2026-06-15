package com.spire.backend.mail.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

/**
 * A mail user — a member of the SEPARATE mail staff population, NOT a
 * Spire/LMS user. Its identity (email + password) is fully its own and
 * never linked to the LMS {@code users} table or Spire RBAC. The
 * {@code role} here drives mail access only, surfaced as a
 * {@code MAIL_<role>} authority by the mail security chain.
 *
 * <p>The email address is split into {@code localPart} + {@code domain}
 * so the walled-per-entity rule can be enforced by domain id. The
 * {@code (local_part, domain_id)} pair is unique — the same local part
 * may exist under different domains.
 */
@Entity
@Table(
        name = "mail_accounts",
        uniqueConstraints = @UniqueConstraint(
                name = "uq_mail_account_local_domain",
                columnNames = {"local_part", "domain_id"}
        )
)
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MailAccount {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "local_part", nullable = false, length = 64)
    private String localPart;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "domain_id", nullable = false)
    private MailDomain domain;

    @Column(name = "password_hash", nullable = false, length = 255)
    private String passwordHash;

    @Column(name = "display_name", length = 255)
    private String displayName;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private Role role = Role.USER;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private Status status = Status.ACTIVE;

    @Column(name = "must_change_password", nullable = false)
    @Builder.Default
    private Boolean mustChangePassword = false;

    @Column(name = "quota_bytes", nullable = false)
    @Builder.Default
    private Long quotaBytes = 0L;

    @Column(name = "last_login_at")
    private LocalDateTime lastLoginAt;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    public enum Role {
        USER, ADMIN, SUPER_ADMIN
    }

    public enum Status {
        ACTIVE, SUSPENDED
    }
}
