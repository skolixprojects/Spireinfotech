package com.spire.backend.controller;

import com.spire.backend.dto.AdminEnrollmentRow;
import com.spire.backend.dto.AdminSessionRow;
import com.spire.backend.dto.ApiResponse;
import com.spire.backend.dto.CourseDTO;
import com.spire.backend.dto.InstructorRequestDTO;
import com.spire.backend.dto.ProfileDTO;
import com.spire.backend.dto.UserDTO;
import com.spire.backend.service.AdminService;
import com.spire.backend.service.CourseService;
import com.spire.backend.service.InstructorRequestService;
import com.spire.backend.service.ProfileService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

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
}
