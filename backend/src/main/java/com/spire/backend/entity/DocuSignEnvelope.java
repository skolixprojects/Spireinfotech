package com.spire.backend.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

/**
 * Mirrors a DocuSign envelope on the Spire side. The envelopeId
 * field is the upstream identifier; status reflects the last webhook
 * we received. {@code signedPdfUrl} + {@code certificateUrl} hold
 * the post-signature artifacts so the participant can re-download
 * them from their dashboard without round-tripping to DocuSign.
 */
@Entity
@Table(name = "docusign_envelopes", indexes = {
        @Index(name = "idx_docusign_user_id", columnList = "user_id"),
        @Index(name = "idx_docusign_status", columnList = "status")
})
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DocuSignEnvelope {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "envelope_id", unique = true, length = 100)
    private String envelopeId;

    @Column(name = "agreement_template_version", length = 20)
    private String agreementTemplateVersion;

    @Column(name = "sent_date")
    private LocalDateTime sentDate;

    @Column(name = "completed_date")
    private LocalDateTime completedDate;

    /** PENDING, SENT, DELIVERED, COMPLETED, DECLINED, VOIDED. */
    @Column(name = "status", length = 30)
    @Builder.Default
    private String status = "PENDING";

    @Column(name = "signed_pdf_url", length = 500)
    private String signedPdfUrl;

    @Column(name = "certificate_url", length = 500)
    private String certificateUrl;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;
}
