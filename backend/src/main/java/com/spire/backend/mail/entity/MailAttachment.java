package com.spire.backend.mail.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

/**
 * A file attached to a message. Draft-anchored: always belongs to a
 * message via a NOT-NULL FK. Only the opaque {@code storageKey} (the
 * blob store's id — a Cloudinary raw public_id in prod) is persisted;
 * the raw delivery URL is never stored or exposed — downloads are served
 * through the authenticated, walled proxy.
 */
@Entity
@Table(name = "mail_attachments", indexes = {
        @Index(name = "idx_mail_attach_msg", columnList = "message_id")
})
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MailAttachment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "message_id", nullable = false)
    private MailMessage message;

    @Column(nullable = false, length = 255)
    private String filename;

    @Column(name = "content_type", length = 128)
    private String contentType;

    @Column(name = "size_bytes", nullable = false)
    private Long sizeBytes;

    @Column(name = "storage_key", nullable = false, length = 512)
    private String storageKey;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;
}
