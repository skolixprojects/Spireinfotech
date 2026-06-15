package com.spire.backend.mail.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

/**
 * A walled mail domain. Every {@link MailAccount} and (in later
 * phases) every message belongs to exactly ONE domain — recipient
 * lookup and delivery never cross a domain boundary. The mail module
 * is a SEPARATE staff identity space with no link to the LMS
 * {@code users} table; this is part of that self-contained world.
 */
@Entity
@Table(name = "mail_domains")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MailDomain {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 255)
    private String domain;

    @Column(name = "entity_name", nullable = false, length = 255)
    private String entityName;

    @Column(name = "is_active", nullable = false)
    @Builder.Default
    private Boolean isActive = true;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;
}
