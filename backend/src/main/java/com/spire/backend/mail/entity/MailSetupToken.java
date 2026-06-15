package com.spire.backend.mail.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

/**
 * A single-use token for first-time mailbox setup or password reset.
 * Only the SHA-256 hash of the token is stored — the raw value is
 * shown/handed out once and never persisted.
 *
 * <p>The must-change-password login flow writes a single-use
 * {@code CHANGE} row here and hands back the raw token; admin-issued
 * {@code SETUP} / {@code RESET} rows arrive in Phase 2. All three are
 * consumed through the one {@code MailAuthService.setPassword} path.
 */
@Entity
@Table(name = "mail_setup_tokens")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MailSetupToken {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "account_id", nullable = false)
    private MailAccount account;

    @Column(name = "token_hash", nullable = false, length = 255)
    private String tokenHash;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Purpose purpose;

    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    @Column(name = "used_at")
    private LocalDateTime usedAt;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    public enum Purpose {
        SETUP, RESET, CHANGE
    }
}
