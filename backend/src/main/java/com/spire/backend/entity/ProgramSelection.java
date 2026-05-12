package com.spire.backend.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

/**
 * Captures the participant's program choice up-front. Used to scope
 * later phases (skillset, target role, coaching preference) and to
 * decide which DocuSign template + payment plan to issue.
 *
 * One row per selection — admins can re-issue a participant on a
 * new program by inserting a new row rather than mutating the old
 * one, preserving the audit trail.
 */
@Entity
@Table(name = "program_selections", indexes = {
        @Index(name = "idx_progsel_user_id", columnList = "user_id")
})
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ProgramSelection {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "program", length = 100)
    private String program;

    /** PHASE_1, PHASE_2, … */
    @Column(name = "phase", length = 20)
    private String phase;

    @Column(name = "skillset", length = 255)
    private String skillset;

    @Column(name = "target_job_title", length = 255)
    private String targetJobTitle;

    @Column(name = "coaching_preference", length = 100)
    private String coachingPreference;

    @Column(name = "availability", length = 100)
    private String availability;

    @Column(name = "service_package", length = 100)
    private String servicePackage;

    @CreationTimestamp
    @Column(name = "selection_date", updatable = false)
    private LocalDateTime selectionDate;
}
