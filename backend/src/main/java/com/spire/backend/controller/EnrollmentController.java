package com.spire.backend.controller;

import com.spire.backend.dto.ApiResponse;
import com.spire.backend.dto.CourseDTO;
import com.spire.backend.dto.MentorInfoDTO;
import com.spire.backend.service.EnrollmentService;
import com.spire.backend.service.MentorAssignmentService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;


@RestController
@RequestMapping("/api/enrollments")
@RequiredArgsConstructor
public class EnrollmentController {

    private final EnrollmentService enrollmentService;
    private final MentorAssignmentService mentorAssignmentService;

    @PostMapping("/{courseId}")
    public ResponseEntity<ApiResponse<Void>> enroll(
            Authentication authentication, @PathVariable Long courseId) {
        Long userId = Long.parseLong(authentication.getPrincipal().toString());
        enrollmentService.enrollUser(userId, courseId);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success("Enrolled successfully", null));
    }

    @GetMapping
    public ResponseEntity<ApiResponse<List<CourseDTO>>> getEnrollments(Authentication authentication) {
        Long userId = Long.parseLong(authentication.getPrincipal().toString());
        return ResponseEntity.ok(ApiResponse.success(enrollmentService.getUserEnrollments(userId)));
    }

    // Resolves the current user's mentor info for a given course (via enrollment lookup).
    // Returns 404 if the user is not enrolled in the course.
    @GetMapping("/courses/{courseId}/mentor")
    public ResponseEntity<ApiResponse<MentorInfoDTO>> getMyMentorForCourse(
            @PathVariable Long courseId, Authentication authentication) {
        Long userId = Long.parseLong(authentication.getPrincipal().toString());
        return ResponseEntity.ok(ApiResponse.success(
                mentorAssignmentService.getMentorInfoForCourse(userId, courseId)));
    }
}
