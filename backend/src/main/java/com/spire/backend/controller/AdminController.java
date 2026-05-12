package com.spire.backend.controller;

import com.spire.backend.dto.AdminEnrollmentRow;
import com.spire.backend.dto.AdminSessionRow;
import com.spire.backend.dto.ApiResponse;
import com.spire.backend.dto.CourseDTO;
import com.spire.backend.dto.InstructorRequestDTO;
import com.spire.backend.dto.ParticipantDocumentDTO;
import com.spire.backend.dto.ProfileDTO;
import com.spire.backend.dto.UserDTO;
import com.spire.backend.entity.ParticipantDocument;
import com.spire.backend.entity.Payment;
import com.spire.backend.service.AdminRevenueService;
import com.spire.backend.service.AdminService;
import com.spire.backend.service.CoachAssignmentService;
import com.spire.backend.service.CourseService;
import com.spire.backend.service.DocumentService;
import com.spire.backend.service.ErmAssignmentService;
import com.spire.backend.service.InstructorRequestService;
import com.spire.backend.service.OnboardingService;
import com.spire.backend.service.ProfileService;
import com.spire.backend.repository.CoachAssignmentRepository;
import com.spire.backend.repository.ErmAssignmentRepository;
import com.spire.backend.repository.UserRepository;
import com.spire.backend.entity.CoachAssignment;
import com.spire.backend.entity.ErmAssignment;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.io.PrintWriter;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")  // Double-layer: URL config + method-level
public class AdminController {

    private final AdminService adminService;
    private final CourseService courseService;
    private final InstructorRequestService instructorRequestService;
    private final ProfileService profileService;
    private final AdminRevenueService adminRevenueService;
    private final DocumentService documentService;
    private final ErmAssignmentService ermAssignmentService;
    private final CoachAssignmentService coachAssignmentService;
    private final OnboardingService onboardingService;
    private final UserRepository userRepository;
    private final ErmAssignmentRepository ermAssignmentRepository;
    private final CoachAssignmentRepository coachAssignmentRepository;

    // CSV timestamps render in IST. The DB stores LocalDateTime
    // (timezone-naive, server-local = UTC on Railway) so we rebase
    // UTC→IST before formatting. Headers carry an "(IST)" suffix so
    // a recipient downloading the file knows what the column is in.
    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");
    private static final DateTimeFormatter CSV_TS = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    @GetMapping("/analytics")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getAnalytics() {
        return ResponseEntity.ok(ApiResponse.success(adminService.getAnalytics()));
    }

    @GetMapping("/users")
    public ResponseEntity<ApiResponse<List<UserDTO>>> getAllUsers(
            @RequestParam(value = "status", required = false) String status) {
        return ResponseEntity.ok(ApiResponse.success(adminService.getAllUsers(status)));
    }

    /**
     * Active / inactive / total user counts. Drives the count badges
     * on the admin Users tab pills (Active users (15) / Deactivated
     * users (3)).
     */
    @GetMapping("/users/counts")
    public ResponseEntity<ApiResponse<Map<String, Long>>> getUserCounts() {
        return ResponseEntity.ok(ApiResponse.success(adminService.getUserCounts()));
    }

    /**
     * Reactivates a previously soft-deactivated account. Sugar over
     * {@link #updateUserStatus} with active=true; exists as its own
     * verb so the admin UI's "Reactivate" button has a clean,
     * intent-revealing URL and so we can later add reactivate-only
     * side-effects (welcome-back email, etc.) without touching the
     * generic toggle.
     */
    @PutMapping("/users/{id}/reactivate")
    public ResponseEntity<ApiResponse<UserDTO>> reactivateUser(
            @PathVariable Long id,
            Authentication authentication) {
        Long currentAdminId = Long.parseLong(authentication.getPrincipal().toString());
        UserDTO user = adminService.updateUserStatus(id, currentAdminId, true);
        return ResponseEntity.ok(ApiResponse.success("User reactivated", user));
    }

