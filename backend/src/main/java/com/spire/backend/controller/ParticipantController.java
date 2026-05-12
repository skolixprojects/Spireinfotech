package com.spire.backend.controller;

import com.spire.backend.dto.AcknowledgmentSubmitRequest;
import com.spire.backend.dto.ApiResponse;
import com.spire.backend.dto.ParticipantDocumentDTO;
import com.spire.backend.dto.ParticipantEnrollRequest;
import com.spire.backend.dto.RegistrationResponse;
import com.spire.backend.dto.UserDTO;
import com.spire.backend.entity.Acknowledgment;
import com.spire.backend.entity.ParticipantDocument;
import com.spire.backend.entity.User;
import com.spire.backend.exception.ResourceNotFoundException;
import com.spire.backend.repository.UserRepository;
import com.spire.backend.service.AcknowledgmentService;
import com.spire.backend.service.AuthService;
import com.spire.backend.service.DocumentService;
import com.spire.backend.service.DocumentStorageService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.util.List;
import java.util.Map;

/**
 * Phase 1B participant endpoints.
 *
 *   POST /api/participants/enroll  — public, replaces /signup
 *   GET  /api/participants/me      — auth'd, returns the caller's
 *                                    full profile incl. participantId
 *                                    + currentStatus
 *
 * The /enroll path is intentionally mounted under /api/participants
 * (not /api/auth) so it's clear at a glance which surface a caller
 * is on; the older /api/auth/register endpoint stays operational for
 * legacy clients but new traffic should use this one.
 */
@RestController
@RequestMapping("/api/participants")
@RequiredArgsConstructor
public class ParticipantController {

    private final AuthService authService;
    private final UserRepository userRepository;
    private final AcknowledgmentService acknowledgmentService;
    private final DocumentService documentService;
    private final DocumentStorageService storageService;

    /** Public — anyone can enroll. Behind the scenes walks the workflow
     *  ladder DRAFT_STARTED → BASIC_INFO_SUBMITTED → EMAIL_VERIFICATION_PENDING. */
    @PostMapping("/enroll")
    public ResponseEntity<ApiResponse<RegistrationResponse>> enroll(
            @Valid @RequestBody ParticipantEnrollRequest request) {
        RegistrationResponse data = authService.enrollParticipant(request);
        return ResponseEntity.ok(ApiResponse.success("Enrollment received", data));
    }

    /** Auth'd — returns the caller's current profile. Used by the
     *  participant-id page + every routing-guard check on the FE. */
    @GetMapping("/me")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<ApiResponse<UserDTO>> me(Authentication auth) {
        Long userId = Long.parseLong(auth.getPrincipal().toString());
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", userId));
        return ResponseEntity.ok(ApiResponse.success(UserDTO.from(user)));
    }

    /**
     * Phase 2A — accepts the participant's "Acknowledgment of
     * Interest and Program Acceptance" submission (Step 4).
     * Validates consents + signature, persists an immutable
     * acknowledgments row with the full audit trail, then walks
     * the workflow to ACKNOWLEDGMENT_ACCEPTED.
     */
    @PostMapping("/acknowledgments")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<ApiResponse<Map<String, Object>>> submitAcknowledgment(
            @Valid @RequestBody AcknowledgmentSubmitRequest request,
            Authentication auth,
            HttpServletRequest httpRequest) {
        Long userId = Long.parseLong(auth.getPrincipal().toString());
        Acknowledgment saved = acknowledgmentService.submit(userId, request, httpRequest);
        return ResponseEntity.ok(ApiResponse.success(
                "Acknowledgment accepted",
                Map.of(
                        "acknowledgmentId", saved.getId(),
                        "version", saved.getAcceptedTextVersion(),
                        "nextStep", "/document-upload",
                        "success", true
                )));
    }

    // ─── Phase 2B: secure document vault ────────────────────────────

    /** Upload a single document for a known type. Multipart only. */
    @PostMapping("/documents/upload")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<ApiResponse<ParticipantDocumentDTO>> uploadDocument(
            @RequestParam("file") MultipartFile file,
            @RequestParam("documentType") String documentType,
            Authentication auth) {
        Long userId = Long.parseLong(auth.getPrincipal().toString());
        ParticipantDocument saved = documentService.upload(userId, documentType, file);
        return ResponseEntity.ok(ApiResponse.success(
                "Document uploaded",
                ParticipantDocumentDTO.from(saved)));
    }

