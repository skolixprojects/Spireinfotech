package com.spire.backend.mail.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.spire.backend.exception.ResourceNotFoundException;
import com.spire.backend.exception.UnauthorizedException;
import com.spire.backend.mail.dto.MailRuleDto;
import com.spire.backend.mail.dto.MailRuleRequest;
import com.spire.backend.mail.dto.RuleAction;
import com.spire.backend.mail.dto.RuleCondition;
import com.spire.backend.mail.entity.MailAccount;
import com.spire.backend.mail.entity.MailFolder;
import com.spire.backend.mail.entity.MailRule;
import com.spire.backend.mail.repository.MailAccountRepository;
import com.spire.backend.mail.repository.MailFolderRepository;
import com.spire.backend.mail.repository.MailRuleRepository;
import com.spire.backend.mail.security.MailPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashSet;
import java.util.List;

/**
 * Inbox-rules CRUD (Phase 17). Every op re-loads the caller from the
 * authenticated {@link MailPrincipal} and is walled to the caller's own rules;
 * a MOVE action's target folder must be one the caller owns. Conditions/actions
 * are validated for shape, then stored as JSON TEXT on {@link MailRule}.
 */
@Service
@RequiredArgsConstructor
public class MailRuleService {

    private final MailAccountRepository mailAccountRepository;
    private final MailRuleRepository ruleRepository;
    private final MailFolderRepository folderRepository;
    private final ObjectMapper objectMapper;

    @Transactional(readOnly = true)
    public List<MailRuleDto> listRules(MailPrincipal principal) {
        MailAccount caller = loadCaller(principal);
        return ruleRepository.findByAccount_IdOrderByPriorityAscIdAsc(caller.getId())
                .stream().map(this::toDto).toList();
    }

    @Transactional
    public MailRuleDto createRule(MailPrincipal principal, MailRuleRequest req) {
        MailAccount caller = loadCaller(principal);
        validate(req, caller);
        MailRule rule = MailRule.builder()
                .account(caller)
                .name(req.getName().trim())
                .priority(req.getPriority() != null ? req.getPriority() : nextPriority(caller.getId()))
                .enabled(req.getEnabled() == null || req.getEnabled())
                .matchMode(parseMode(req.getMatchMode()))
                .stopProcessing(Boolean.TRUE.equals(req.getStopProcessing()))
                .conditionsJson(toJson(req.getConditions()))
                .actionsJson(toJson(req.getActions()))
                .build();
        return toDto(ruleRepository.save(rule));
    }

    @Transactional
    public MailRuleDto updateRule(MailPrincipal principal, Long id, MailRuleRequest req) {
        MailAccount caller = loadCaller(principal);
        MailRule rule = owned(caller, id);   // resolve ownership first → a missing/foreign id is 404, not a payload 400
        validate(req, caller);
        rule.setName(req.getName().trim());
        if (req.getPriority() != null) rule.setPriority(req.getPriority());
        if (req.getEnabled() != null) rule.setEnabled(req.getEnabled());
        rule.setMatchMode(parseMode(req.getMatchMode()));
        rule.setStopProcessing(Boolean.TRUE.equals(req.getStopProcessing()));
        rule.setConditionsJson(toJson(req.getConditions()));
        rule.setActionsJson(toJson(req.getActions()));
        return toDto(ruleRepository.save(rule));
    }

    @Transactional
    public MailRuleDto setEnabled(MailPrincipal principal, Long id, boolean enabled) {
        MailAccount caller = loadCaller(principal);
        MailRule rule = owned(caller, id);
        rule.setEnabled(enabled);
        return toDto(ruleRepository.save(rule));
    }

    @Transactional
    public void deleteRule(MailPrincipal principal, Long id) {
        MailAccount caller = loadCaller(principal);
        ruleRepository.delete(owned(caller, id));
    }

    /** Reassign priority to match the given order; every id must be the caller's. */
    @Transactional
    public List<MailRuleDto> reorder(MailPrincipal principal, List<Long> ruleIds) {
        MailAccount caller = loadCaller(principal);
        if (ruleIds == null) throw new IllegalArgumentException("ruleIds is required.");
        if (new HashSet<>(ruleIds).size() != ruleIds.size()) {
            throw new IllegalArgumentException("ruleIds must not contain duplicates.");
        }
        int i = 0;
        for (Long id : ruleIds) {
            MailRule rule = owned(caller, id);
            rule.setPriority(i++);
            ruleRepository.save(rule);
        }
        return listRules(principal);
    }

