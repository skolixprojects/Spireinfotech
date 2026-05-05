package com.spire.backend.controller;

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
