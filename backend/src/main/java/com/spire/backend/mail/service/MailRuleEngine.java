package com.spire.backend.mail.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.spire.backend.mail.dto.RuleAction;
import com.spire.backend.mail.dto.RuleCondition;
import com.spire.backend.mail.entity.MailAccount;
import com.spire.backend.mail.entity.MailFolder;
import com.spire.backend.mail.entity.MailMailboxEntry.Folder;
import com.spire.backend.mail.entity.MailRule;
import com.spire.backend.mail.repository.MailFolderRepository;
import com.spire.backend.mail.repository.MailRuleRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Per-account inbox-rules engine (Phase 17). Given a recipient and the facts of
 * an inbound message, it decides where the message lands and how it is flagged.
 * Evaluated on delivery ONLY (never on the sender's Sent copy), against the
 * recipient's OWN rules, and any MOVE target must be a folder the recipient owns.
 *
 * <p><b>FAIL-OPEN is the top invariant.</b> The whole evaluation is wrapped in
 * try/catch: on ANY error (malformed JSON, an unexpected exception, etc.) the
 * message is delivered to Inbox/unread and the error logged. Correctness of
 * delivery always beats rules — a rule must never drop or fail a message.
 *
 * <p>Runs inside the caller's send transaction (no own annotation): its reads
 * and the {@link MailFolderService} lookups join that transaction.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class MailRuleEngine {

    private final MailRuleRepository ruleRepository;
    private final MailFolderRepository folderRepository;
    private final MailFolderService folderService;
    private final ObjectMapper objectMapper;

    /** The message fields a rule can match on, materialized by the caller. */
    public record MessageFacts(String from, List<String> to, List<String> cc,
                               String subject, boolean hasAttachment) {}

    /** The delivery outcome: which folder the entry lands in + its flags. */
    public record DeliveryDecision(MailFolder folder, boolean read, boolean starred, boolean important) {}

    /**
     * Resolve the inbound delivery for one recipient. Returns the recipient's
     * Inbox (unread/unstarred/unimportant) unless an enabled rule matches and
     * moves/flags it.
     *
     * <p>Critical for FAIL-OPEN: ALL database access happens BEFORE the try (rule
     * load + folder pre-load). A DB failure there propagates and fails the send —
     * which is correct, since the database being unavailable means we genuinely
     * cannot deliver, exactly as the no-rules path would fail. The try then
     * contains ONLY pure in-memory work (JSON parse + matching + folder-map
     * lookups), so a swallowed rule/logic error can NEVER leave the shared send
     * transaction marked rollback-only (which would silently drop the message at
     * commit). Any such error yields the clean Inbox/unread default.
     */
    public DeliveryDecision resolveDelivery(MailAccount recipient, MessageFacts facts) {
        // ── DB loads (outside the fail-open try; a DB error here fails the send) ──
        Map<Long, MailFolder> byId = new HashMap<>();
        MailFolder inbox = null, trash = null;
        for (MailFolder f : folderRepository.findByAccount_IdOrderBySortOrderAscNameAsc(recipient.getId())) {
            byId.put(f.getId(), f);
            if (Folder.INBOX.name().equals(f.getSystemKey())) inbox = f;
            else if (Folder.TRASH.name().equals(f.getSystemKey())) trash = f;
        }
        // Rare: a recipient missing a system folder — ensure it (still outside the try).
        if (inbox == null) inbox = folderService.systemFolder(recipient, Folder.INBOX);
        if (trash == null) trash = folderService.systemFolder(recipient, Folder.TRASH);
        List<MailRule> rules =
                ruleRepository.findByAccount_IdAndEnabledTrueOrderByPriorityAscIdAsc(recipient.getId());

        // ── Pure evaluation (fail-open): no DB access below this line ──
        MailFolder folder = inbox;
        boolean read = false, starred = false, important = false;
        try {
            for (MailRule rule : rules) {
                List<RuleCondition> conditions = parseConditions(rule.getConditionsJson());
                if (!matches(conditions, rule.getMatchMode(), facts)) continue;
                for (RuleAction action : parseActions(rule.getActionsJson())) {
                    if (action == null || action.getType() == null) continue;
                    switch (action.getType()) {
                        case MARK_READ -> read = true;
                        case STAR -> starred = true;
                        case MARK_IMPORTANT -> important = true;
                        case DELETE -> folder = trash;
                        case MOVE_TO_FOLDER -> {
                            MailFolder target = ownedMoveTarget(byId, action.getTargetFolderId());
                            if (target != null) folder = target;   // else skip (dangling/foreign/system)
                        }
                    }
                }
                if (Boolean.TRUE.equals(rule.getStopProcessing())) break;
            }
            return new DeliveryDecision(folder, read, starred, important);
        } catch (Exception e) {
            // FAIL-OPEN: deliver to Inbox/unread rather than drop/fail the message.
            log.warn("Inbox rules failed for account {} (from {}): delivering to Inbox/unread. {}",
                    recipient.getId(), facts.from(), e.toString());
            return new DeliveryDecision(inbox, false, false, false);
        }
    }

    // ─── Matching ───────────────────────────────────────────────────

    private boolean matches(List<RuleCondition> conditions, MailRule.MatchMode mode, MessageFacts f) {
        if (conditions.isEmpty()) return false;   // a rule with no conditions never fires
        boolean any = false, all = true;
        for (RuleCondition c : conditions) {
            boolean r = evalCondition(c, f);
            any |= r;
            all &= r;
        }
        return mode == MailRule.MatchMode.ANY ? any : all;   // ALL is the default
    }

    private boolean evalCondition(RuleCondition c, MessageFacts f) {
        if (c == null || c.getField() == null) return false;
        return switch (c.getField()) {
            case HAS_ATTACHMENT -> f.hasAttachment();           // operator is IS_TRUE
            case SUBJECT -> strMatch(f.subject(), c);
            case FROM -> strMatch(f.from(), c);
            case TO -> anyMatch(f.to(), c);
            case CC -> anyMatch(f.cc(), c);
        };
    }

    /** Case-insensitive CONTAINS / EQUALS; null/blank comparand or null operator
     *  never matches (a blank needle would otherwise CONTAINS-match everything). */
    private boolean strMatch(String value, RuleCondition c) {
        String needle = c.getValue();
        if (needle == null || needle.isBlank() || c.getOperator() == null) return false;
        String hay = value == null ? "" : value;
        return switch (c.getOperator()) {
            // Locale.ROOT: deterministic, host-locale-independent folding (and
            // consistent with the locale-independent equalsIgnoreCase below).
            case CONTAINS -> hay.toLowerCase(Locale.ROOT).contains(needle.toLowerCase(Locale.ROOT));
            case EQUALS -> hay.equalsIgnoreCase(needle);
            case IS_TRUE -> false;   // not meaningful for a string field
        };
    }

    private boolean anyMatch(List<String> values, RuleCondition c) {
        if (values == null) return false;
        for (String v : values) if (strMatch(v, c)) return true;
        return false;
    }

    // ─── Helpers ────────────────────────────────────────────────────

    /**
     * A MOVE target from the recipient's PRE-LOADED folder map (no DB access) —
     * null (skip the action) when the target id is missing, dangling/foreign, or
     * the owner's own SENT/DRAFTS (inbound mail must never masquerade as
     * sent/draft; mirrors the manual-move guard + create-time validation, and
     * defends legacy/hand-edited rows).
     */
    private MailFolder ownedMoveTarget(Map<Long, MailFolder> byId, Long targetFolderId) {
        if (targetFolderId == null) return null;
        MailFolder f = byId.get(targetFolderId);
        if (f == null) return null;
        String sk = f.getSystemKey();
        if ("SENT".equals(sk) || "DRAFTS".equals(sk)) return null;
        return f;
    }

    private List<RuleCondition> parseConditions(String json) throws Exception {
        if (json == null || json.isBlank()) return List.of();
        return objectMapper.readValue(json, new TypeReference<List<RuleCondition>>() {});
    }

    private List<RuleAction> parseActions(String json) throws Exception {
        if (json == null || json.isBlank()) return List.of();
        return objectMapper.readValue(json, new TypeReference<List<RuleAction>>() {});
    }
}
