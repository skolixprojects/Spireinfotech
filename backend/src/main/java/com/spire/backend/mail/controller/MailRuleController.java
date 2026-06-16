package com.spire.backend.mail.controller;

import com.spire.backend.dto.ApiResponse;
import com.spire.backend.mail.dto.MailRuleDto;
import com.spire.backend.mail.dto.MailRuleEnabledRequest;
import com.spire.backend.mail.dto.MailRuleReorderRequest;
import com.spire.backend.mail.dto.MailRuleRequest;
import com.spire.backend.mail.security.MailPrincipal;
import com.spire.backend.mail.service.MailRuleService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * Per-account inbox-rules CRUD (Phase 17). Authenticated by the mail chain;
 * every op is walled to the caller in {@link MailRuleService}. Rules apply on
 * inbound delivery via the engine — this controller only manages them.
 */
@RestController
@RequestMapping("/api/mail/rules")
@RequiredArgsConstructor
public class MailRuleController {

    private final MailRuleService mailRuleService;

    @GetMapping
    public ResponseEntity<ApiResponse<List<MailRuleDto>>> list(Authentication auth) {
        return ResponseEntity.ok(ApiResponse.success(mailRuleService.listRules(principal(auth))));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<MailRuleDto>> create(
            Authentication auth, @Valid @RequestBody MailRuleRequest req) {
        return ResponseEntity.ok(ApiResponse.success("Rule created",
                mailRuleService.createRule(principal(auth), req)));
    }

    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<MailRuleDto>> update(
            Authentication auth, @PathVariable Long id, @Valid @RequestBody MailRuleRequest req) {
        return ResponseEntity.ok(ApiResponse.success("Rule updated",
                mailRuleService.updateRule(principal(auth), id, req)));
    }

    @PatchMapping("/{id}/enabled")
    public ResponseEntity<ApiResponse<MailRuleDto>> setEnabled(
            Authentication auth, @PathVariable Long id, @Valid @RequestBody MailRuleEnabledRequest req) {
        return ResponseEntity.ok(ApiResponse.success("Rule updated",
                mailRuleService.setEnabled(principal(auth), id, req.getEnabled())));
    }

    @PostMapping("/reorder")
    public ResponseEntity<ApiResponse<List<MailRuleDto>>> reorder(
            Authentication auth, @Valid @RequestBody MailRuleReorderRequest req) {
        return ResponseEntity.ok(ApiResponse.success("Rules reordered",
                mailRuleService.reorder(principal(auth), req.getRuleIds())));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Map<String, Object>>> delete(Authentication auth, @PathVariable Long id) {
        mailRuleService.deleteRule(principal(auth), id);
        return ResponseEntity.ok(ApiResponse.success("Rule deleted", Map.of("ok", true)));
    }

    private MailPrincipal principal(Authentication auth) {
        return (MailPrincipal) auth.getPrincipal();
    }
}
