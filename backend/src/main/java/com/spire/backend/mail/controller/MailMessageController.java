package com.spire.backend.mail.controller;

import com.spire.backend.dto.ApiResponse;
import com.spire.backend.mail.dto.*;
import com.spire.backend.mail.security.MailPrincipal;
import com.spire.backend.mail.service.MailMessageService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * Mail messaging API (non-admin) under /api/mail/**. The mail security
 * chain authenticates every route; the service enforces walling +
 * per-entry access control from the re-loaded principal.
 */
@RestController
@RequestMapping("/api/mail")
@RequiredArgsConstructor
public class MailMessageController {

    private final MailMessageService mailMessageService;

    // ─── Compose / send ──
    @PostMapping("/messages")
    public ResponseEntity<ApiResponse<MailMessageDetail>> send(
            Authentication auth, @Valid @RequestBody MailComposeRequest req) {
        return ResponseEntity.ok(ApiResponse.success("Message sent",
                mailMessageService.send(principal(auth), req)));
    }

    @PostMapping("/drafts")
    public ResponseEntity<ApiResponse<MailMessageDetail>> saveDraft(
            Authentication auth, @Valid @RequestBody MailComposeRequest req) {
        return ResponseEntity.ok(ApiResponse.success("Draft saved",
                mailMessageService.saveDraft(principal(auth), req)));
    }

    @PutMapping("/drafts/{id}")
    public ResponseEntity<ApiResponse<MailMessageDetail>> updateDraft(
            Authentication auth, @PathVariable Long id, @Valid @RequestBody MailComposeRequest req) {
        return ResponseEntity.ok(ApiResponse.success("Draft updated",
                mailMessageService.updateDraft(principal(auth), id, req)));
    }

    @PostMapping("/drafts/{id}/send")
    public ResponseEntity<ApiResponse<MailMessageDetail>> sendDraft(
            Authentication auth, @PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.success("Message sent",
                mailMessageService.sendDraft(principal(auth), id)));
    }

    // ─── Read ──
    @GetMapping("/folders/{folder}")
    public ResponseEntity<ApiResponse<MailFolderListing>> folder(
            Authentication auth, @PathVariable String folder,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Pageable pageable = PageRequest.of(Math.max(0, page), clampSize(size));
        return ResponseEntity.ok(ApiResponse.success(
                mailMessageService.listFolder(principal(auth), folder, pageable)));
    }

    @GetMapping("/folders/starred")
    public ResponseEntity<ApiResponse<MailFolderListing>> starred(
            Authentication auth,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Pageable pageable = PageRequest.of(Math.max(0, page), clampSize(size));
        return ResponseEntity.ok(ApiResponse.success(
                mailMessageService.listStarred(principal(auth), pageable)));
    }

    @GetMapping("/messages/{id}")
    public ResponseEntity<ApiResponse<MailMessageDetail>> getMessage(
            Authentication auth, @PathVariable Long id) {
        return ResponseEntity.ok(ApiResponse.success(mailMessageService.getMessage(principal(auth), id)));
    }

    @GetMapping("/threads/{threadId}")
    public ResponseEntity<ApiResponse<MailThreadView>> getThread(
            Authentication auth, @PathVariable Long threadId) {
        return ResponseEntity.ok(ApiResponse.success(mailMessageService.getThread(principal(auth), threadId)));
    }

    @GetMapping("/search")
    public ResponseEntity<ApiResponse<PagedResponse<MailMessageSummary>>> search(
            Authentication auth, @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Pageable pageable = PageRequest.of(Math.max(0, page), clampSize(size),
                Sort.by(Sort.Direction.DESC, "message.createdAt"));
        return ResponseEntity.ok(ApiResponse.success(
                mailMessageService.search(principal(auth), q, pageable)));
    }

    // ─── Flags / organize ──
    @PatchMapping("/messages/{id}")
    public ResponseEntity<ApiResponse<MailMessageDetail>> patch(
            Authentication auth, @PathVariable Long id, @RequestBody MailFlagUpdateRequest req) {
        return ResponseEntity.ok(ApiResponse.success("Message updated",
                mailMessageService.applyFlags(principal(auth), id, req)));
    }

    @DeleteMapping("/messages/{id}")
    public ResponseEntity<ApiResponse<Map<String, Object>>> softDelete(
            Authentication auth, @PathVariable Long id) {
        mailMessageService.softDelete(principal(auth), id);
        return ResponseEntity.ok(ApiResponse.success("Moved to Trash", Map.of("ok", true)));
    }

    @DeleteMapping("/messages/{id}/permanent")
    public ResponseEntity<ApiResponse<Map<String, Object>>> permanentDelete(
            Authentication auth, @PathVariable Long id) {
        mailMessageService.permanentDelete(principal(auth), id);
        return ResponseEntity.ok(ApiResponse.success("Permanently deleted", Map.of("ok", true)));
    }

    // ─── Contacts / counts ──
    @GetMapping("/contacts")
    public ResponseEntity<ApiResponse<List<MailContactDto>>> contacts(
            Authentication auth, @RequestParam(required = false) String q) {
        return ResponseEntity.ok(ApiResponse.success(mailMessageService.contacts(principal(auth), q)));
    }

    @GetMapping("/unread-counts")
    public ResponseEntity<ApiResponse<Map<String, Long>>> unreadCounts(Authentication auth) {
        return ResponseEntity.ok(ApiResponse.success(mailMessageService.unreadCounts(principal(auth))));
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
