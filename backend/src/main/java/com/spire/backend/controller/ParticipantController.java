package com.spire.backend.controller;

import com.spire.backend.dto.ApiResponse;
import com.spire.backend.dto.ParticipantEnrollRequest;
import com.spire.backend.dto.RegistrationResponse;
import com.spire.backend.dto.UserDTO;
import com.spire.backend.entity.User;
import com.spire.backend.exception.ResourceNotFoundException;
import com.spire.backend.repository.UserRepository;
import com.spire.backend.service.AuthService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

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
}
