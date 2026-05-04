package com.spire.backend.controller;

import com.spire.backend.dto.*;
import com.spire.backend.entity.User;
import com.spire.backend.exception.ResourceNotFoundException;
import com.spire.backend.repository.UserRepository;
import com.spire.backend.service.InstructorRequestService;
import com.spire.backend.service.ProgressService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;


@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
public class UserController {

    private final UserRepository userRepository;
    private final ProgressService progressService;
    private final InstructorRequestService instructorRequestService;

    @GetMapping("/profile")
    public ResponseEntity<ApiResponse<UserDTO>> getProfile(Authentication authentication) {
        Long userId = Long.parseLong(authentication.getPrincipal().toString());
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", userId));
        return ResponseEntity.ok(ApiResponse.success(UserDTO.from(user)));
    }

    @PutMapping("/profile")
    public ResponseEntity<ApiResponse<UserDTO>> updateProfile(
            Authentication authentication, @Valid @RequestBody UpdateProfileRequest dto) {
        Long userId = Long.parseLong(authentication.getPrincipal().toString());
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", userId));

        if (dto.getFullName() != null) user.setFullName(dto.getFullName());
        if (dto.getAvatarUrl() != null) user.setAvatarUrl(dto.getAvatarUrl());
        if (dto.getBio() != null) user.setBio(dto.getBio());

        return ResponseEntity.ok(ApiResponse.success(UserDTO.from(userRepository.save(user))));
    }

    @PostMapping("/request-instructor")
    @PreAuthorize("hasRole('STUDENT')")
    public ResponseEntity<ApiResponse<String>> requestInstructor(Authentication authentication) {
        Long userId = Long.parseLong(authentication.getPrincipal().toString());
        instructorRequestService.requestInstructor(userId);
        return ResponseEntity.ok(ApiResponse.success("Instructor request submitted successfully"));
    }

    @PutMapping("/complete-onboarding")
    public ResponseEntity<ApiResponse<UserDTO>> completeOnboarding(Authentication authentication) {
        Long userId = Long.parseLong(authentication.getPrincipal().toString());
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", userId));
        user.setOnboardingCompleted(true);
        return ResponseEntity.ok(ApiResponse.success("Onboarding completed", UserDTO.from(userRepository.save(user))));
    }

    @GetMapping("/progress")
    public ResponseEntity<ApiResponse<List<ProgressDTO>>> getProgress(Authentication authentication) {
        Long userId = Long.parseLong(authentication.getPrincipal().toString());
        return ResponseEntity.ok(ApiResponse.success(progressService.getUserProgress(userId)));
    }

    @PutMapping("/progress/{courseId}")
    public ResponseEntity<ApiResponse<ProgressDTO>> updateProgress(
            Authentication authentication,
            @PathVariable Long courseId,
            @RequestBody ProgressDTO dto) {
        Long userId = Long.parseLong(authentication.getPrincipal().toString());
        return ResponseEntity.ok(ApiResponse.success(progressService.updateProgress(userId, courseId, dto)));
    }
}