    // Admin oversight: full profile of any user — name, contact, learning
    // stats, activity analytics, contribution heatmap.
    @GetMapping("/users/{userId}/profile")
    public ResponseEntity<ApiResponse<ProfileDTO>> getUserProfile(@PathVariable Long userId) {
        return ResponseEntity.ok(ApiResponse.success(profileService.getProfile(userId)));
    }

    @PutMapping("/users/{id}/role")
    public ResponseEntity<ApiResponse<UserDTO>> updateUserRole(
            @PathVariable Long id, @RequestBody Map<String, String> body) {
        String role = body.get("role");
        if (role == null || role.isBlank()) {
            throw new IllegalArgumentException("Role is required");
        }
        UserDTO user = adminService.updateUserRole(id, role);
        return ResponseEntity.ok(ApiResponse.success("Role updated", user));
    }

    @PutMapping("/users/{id}/status")
    public ResponseEntity<ApiResponse<UserDTO>> updateUserStatus(
            @PathVariable Long id,
            @RequestBody Map<String, Boolean> body,
            Authentication authentication) {
        Boolean active = body.get("active");
        if (active == null) {
            throw new IllegalArgumentException("'active' field is required");
        }
        Long currentAdminId = Long.parseLong(authentication.getPrincipal().toString());
        UserDTO user = adminService.updateUserStatus(id, currentAdminId, active);
        return ResponseEntity.ok(ApiResponse.success(
                active ? "User activated" : "User deactivated", user));
    }

    /**
     * Soft-delete: deactivates the account and scrubs personal data.
     * Foreign-key heavy entities (records, certificates, enrollments)
     * stay intact for audit. See {@link AdminService#softDeleteUser}.
     */
    @DeleteMapping("/users/{id}")
    public ResponseEntity<ApiResponse<UserDTO>> softDeleteUser(
            @PathVariable Long id,
            Authentication authentication) {
        Long currentAdminId = Long.parseLong(authentication.getPrincipal().toString());
        UserDTO user = adminService.softDeleteUser(id, currentAdminId);
        return ResponseEntity.ok(ApiResponse.success(
                "User deactivated and anonymized", user));
    }

    // ─── Platform-wide oversight ────────────────────────────────────

    @GetMapping("/enrollments")
    public ResponseEntity<ApiResponse<List<AdminEnrollmentRow>>> getAllEnrollments() {
        return ResponseEntity.ok(ApiResponse.success(adminService.getAllEnrollments()));
    }

    @GetMapping("/sessions")
    public ResponseEntity<ApiResponse<List<AdminSessionRow>>> getAllSessions() {
        return ResponseEntity.ok(ApiResponse.success(adminService.getAllSessions()));
    }

    // ─── All Courses (including unpublished) ─────────────────────────

    @GetMapping("/courses")
    public ResponseEntity<ApiResponse<List<CourseDTO>>> getAllCourses() {
        return ResponseEntity.ok(ApiResponse.success(courseService.getAllCoursesAdmin()));
    }

    // ─── Instructor Approval System ─────────────────────────────────

    @GetMapping("/instructor-requests")
    public ResponseEntity<ApiResponse<List<InstructorRequestDTO>>> getPendingRequests() {
        List<InstructorRequestDTO> dtos = instructorRequestService.getPendingRequests()
                .stream().map(InstructorRequestDTO::from).toList();
        return ResponseEntity.ok(ApiResponse.success(dtos));
    }

    @PutMapping("/approve-instructor/{requestId}")
    public ResponseEntity<ApiResponse<String>> approveInstructor(@PathVariable Long requestId) {
        instructorRequestService.approveInstructor(requestId);
        return ResponseEntity.ok(ApiResponse.success("Instructor approved successfully"));
    }

    @PutMapping("/reject-instructor/{requestId}")
    public ResponseEntity<ApiResponse<String>> rejectInstructor(@PathVariable Long requestId) {
        instructorRequestService.rejectInstructor(requestId);
        return ResponseEntity.ok(ApiResponse.success("Instructor request rejected"));
    }

    // ─── Revenue Dashboard ───────────────────────────────────────────

    @GetMapping("/revenue/summary")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getRevenueSummary() {
        return ResponseEntity.ok(ApiResponse.success(adminRevenueService.getSummary()));
    }

