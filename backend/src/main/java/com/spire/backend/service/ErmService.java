package com.spire.backend.service;

import com.spire.backend.entity.AgreementAcceptance;
import com.spire.backend.entity.ErmAssignment;
import com.spire.backend.entity.ParticipantDocument;
import com.spire.backend.entity.ProgramSelection;
import com.spire.backend.entity.User;
import com.spire.backend.entity.UserRecord;
import com.spire.backend.entity.WeeklyReport;
import com.spire.backend.exception.ResourceNotFoundException;
import com.spire.backend.exception.UnauthorizedException;
import com.spire.backend.repository.AgreementAcceptanceRepository;
import com.spire.backend.repository.ErmAssignmentRepository;
import com.spire.backend.repository.ParticipantDocumentRepository;
import com.spire.backend.repository.ProgramSelectionRepository;
import com.spire.backend.repository.UserRecordRepository;
import com.spire.backend.repository.UserRepository;
import com.spire.backend.repository.WeeklyReportRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * Phase 5B — ERM dashboard data access.
 *
 * Caller-scope rule: every read returns only data for participants
 * whose erm_assignments.erm_user_id points to the calling ERM.
 * Cross-ERM data leakage is prevented in {@link #requireAssignment}.
 *
 * Field-scope rule (PRD §13): ERMs do not see SSN values or check
 * images. This service surfaces only the metadata fields the ERM
 * needs; document IDs surface but the resolved file URL stays at
 * the participant-document endpoint, which the ERM-side UI does
 * not currently call.
 */
@Service
@RequiredArgsConstructor
public class ErmService {

    private final ErmAssignmentRepository ermAssignmentRepository;
    private final UserRepository userRepository;
    private final ProgramSelectionRepository programSelectionRepository;
    private final ParticipantDocumentRepository participantDocumentRepository;
    private final AgreementAcceptanceRepository agreementRepository;
    private final WeeklyReportRepository weeklyReportRepository;
    private final UserRecordRepository userRecordRepository;
    private final RecordService recordService;
    private final EmailTemplateService emailTemplateService;

    /** Roster — participants assigned to this ERM. */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> roster(Long ermUserId) {
        return ermAssignmentRepository.findByErmUserId(ermUserId).stream()
                .map(a -> userRepository.findById(a.getUserId()).orElse(null))
                .filter(Objects::nonNull)
                .map(p -> {
                    ProgramSelection prog = programSelectionRepository
                            .findFirstByUserIdOrderBySelectionDateDesc(p.getId())
                            .orElse(null);
                    LocalDateTime lastActivity = userRecordRepository
                            .findByUserIdOrderByCreatedAtDesc(p.getId()).stream()
                            .findFirst().map(UserRecord::getCreatedAt).orElse(null);
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("userId", p.getId());
                    row.put("participantId", p.getParticipantId());
                    row.put("fullName", p.getFullName());
                    row.put("email", p.getEmail());
                    row.put("program", prog != null ? prog.getProgram() : null);
                    row.put("technology", prog != null ? prog.getSkillset() : p.getSelectedTechnology());
                    row.put("targetJobTitle", prog != null ? prog.getTargetJobTitle() : null);
                    row.put("currentStatus", p.getCurrentStatus());
                    row.put("lastActivity", lastActivity);
                    return row;
                })
                .toList();
    }

    /** Single-participant detail panel for the ERM dashboard. */
    @Transactional(readOnly = true)
    public Map<String, Object> participantDetail(Long ermUserId, Long participantId) {
        requireAssignment(ermUserId, participantId);
        User p = userRepository.findById(participantId)
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", participantId));

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("userId", p.getId());
        out.put("participantId", p.getParticipantId());
        out.put("fullName", p.getFullName());
        out.put("email", p.getEmail());
        out.put("phone", p.getPhone());
        out.put("location", p.getLocation());
        out.put("currentStatus", p.getCurrentStatus());

        ProgramSelection prog = programSelectionRepository
                .findFirstByUserIdOrderBySelectionDateDesc(participantId).orElse(null);
        if (prog != null) {
            Map<String, Object> pp = new LinkedHashMap<>();
            pp.put("program", prog.getProgram());
            pp.put("phase", prog.getPhase());
            pp.put("skillset", prog.getSkillset());
            pp.put("targetJobTitle", prog.getTargetJobTitle());
            pp.put("availability", prog.getAvailability());
            out.put("program", pp);
        }

        // Document statuses only — no file URLs to keep finance-only
        // pieces (check images) invisible.
        List<Map<String, Object>> docs = participantDocumentRepository
                .findAll().stream()
                .filter(d -> participantId.equals(d.getUserId()))
                .map(d -> Map.<String, Object>of(
                        "id", d.getId(),
                        "documentType", d.getDocumentType() == null ? "" : d.getDocumentType(),
                        "reviewStatus", d.getReviewStatus() == null ? "PENDING" : d.getReviewStatus(),
                        "uploadedAt", d.getUploadedAt() == null ? "" : d.getUploadedAt().toString()
                ))
                .toList();
        out.put("documents", docs);

        AgreementAcceptance agree = agreementRepository.findByUserId(participantId).orElse(null);
        if (agree != null) {
            out.put("agreement", Map.of(
                    "status", agree.getStatus() == null ? "" : agree.getStatus(),
                    "acceptedAt", agree.getAcceptedAt() == null ? "" : agree.getAcceptedAt().toString(),
                    "version", agree.getAgreementVersion() == null ? "" : agree.getAgreementVersion()
            ));
        }

        out.put("reports", weeklyReportRepository.findByUserIdOrderByWeekStartDesc(participantId));

        ErmAssignment myRow = ermAssignmentRepository
                .findFirstByUserIdOrderByAssignedDateDesc(participantId).orElse(null);
        out.put("communicationNotes", myRow == null ? "" : (myRow.getCommunicationNotes() == null ? "" : myRow.getCommunicationNotes()));

        return out;
    }

    // ── Weekly reports ────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<WeeklyReport> reportsForMyParticipants(Long ermUserId) {
        return ermAssignmentRepository.findByErmUserId(ermUserId).stream()
                .flatMap(a -> weeklyReportRepository
                        .findByUserIdOrderByWeekStartDesc(a.getUserId()).stream())
                .toList();
    }

    @Transactional
    public WeeklyReport reviewReport(Long ermUserId, Long reportId, String notes) {
        WeeklyReport r = weeklyReportRepository.findById(reportId)
                .orElseThrow(() -> new ResourceNotFoundException("WeeklyReport", "id", reportId));
        requireAssignment(ermUserId, r.getUserId());
        r.setStatus("REVIEWED");
        r.setErmNotes(notes == null ? "" : notes.trim());
        r.setErmReviewDate(LocalDateTime.now());
        WeeklyReport saved = weeklyReportRepository.save(r);
        recordService.logAction(r.getUserId(), RecordService.Category.ACCOUNT,
                "Weekly report reviewed by ERM",
                notes,
                Map.of("reportId", reportId, "ermUserId", ermUserId));
        return saved;
    }

    // ── Communication notes ──────────────────────────────────────

    @Transactional
    public ErmAssignment appendNote(Long ermUserId, Long participantId, String note, boolean escalation) {
        requireAssignment(ermUserId, participantId);
        if (note == null || note.isBlank()) {
            throw new IllegalArgumentException("Note text is required");
        }
        ErmAssignment row = ermAssignmentRepository
                .findFirstByUserIdOrderByAssignedDateDesc(participantId)
                .orElseThrow(() -> new ResourceNotFoundException(
                        "ErmAssignment", "userId", participantId));
        String stamp = LocalDateTime.now().toString();
        String prefix = (escalation ? "[ESCALATION] " : "") + "[" + stamp + "] ";
        String existing = row.getCommunicationNotes();
        String updated = (existing == null || existing.isBlank())
                ? prefix + note.trim()
                : existing + "\n" + prefix + note.trim();
        row.setCommunicationNotes(updated);
        ErmAssignment saved = ermAssignmentRepository.save(row);
        recordService.logAction(participantId,
                escalation ? RecordService.Category.SECURITY : RecordService.Category.ACCOUNT,
                escalation ? "ERM logged an escalation" : "ERM note logged",
                note,
                Map.of("ermUserId", ermUserId, "escalation", escalation));
        return saved;
    }

    // ── Auth gate ─────────────────────────────────────────────────

    private void requireAssignment(Long ermUserId, Long participantId) {
        boolean ok = ermAssignmentRepository.findByErmUserId(ermUserId).stream()
                .anyMatch(a -> participantId.equals(a.getUserId()));
        if (!ok) {
            throw new UnauthorizedException(
                    "You are not the assigned ERM for this participant.");
        }
    }

    // ── Referral review (Prompt 4) ────────────────────────────────
    //
    // The referral queue is a GLOBAL shared work list — any ERM sees
    // all pending referrals and first-to-review wins. Assignment of
    // an ERM to the participant happens later via the onboarding
    // chain (post-profileComplete), not here.

    /** Queue snapshot: stats + pending rows in oldest-first order. */
    @Transactional(readOnly = true)
    public Map<String, Object> getReferralQueue() {
        List<Map<String, Object>> pending = userRepository
                .findByPipelineAndReferralStatusOrderByCreatedAtAsc("REFERENCE", "PENDING")
                .stream()
                .map(u -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("userId", u.getId());
                    row.put("fullName", u.getFullName());
                    row.put("email", u.getEmail());
                    row.put("referralSource", u.getReferralSource());
                    row.put("createdAt", u.getCreatedAt());
                    row.put("emailVerified", Boolean.TRUE.equals(u.getEmailVerified()));
                    return row;
                })
                .toList();

        long pendingCount = userRepository
                .countByPipelineAndReferralStatus("REFERENCE", "PENDING");
        long rejectedCount = userRepository
                .countByPipelineAndReferralStatus("REFERENCE", "REJECTED");
        long approvedThisWeek = userRepository
                .countByPipelineAndReferralStatusAndReferralReviewedAtAfter(
                        "REFERENCE", "APPROVED", LocalDateTime.now().minusDays(7));

        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("pending", pendingCount);
        stats.put("approvedThisWeek", approvedThisWeek);
        stats.put("rejected", rejectedCount);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("stats", stats);
        out.put("pending", pending);
        return out;
    }

    /**
     * Flips the referral PENDING → APPROVED. Does NOT run the
     * onboarding chain and does NOT transition the workflow to
     * DASHBOARD_ENABLED — the user still owes the 6-step profile
     * flow; completeOnboarding fires on its own when they hit
     * profileComplete (existing Phase-1C behavior).
     *
     * Idempotent-guarded: if the target is no longer PENDING, returns
     * an "already reviewed" result rather than double-processing.
     */
    @Transactional
    public Map<String, Object> approveReferral(Long ermUserId, Long targetUserId, String note) {
        User target = userRepository.findById(targetUserId)
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", targetUserId));

        if (!"PENDING".equals(target.getReferralStatus())) {
            return alreadyReviewed(target);
        }

        target.setReferralStatus("APPROVED");
        target.setReferralReviewedBy(ermUserId);
        target.setReferralReviewedAt(LocalDateTime.now());
        User saved = userRepository.save(target);

        try {
            recordService.record(saved.getId(), "REFERRAL_APPROVED",
                    RecordService.Category.ACCOUNT,
                    "Referral approved",
                    "ERM " + ermUserId + " approved the referral",
                    Map.of(
                            "reviewedBy", ermUserId,
                            "note", note == null ? "" : note
                    ));
        } catch (Exception ignored) { /* audit best-effort */ }

        try {
            emailTemplateService.sendReferralApprovedEmail(saved);
        } catch (Exception ignored) { /* mailer best-effort */ }

        return reviewResult(saved, "APPROVED", false);
    }

    /**
     * Rejects a pending referral. Reuses the existing soft-delete
     * surface (isActive=false + deactivatedAt) so the account is
     * genuinely dropped — the login path's active-account check
     * blocks re-entry. No rejection email is sent.
     */
    @Transactional
    public Map<String, Object> rejectReferral(Long ermUserId, Long targetUserId, String note) {
        User target = userRepository.findById(targetUserId)
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", targetUserId));

        if (!"PENDING".equals(target.getReferralStatus())) {
            return alreadyReviewed(target);
        }

        target.setReferralStatus("REJECTED");
        target.setReferralReviewedBy(ermUserId);
        target.setReferralReviewedAt(LocalDateTime.now());
        target.setIsActive(false);
        target.setDeactivatedAt(LocalDateTime.now());
        User saved = userRepository.save(target);

        try {
            recordService.record(saved.getId(), "REFERRAL_REJECTED",
                    RecordService.Category.ACCOUNT,
                    "Referral rejected",
                    "ERM " + ermUserId + " rejected the referral; account soft-deleted",
                    Map.of(
                            "rejectedBy", ermUserId,
                            "note", note == null ? "" : note
                    ));
        } catch (Exception ignored) { /* audit best-effort */ }

        return reviewResult(saved, "REJECTED", false);
    }

    private Map<String, Object> alreadyReviewed(User target) {
        return reviewResult(target,
                target.getReferralStatus() == null ? "" : target.getReferralStatus(),
                true);
    }

    private Map<String, Object> reviewResult(User target, String finalStatus, boolean alreadyReviewed) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("success", true);
        out.put("alreadyReviewed", alreadyReviewed);
        out.put("userId", target.getId());
        out.put("referralStatus", finalStatus);
        out.put("email", target.getEmail());
        out.put("fullName", target.getFullName());
        return out;
    }
}
