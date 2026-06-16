package com.spire.backend.mail.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

/**
 * A per-account inbox rule (Phase 17). Evaluated on inbound delivery only —
 * conditions -&gt; actions decide where a recipient's new message lands and how
 * it's flagged. Strictly per-account: a rule affects only its owner's delivery
 * and any MOVE target must be a folder the owner owns.
 *
 * <p>Conditions and actions are stored as portable JSON TEXT (parsed via
 * Jackson into {@link com.spire.backend.mail.dto.RuleCondition} /
 * {@link com.spire.backend.mail.dto.RuleAction}) — NOT a DB JSON type and NOT
 * child tables, so the schema is created by ddl-auto and is DB-portable.
 *
 * <p>Evaluation is FAIL-OPEN (see {@code MailRuleEngine}): any error delivers
 * the message to Inbox/unread rather than dropping or failing it.
 */
@Entity
@Table(name = "mail_rules", indexes = {
        @Index(name = "idx_mail_rule_acct", columnList = "account_id"),
        @Index(name = "idx_mail_rule_acct_enabled", columnList = "account_id, enabled")
})
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MailRule {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "account_id", nullable = false)
    private MailAccount account;

    @Column(nullable = false, length = 255)
    private String name;

    /** Evaluation order, ascending (ties broken by id). */
    @Column(nullable = false)
    @Builder.Default
    private Integer priority = 0;

    @Column(nullable = false)
    @Builder.Default
    private Boolean enabled = true;

    /** ALL = every condition must match; ANY = at least one. */
    @Enumerated(EnumType.STRING)
    @Column(name = "match_mode", nullable = false, length = 8)
    @Builder.Default
    private MatchMode matchMode = MatchMode.ALL;

    /** When true, a match stops evaluation of any lower-priority rules. */
    @Column(name = "stop_processing", nullable = false)
    @Builder.Default
    private Boolean stopProcessing = false;

    /** JSON array of {@link com.spire.backend.mail.dto.RuleCondition}. */
    @Column(name = "conditions_json", columnDefinition = "TEXT")
    private String conditionsJson;

    /** JSON array of {@link com.spire.backend.mail.dto.RuleAction}. */
    @Column(name = "actions_json", columnDefinition = "TEXT")
    private String actionsJson;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    public enum MatchMode { ALL, ANY }
}