    // ─── Validation / mapping ───────────────────────────────────────

    private void validate(MailRuleRequest req, MailAccount caller) {
        if (req.getPriority() != null && req.getPriority() < 0) {
            throw new IllegalArgumentException("priority must be zero or positive.");
        }
        if (req.getConditions() == null || req.getConditions().isEmpty()) {
            throw new IllegalArgumentException("At least one condition is required.");
        }
        if (req.getActions() == null || req.getActions().isEmpty()) {
            throw new IllegalArgumentException("At least one action is required.");
        }
        for (RuleCondition c : req.getConditions()) {
            if (c == null || c.getField() == null || c.getOperator() == null) {
                throw new IllegalArgumentException("Each condition needs a field and an operator.");
            }
            if (c.getField() != RuleCondition.Field.HAS_ATTACHMENT
                    && (c.getValue() == null || c.getValue().isBlank())) {
                throw new IllegalArgumentException("A value is required for that condition.");
            }
        }
        for (RuleAction a : req.getActions()) {
            if (a == null || a.getType() == null) {
                throw new IllegalArgumentException("Each action needs a type.");
            }
            if (a.getType() == RuleAction.Type.MOVE_TO_FOLDER) {
                if (a.getTargetFolderId() == null) {
                    throw new IllegalArgumentException("A move action needs a target folder.");
                }
                // Walling: the MOVE target must be one the caller owns (else 400).
                MailFolder target = folderRepository.findByIdAndAccount_Id(a.getTargetFolderId(), caller.getId())
                        .orElseThrow(() -> new IllegalArgumentException("The target folder must be one you own."));
                // Parity with the manual-move guard: inbound mail can't be routed
                // into Sent/Drafts (it would masquerade as sent/draft mail).
                String sk = target.getSystemKey();
                if ("SENT".equals(sk) || "DRAFTS".equals(sk)) {
                    throw new IllegalArgumentException("Cannot move messages into the Sent or Drafts folder.");
                }
            }
        }
    }

    private MailRule.MatchMode parseMode(String s) {
        if (s == null || s.isBlank()) return MailRule.MatchMode.ALL;
        try {
            return MailRule.MatchMode.valueOf(s.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("match_mode must be ALL or ANY.");
        }
    }

    private int nextPriority(Long accountId) {
        List<MailRule> all = ruleRepository.findByAccount_IdOrderByPriorityAscIdAsc(accountId);
        return all.isEmpty() ? 0 : all.get(all.size() - 1).getPriority() + 1;
    }

    private MailRule owned(MailAccount caller, Long id) {
        return ruleRepository.findByIdAndAccount_Id(id, caller.getId())
                .orElseThrow(() -> new ResourceNotFoundException("MailRule", "id", id));
    }

    private String toJson(Object o) {
        try {
            return objectMapper.writeValueAsString(o);
        } catch (Exception e) {
            throw new IllegalArgumentException("Invalid rule payload.");
        }
    }

    private MailRuleDto toDto(MailRule r) {
        return MailRuleDto.builder()
                .id(r.getId()).name(r.getName())
                .priority(r.getPriority()).enabled(r.getEnabled())
                .matchMode(r.getMatchMode().name()).stopProcessing(r.getStopProcessing())
                .conditions(readList(r.getConditionsJson(), new TypeReference<List<RuleCondition>>() {}))
                .actions(readList(r.getActionsJson(), new TypeReference<List<RuleAction>>() {}))
                .createdAt(r.getCreatedAt())
                .build();
    }

    /** Parse stored JSON for the response; a corrupt row lists as empty rather
     *  than 500 (writes are always valid, so this is purely defensive). */
    private <T> List<T> readList(String json, TypeReference<List<T>> type) {
        if (json == null || json.isBlank()) return List.of();
        try {
            return objectMapper.readValue(json, type);
        } catch (Exception e) {
            return List.of();
        }
    }

    private MailAccount loadCaller(MailPrincipal principal) {
        MailAccount caller = mailAccountRepository.findById(principal.accountId())
                .orElseThrow(() -> new UnauthorizedException("Session is no longer valid."));
        if (caller.getStatus() != MailAccount.Status.ACTIVE
                || Boolean.FALSE.equals(caller.getDomain().getIsActive())) {
            throw new UnauthorizedException("Session is no longer valid.");
        }
        return caller;
    }
}
