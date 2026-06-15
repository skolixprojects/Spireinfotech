package com.spire.backend.mail.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

/**
 * The canonical message row — one per sent (or drafted) message,
 * independent of how many people received it. Per-recipient delivery is
 * modelled by {@link MailMessageRecipient}; each participant's own
 * folder/flags live on {@link MailMailboxEntry}.
 *
 * <p>{@code threadId} is the id of the conversation's ROOT message (a new
 * conversation's root points at itself); replies inherit their parent's
 * threadId. {@code messageUid} is a generated UUID.
 */
@Entity
@Table(name = "mail_messages", indexes = {
        @Index(name = "idx_mail_msg_thread", columnList = "thread_id"),
        @Index(name = "idx_mail_msg_sender", columnList = "sender_account_id")
})
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MailMessage {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "sender_account_id", nullable = false)
    private MailAccount sender;

    @Column(length = 998)
    private String subject;

    @Column(name = "body_html", columnDefinition = "TEXT")
    private String bodyHtml;

    @Column(name = "body_text", columnDefinition = "TEXT")
    private String bodyText;

    /** Root message id of the conversation (self for a new conversation). */
    @Column(name = "thread_id")
    private Long threadId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "in_reply_to")
    private MailMessage inReplyTo;

    @Column(name = "message_uid", nullable = false, unique = true, length = 255)
    private String messageUid;

    @Column(name = "has_attachments", nullable = false)
    @Builder.Default
    private Boolean hasAttachments = false;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;
}
