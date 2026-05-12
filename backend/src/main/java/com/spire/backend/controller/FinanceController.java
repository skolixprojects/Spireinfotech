package com.spire.backend.controller;

import com.spire.backend.dto.ApiResponse;
import com.spire.backend.entity.CheckDocument;
import com.spire.backend.entity.User;
import com.spire.backend.exception.ResourceNotFoundException;
import com.spire.backend.repository.CheckDocumentRepository;
import com.spire.backend.repository.UserRepository;
import com.spire.backend.service.RecordService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Phase 5B Finance dashboard endpoints. Gated to the FINANCE role
 * (system / operations admins can also read check images through the
 * existing admin paths, but the Finance-specific review workflow
 * lives here).
 *
 * Per PRD §13, this is the ONLY role with un-redacted access to
 * check images and check-tracking data. Coaches and ERMs never reach
 * these endpoints.
 */
@RestController
@RequestMapping("/api/finance")
@RequiredArgsConstructor
@PreAuthorize("hasAnyRole('FINANCE','SYSTEM_ADMIN','OPERATIONS_ADMIN')")
public class FinanceController {

    private final CheckDocumentRepository checkRepository;
    private final UserRepository userRepository;
    private final RecordService recordService;

    @GetMapping("/checks")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> listChecks(
            @RequestParam(value = "status", required = false) String status) {
        List<Map<String, Object>> rows = checkRepository.findAll().stream()
                .filter(c -> status == null || status.isBlank()
                        || status.equalsIgnoreCase(c.getReviewStatus()))
                .map(c -> {
                    User u = userRepository.findById(c.getUserId()).orElse(null);
                    Map<String, Object> r = new LinkedHashMap<>();
                    r.put("id", c.getId());
                    r.put("userId", c.getUserId());
                    r.put("participantId", u == null ? null : u.getParticipantId());
                    r.put("participantName", u == null ? null : u.getFullName());
                    r.put("checkNumber", c.getCheckNumber());
                    r.put("amount", c.getAmount());
                    r.put("checkDate", c.getCheckDate());
                    r.put("notes", c.getNotes());
                    r.put("reviewStatus", c.getReviewStatus());
                    r.put("maskingStatus", c.getMaskingStatus());
                    r.put("fileUrl", c.getFileUrl());
                    r.put("uploadedAt", c.getUploadedAt());
                    return r;
                })
                .toList();
        return ResponseEntity.ok(ApiResponse.success(rows));
    }

    @PutMapping("/checks/{checkId}/review")
    public ResponseEntity<ApiResponse<CheckDocument>> reviewCheck(
            @PathVariable Long checkId,
            @RequestBody Map<String, Object> body,
            Authentication auth) {
        Long me = Long.parseLong(auth.getPrincipal().toString());
        CheckDocument check = checkRepository.findById(checkId)
                .orElseThrow(() -> new ResourceNotFoundException("CheckDocument", "id", checkId));
        Object statusRaw = body.get("status");
        String status = statusRaw == null ? "APPROVED" : statusRaw.toString().toUpperCase();
        if (!"APPROVED".equals(status) && !"REJECTED".equals(status)) {
            throw new IllegalArgumentException("status must be APPROVED or REJECTED");
        }
        check.setReviewStatus(status);
        CheckDocument saved = checkRepository.save(check);

        Object notesRaw = body.get("notes");
        String notes = notesRaw == null ? "" : notesRaw.toString();
        recordService.logAction(check.getUserId(), RecordService.Category.PAYMENT,
                "APPROVED".equals(status) ? "Check approved by finance" : "Check rejected by finance",
                notes,
                Map.of("checkId", checkId, "financeReviewerId", me));
        return ResponseEntity.ok(ApiResponse.success(
                "Check " + status.toLowerCase(), saved));
    }
}
