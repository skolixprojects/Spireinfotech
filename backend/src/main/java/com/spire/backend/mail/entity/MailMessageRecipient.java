package com.spire.backend.mail.entity;

import jakarta.persistence.*;
import lombok.*;

/**
 * One row per (message, recipient, type) — the addressing envelope of a
 * message. Separate from {@link MailMailboxEntry}, which carries the
 * recipient's own folder/flags. {@code type} is stored as
 * {@code recipient_type} to avoid any reserved-word friction across DBs.
 */
@Entity
@Table(name = "mail_message_recipients", indexes = {
        @Index(name = "idx_mail_recipient_acct", columnList = "recipient_account_id"),
        @Index(name = "idx_mail_recipient_msg", columnList = "message_id")
})
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MailMessageRecipient {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "message_id", nullable = false)
    private MailMessage message;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "recipient_account_id", nullable = false)
    private MailAccount recipient;

    @Enumerated(EnumType.STRING)
    @Column(name = "recipient_type", nullable = false, length = 4)
    private Type type;

    public enum Type {
        TO, CC, BCC
    }
}