    /** List every document the caller has uploaded (or marked N/A). */
    @GetMapping("/documents")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<ApiResponse<List<ParticipantDocumentDTO>>> listDocuments(Authentication auth) {
        Long userId = Long.parseLong(auth.getPrincipal().toString());
        List<ParticipantDocumentDTO> docs = documentService.listForUser(userId)
                .stream().map(ParticipantDocumentDTO::from).toList();
        return ResponseEntity.ok(ApiResponse.success(docs));
    }

    /** Remove a document (owner only; rejected by service if APPROVED). */
    @DeleteMapping("/documents/{documentId}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<ApiResponse<Map<String, Object>>> deleteDocument(
            @PathVariable Long documentId,
            Authentication auth) {
        Long userId = Long.parseLong(auth.getPrincipal().toString());
        documentService.delete(documentId, userId);
        return ResponseEntity.ok(ApiResponse.success("Document removed",
                Map.of("removed", true, "documentId", documentId)));
    }

    /** Marks a document type as Not Applicable (e.g. domestic candidates skipping Work Authorization). */
    @PostMapping("/documents/mark-na")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<ApiResponse<ParticipantDocumentDTO>> markNotApplicable(
            @RequestBody Map<String, String> body,
            Authentication auth) {
        Long userId = Long.parseLong(auth.getPrincipal().toString());
        String documentType = body.get("documentType");
        if (documentType == null || documentType.isBlank()) {
            throw new IllegalArgumentException("documentType is required");
        }
        ParticipantDocument saved = documentService.markNotApplicable(userId, documentType);
        return ResponseEntity.ok(ApiResponse.success(
                "Marked as N/A",
                ParticipantDocumentDTO.from(saved)));
    }

    /** Completeness gate — returns nextStep + transitions workflow when all required docs are present. */
    @PostMapping("/documents/complete")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<ApiResponse<Map<String, Object>>> completeDocuments(Authentication auth) {
        Long userId = Long.parseLong(auth.getPrincipal().toString());
        Map<String, Object> result = documentService.complete(userId);
        return ResponseEntity.ok(ApiResponse.success(result));
    }

    /**
     * Auth-gated view. Owner or admin only. For Cloudinary-backed
     * URLs we issue a 5-minute signed link (PRD §13.1); for
     * local-disk paths we stream the file inline. The local stream
     * stays behind JWT so it provides equivalent gating without
     * a public-URL ever existing.
     */
    @GetMapping("/documents/{documentId}/view")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<?> viewDocument(
            @PathVariable Long documentId,
            Authentication auth) {
        Long callerId = Long.parseLong(auth.getPrincipal().toString());
        boolean isAdmin = auth.getAuthorities().stream()
                .anyMatch(a -> {
                    String r = a.getAuthority();
                    return "ROLE_ADMIN".equals(r) || "ROLE_OPERATIONS_ADMIN".equals(r)
                            || "ROLE_SYSTEM_ADMIN".equals(r) || "ROLE_ERM".equals(r);
                });
        ParticipantDocument doc = documentService.get(documentId, callerId, isAdmin);

        // N/A markers carry no file.
        if (Boolean.TRUE.equals(doc.getNotApplicable())
                || doc.getFileUrl() == null || doc.getFileUrl().isBlank()) {
            return ResponseEntity.notFound().build();
        }

        String url = doc.getFileUrl();
        if (url.startsWith("http")) {
            // Cloudinary path — return a 302-style payload with the
            // signed URL the client can fetch directly.
            String signed = storageService.signedUrl(url);
            return ResponseEntity.ok(ApiResponse.success(Map.of(
                    "url", signed,
                    "expiresIn", 300
            )));
        }
        // Local-disk path — stream the file inline under auth.
        File file = new File(url);
        if (!file.exists()) {
            return ResponseEntity.notFound().build();
        }
        Resource resource = new FileSystemResource(file);
        String contentType = guessContentType(doc.getFileName());
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(contentType))
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "inline; filename=\""
                                + (doc.getFileName() == null ? "document" : doc.getFileName())
                                + "\"")
                .body(resource);
    }

    private static String guessContentType(String filename) {
        if (filename == null) return "application/octet-stream";
        String lower = filename.toLowerCase();
        if (lower.endsWith(".pdf")) return "application/pdf";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        return "application/octet-stream";
    }
}
