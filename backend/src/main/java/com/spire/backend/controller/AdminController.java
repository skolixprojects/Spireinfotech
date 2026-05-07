package com.spire.backend.controller;

import com.spire.backend.dto.AdminEnrollmentRow;
import com.spire.backend.dto.AdminSessionRow;
import com.spire.backend.dto.ApiResponse;
import com.spire.backend.dto.CourseDTO;
import com.spire.backend.dto.InstructorRequestDTO;
import com.spire.backend.dto.ProfileDTO;
import com.spire.backend.dto.UserDTO;
import com.spire.backend.entity.Payment;
import com.spire.backend.service.AdminRevenueService;
import com.spire.backend.service.AdminService;
import com.spire.backend.service.CourseService;
import com.spire.backend.service.InstructorRequestService;
import com.spire.backend.service.ProfileService;
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
    public ResponseEntity<ApiResponse<List<UserDTO>>> getAllUsers() {
        return ResponseEntity.ok(ApiResponse.success(adminService.getAllUsers()));
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
}