    @GetMapping("/revenue/transactions")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getRevenueTransactions(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) String status) {
        return ResponseEntity.ok(ApiResponse.success(
                adminRevenueService.getTransactions(from, to, status)));
    }

    // ─── CSV Exports ─────────────────────────────────────────────────

    @GetMapping("/export/users")
    public void exportUsers(HttpServletResponse response) throws IOException {
        prepareCsv(response, "users");
        PrintWriter w = response.getWriter();
        w.println("ID,FullName,Email,Role,Active,InstructorApproved,CreatedAt (IST)");
        for (UserDTO u : adminService.getAllUsers()) {
            w.println(String.join(",",
                    csv(u.getId()),
                    csv(u.getFullName()),
                    csv(u.getEmail()),
                    csv(u.getRole()),
                    csv(u.getIsActive()),
                    csv(u.getInstructorApproved()),
                    csv(u.getCreatedAt())));
        }
        w.flush();
    }

    @GetMapping("/export/enrollments")
    public void exportEnrollments(HttpServletResponse response) throws IOException {
        prepareCsv(response, "enrollments");
        PrintWriter w = response.getWriter();
        w.println("EnrollmentID,StudentName,StudentEmail,CourseTitle,Type,EnrolledAt (IST),Progress%,Completed,Mentor,MentorStatus");
        for (AdminEnrollmentRow r : adminService.getAllEnrollments()) {
            w.println(String.join(",",
                    csv(r.getEnrollmentId()),
                    csv(r.getStudentName()),
                    csv(r.getStudentEmail()),
                    csv(r.getCourseTitle()),
                    csv(r.getCourseType()),
                    csv(r.getEnrolledAt()),
                    csv(r.getProgressPercent()),
                    csv(r.getCompleted()),
                    csv(r.getMentorName()),
                    csv(r.getMentorAssignmentStatus())));
        }
        w.flush();
    }

    @GetMapping("/export/sessions")
    public void exportSessions(HttpServletResponse response) throws IOException {
        prepareCsv(response, "sessions");
        PrintWriter w = response.getWriter();
        w.println("SessionID,StudentName,StudentEmail,Mentor,CourseTitle,Status,Topic,RequestedAt (IST),ScheduledAt (IST),CompletedAt (IST),MeetingURL");
        for (AdminSessionRow r : adminService.getAllSessions()) {
            w.println(String.join(",",
                    csv(r.getSessionId()),
                    csv(r.getStudentName()),
                    csv(r.getStudentEmail()),
                    csv(r.getMentorName()),
                    csv(r.getCourseTitle()),
                    csv(r.getStatus()),
                    csv(r.getTopic()),
                    csv(r.getRequestedAt()),
                    csv(r.getScheduledAt()),
                    csv(r.getCompletedAt()),
                    csv(r.getMeetingUrl())));
        }
        w.flush();
    }

    @GetMapping("/export/revenue")
    public void exportRevenue(HttpServletResponse response) throws IOException {
        prepareCsv(response, "revenue");
        PrintWriter w = response.getWriter();
        w.println("PaymentID,StudentName,StudentEmail,Amount,Currency,Status,RazorpayPaymentID,RazorpayOrderID,CreatedAt (IST)");
        for (Payment p : adminRevenueService.getAllPaymentsRaw()) {
            w.println(String.join(",",
                    csv(p.getId()),
                    csv(p.getUser() != null ? p.getUser().getFullName() : null),
                    csv(p.getUser() != null ? p.getUser().getEmail() : null),
                    csv(p.getAmount()),
                    csv("INR"),
                    csv(p.getStatus()),
                    csv(p.getRazorpayPaymentId()),
                    csv(p.getRazorpayOrderId()),
                    csv(p.getCreatedAt())));
        }
        w.flush();
    }

    private void prepareCsv(HttpServletResponse response, String name) {
        response.setContentType("text/csv;charset=UTF-8");
        response.setHeader("Content-Disposition",
                "attachment; filename=spire-" + name + "-" + LocalDate.now() + ".csv");
    }

    private String csv(Object value) {
        if (value == null) return "";
        String s = value instanceof LocalDateTime
                ? ((LocalDateTime) value)
                        .atOffset(ZoneOffset.UTC)
                        .atZoneSameInstant(IST)
                        .toLocalDateTime()
                        .format(CSV_TS)
                : value.toString();
        boolean needsQuote = s.contains(",") || s.contains("\"") || s.contains("\n") || s.contains("\r");
        if (needsQuote) {
            s = "\"" + s.replace("\"", "\"\"") + "\"";
        }
        return s;
    }

    // ─── Phase 2B: document review queue ────────────────────────────

    /**
     * Returns all documents currently in PENDING review, oldest
     * first. Drives the Operations Admin "Documents" tab. Filter
     * by reviewStatus query param to view APPROVED / REJECTED /
     * NOT_APPLICABLE buckets.
     */
    @GetMapping("/documents")
    public ResponseEntity<ApiResponse<List<ParticipantDocumentDTO>>> listDocumentsForReview(
            @RequestParam(value = "status", required = false, defaultValue = "PENDING") String status) {
        List<ParticipantDocumentDTO> rows = adminService.getAllUsers(null).stream()
                .flatMap(u -> documentService.listForUser(u.getId()).stream())
                .filter(d -> status.equalsIgnoreCase(d.getReviewStatus()))
                .map(ParticipantDocumentDTO::from)
                .toList();
        return ResponseEntity.ok(ApiResponse.success(rows));
    }

    /**
     * Approve / reject a participant document. Body: { status:
     * "APPROVED"|"REJECTED", notes: "..." }. The participant sees
     * the notes on the rejected row so they know what to resubmit.
     */
    @PutMapping("/documents/{documentId}/review")
    public ResponseEntity<ApiResponse<ParticipantDocumentDTO>> reviewDocument(
            @PathVariable Long documentId,
            @RequestBody Map<String, String> body,
            Authentication auth) {
        Long reviewerId = Long.parseLong(auth.getPrincipal().toString());
        String newStatus = body.get("status");
        String notes = body.get("notes");
        ParticipantDocument saved = documentService.review(documentId, reviewerId, newStatus, notes);
        return ResponseEntity.ok(ApiResponse.success(
                "APPROVED".equals(newStatus) ? "Document approved" : "Document rejected",
                ParticipantDocumentDTO.from(saved)));
    }

    // ─── Phase 4: assignment queue (manual ERM / coach assignment) ──

    /**
     * Returns participants whose onboarding chain is stuck waiting
     * on a manual ERM / coach assignment. Used by the Operations
     * admin "Assignments" tab.
     */
    @GetMapping("/assignments/queue")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> assignmentQueue() {
        List<Map<String, Object>> rows = new java.util.ArrayList<>();
        // Anyone who's past program-selection but not yet at
        // DASHBOARD_ENABLED is potentially in the queue. We surface
        // the workflow status + which slots are pending.
        for (com.spire.backend.entity.User u : userRepository.findAll()) {
            String status = u.getCurrentStatus();
            if (status == null) continue;
            boolean pending = "SIGNED_AGREEMENT_SENT_TO_ERM".equals(status)
                    || "WELCOME_SENT".equals(status)
                    || "DEEPTHI_INTRO_SENT".equals(status)
                    || "ERM_ASSIGNED".equals(status)
                    || "COACHES_ASSIGNED".equals(status);
            if (!pending) continue;

            Map<String, Object> row = new java.util.LinkedHashMap<>();
            row.put("userId", u.getId());
            row.put("participantId", u.getParticipantId());
            row.put("fullName", u.getFullName());
            row.put("email", u.getEmail());
            row.put("skillset", u.getSelectedTechnology());
            row.put("currentStatus", status);
            row.put("ermAssigned", ermAssignmentService.getAssignedErm(u.getId()).isPresent());
            row.put("coachesAssigned", coachAssignmentService.hasAnyCoach(u.getId()));
            rows.add(row);
        }
        return ResponseEntity.ok(ApiResponse.success(rows));
    }

    /**
     * Manually assigns an ERM to a participant. Body: {@code
     * { ermUserId: 42 }}. After saving the assignment row, re-runs
     * the OnboardingService chain so the participant's workflow
     * rolls forward without waiting on a scheduled tick.
     */
    @PutMapping("/assignments/erm/{participantId}")
    public ResponseEntity<ApiResponse<Map<String, Object>>> assignErm(
            @PathVariable Long participantId,
            @RequestBody Map<String, Object> body) {
        Object ermIdRaw = body.get("ermUserId");
        if (ermIdRaw == null) throw new IllegalArgumentException("ermUserId is required");
        Long ermUserId = ermIdRaw instanceof Number n ? n.longValue() : Long.parseLong(ermIdRaw.toString());

        com.spire.backend.entity.User participant = userRepository.findById(participantId)
                .orElseThrow(() -> new com.spire.backend.exception.ResourceNotFoundException(
                        "User", "id", participantId));
        com.spire.backend.entity.User erm = userRepository.findById(ermUserId)
                .orElseThrow(() -> new com.spire.backend.exception.ResourceNotFoundException(
                        "User", "id", ermUserId));

        ErmAssignment row = ermAssignmentRepository
                .findFirstByUserIdOrderByAssignedDateDesc(participantId)
                .orElseGet(() -> ErmAssignment.builder().userId(participantId).build());
        row.setErmUserId(erm.getId());
        row.setIntroEmailStatus("SENT");
        ermAssignmentRepository.save(row);

        // Push the chain forward — this also fires the intro
        // emails and (if a coach was also assigned) opens the
        // dashboard.
        onboardingService.completeOnboarding(participant);
        com.spire.backend.entity.User refreshed = userRepository.findById(participantId).orElse(participant);
        return ResponseEntity.ok(ApiResponse.success(
                "ERM assigned",
                Map.of(
                        "ermUserId", erm.getId(),
                        "ermName", erm.getFullName() == null ? "" : erm.getFullName(),
                        "workflowStatus", refreshed.getCurrentStatus()
                )));
    }

    /**
     * Manually assigns a coach to a participant for a specific
     * coach_role. Body: {@code { coachUserId: 42, coachRole:
     * "CAREER_COACH" }}. Re-runs the OnboardingService chain after.
     */
    @PutMapping("/assignments/coach/{participantId}")
    public ResponseEntity<ApiResponse<Map<String, Object>>> assignCoach(
            @PathVariable Long participantId,
            @RequestBody Map<String, Object> body) {
        Object coachIdRaw = body.get("coachUserId");
        String coachRole = (String) body.get("coachRole");
        if (coachIdRaw == null || coachRole == null || coachRole.isBlank()) {
            throw new IllegalArgumentException("coachUserId and coachRole are required");
        }
        Long coachUserId = coachIdRaw instanceof Number n ? n.longValue() : Long.parseLong(coachIdRaw.toString());
        com.spire.backend.entity.User participant = userRepository.findById(participantId)
                .orElseThrow(() -> new com.spire.backend.exception.ResourceNotFoundException(
                        "User", "id", participantId));
        userRepository.findById(coachUserId)
                .orElseThrow(() -> new com.spire.backend.exception.ResourceNotFoundException(
                        "User", "id", coachUserId));

        // Replace any existing assignment for that role.
        coachAssignmentRepository
                .findByUserIdAndStatus(participantId, "ACTIVE")
                .stream()
                .filter(a -> coachRole.equals(a.getCoachRole()))
                .forEach(coachAssignmentRepository::delete);
        CoachAssignment row = CoachAssignment.builder()
                .userId(participantId)
                .coachUserId(coachUserId)
                .coachRole(coachRole)
                .status("ACTIVE")
                .build();
        coachAssignmentRepository.save(row);

        onboardingService.completeOnboarding(participant);
        com.spire.backend.entity.User refreshed = userRepository.findById(participantId).orElse(participant);
        return ResponseEntity.ok(ApiResponse.success(
                "Coach assigned",
                Map.of(
                        "coachUserId", coachUserId,
                        "coachRole", coachRole,
                        "workflowStatus", refreshed.getCurrentStatus()
                )));
    }
}
