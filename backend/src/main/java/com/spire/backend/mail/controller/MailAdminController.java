package com.spire.backend.mail.controller;

import com.spire.backend.dto.ApiResponse;
import com.spire.backend.mail.dto.*;
import com.spire.backend.mail.security.MailPrincipal;
import com.spire.backend.mail.service.MailAdminService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * Mail Admin API. The whole tree is gated to MAIL_ADMIN / MAIL_SUPER_ADMIN
 * by the mail security chain; fine-grained authorization (super vs admin,
 * domain walling, lockout) is enforced in {@link MailAdminService} from the
 * re-loaded principal. Unauthenticated → 401 (mail entry point); forbidden
 * → 403 (GlobalExceptionHandler).
 */
@RestController
@RequestMapping("/api/mail/admin")
@RequiredArgsConstructor
public class MailAdminController {

    private final MailAdminService mailAdminService;

    // ─── Domains ──
    @GetMapping("/domains")
    public ResponseEntity<ApiResponse<List<MailDomainSummary>>> listDomains(Authentication auth) {
        return ResponseEntity.ok(ApiResponse.success(mailAdminService.listDomains(principal(auth))));
    }

    @PostMapping("/domains")
    public ResponseEntity<ApiResponse<MailDomainSummary>> createDomain(
            Authentication auth, @Valid @RequestBody MailDomainCreateRequest req) {
        return ResponseEntity.ok(ApiResponse.success("Domain created",
                mailAdminService.createDomain(principal(auth), req)));
    }

    @PatchMapping("/domains/{id}")
    public ResponseEntity<ApiResponse<MailDomainSummary>> updateDomain(
            Authentication auth, @PathVariable Long id, @RequestBody MailDomainUpdateRequest req) {
        return ResponseEntity.ok(ApiResponse.success("Domain updated",
                mailAdminService.updateDomain(principal(auth), id, req)));
    }

    // ─── Mailboxes ──
    @GetMapping("/mailboxes")
    public ResponseEntity<ApiResponse<PagedResponse<MailboxSummary>>> listMailboxes(
            Authentication auth,
            @RequestParam(required = false) Long domainId,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Pageable pageable = PageRequest.of(Math.max(0, page), clampSize(size),
                Sort.by(Sort.Direction.DESC, "createdAt"));
        return ResponseEntity.ok(ApiResponse.success(
                mailAdminService.listMailboxes(principal(auth), domainId, status, q, pageable)));
    }

    @PostMapping("/mailboxes")
    public ResponseEntity<ApiResponse<MailLinkResponse>> createMailbox(
            Authentication auth, @Valid @RequestBody MailboxCreateRequest req) {
        return ResponseEntity.ok(ApiResponse.success("Mailbox created — setup link issued",
                mailAdminService.createMailbox(principal(auth), req)));
    }

    @PatchMapping("/mailboxes/{id}")
    public ResponseEntity<ApiResponse<MailboxSummary>> updateMailbox(
            Authentication auth, @PathVariable Long id, @RequestBody MailboxUpdateRequest req) {
        return ResponseEntity.ok(ApiResponse.success("Mailbox updated",
                mailAdminService.updateMailbox(principal(auth), id, req)));
    }

    @PostMapping("/mailboxes/{id}/suspend")
    public ResponseEntity<ApiResponse<MailboxSummary>> suspend(Authentication auth, @PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.success("Mailbox suspended",
                mailAdminService.suspend(principal(auth), id)));
    }

    @PostMapping("/mailboxes/{id}/reactivate")
    public ResponseEntity<ApiResponse<MailboxSummary>> reactivate(Authentication auth, @PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.success("Mailbox reactivated",
                mailAdminService.reactivate(principal(auth), id)));
    }

    @PostMapping("/mailboxes/{id}/setup-link")
    public ResponseEntity<ApiResponse<MailLinkResponse>> setupLink(Authentication auth, @PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.success("Setup link issued",
                mailAdminService.issueSetupLink(principal(auth), id)));
    }

    @PostMapping("/mailboxes/{id}/reset-link")
    public ResponseEntity<ApiResponse<MailLinkResponse>> resetLink(Authentication auth, @PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.success("Reset link issued",
                mailAdminService.issueResetLink(principal(auth), id)));
    }

    // ─── Audit ──
    @GetMapping("/audit")
    public ResponseEntity<ApiResponse<PagedResponse<MailAuditEntry>>> listAudit(
            Authentication auth,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Pageable pageable = PageRequest.of(Math.max(0, page), clampSize(size));
        return ResponseEntity.ok(ApiResponse.success(
                mailAdminService.listAudit(principal(auth), pageable)));
    }

    // ─── helpers ──
    private MailPrincipal principal(Authentication auth) {
        return (MailPrincipal) auth.getPrincipal();
    }

    private int clampSize(int size) {
        if (size < 1) return 1;
        return Math.min(size, 100);
    }
}
