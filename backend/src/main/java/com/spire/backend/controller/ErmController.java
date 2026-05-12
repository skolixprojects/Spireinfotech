package com.spire.backend.controller;

import com.spire.backend.dto.ApiResponse;
import com.spire.backend.entity.ErmAssignment;
import com.spire.backend.entity.WeeklyReport;
import com.spire.backend.service.ErmService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * Phase 5B ERM dashboard endpoints. All routes are role-gated to ERM
 * and cross-participant authorization is enforced inside
 * {@link ErmService}.
 */
@RestController
@RequestMapping("/api/erm")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ERM')")
public class ErmController {

    private final ErmService ermService;

    @GetMapping("/participants")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> roster(Authentication auth) {
        Long me = Long.parseLong(auth.getPrincipal().toString());
        return ResponseEntity.ok(ApiResponse.success(ermService.roster(me)));
    }

    @GetMapping("/participants/{participantId}")
    public ResponseEntity<ApiResponse<Map<String, Object>>> participantDetail(
            @PathVariable Long participantId,
            Authentication auth) {
        Long me = Long.parseLong(auth.getPrincipal().toString());
        return ResponseEntity.ok(ApiResponse.success(
                ermService.participantDetail(me, participantId)));
    }

    @GetMapping("/reports")
    public ResponseEntity<ApiResponse<List<WeeklyReport>>> myReports(Authentication auth) {
        Long me = Long.parseLong(auth.getPrincipal().toString());
        return ResponseEntity.ok(ApiResponse.success(
                ermService.reportsForMyParticipants(me)));
    }

    @PutMapping("/reports/{reportId}/review")
    public ResponseEntity<ApiResponse<WeeklyReport>> reviewReport(
            @PathVariable Long reportId,
            @RequestBody Map<String, Object> body,
            Authentication auth) {
        Long me = Long.parseLong(auth.getPrincipal().toString());
        Object notesRaw = body.get("notes");
        String notes = notesRaw == null ? "" : notesRaw.toString();
        return ResponseEntity.ok(ApiResponse.success(
                "Report reviewed", ermService.reviewReport(me, reportId, notes)));
    }

    @PostMapping("/participants/{participantId}/notes")
    public ResponseEntity<ApiResponse<ErmAssignment>> addNote(
            @PathVariable Long participantId,
            @RequestBody Map<String, Object> body,
            Authentication auth) {
        Long me = Long.parseLong(auth.getPrincipal().toString());
        Object noteRaw = body.get("note");
        String note = noteRaw == null ? "" : noteRaw.toString();
        boolean escalation = Boolean.TRUE.equals(body.get("escalation"));
        return ResponseEntity.ok(ApiResponse.success(
                "Note logged",
                ermService.appendNote(me, participantId, note, escalation)));
    }
}
