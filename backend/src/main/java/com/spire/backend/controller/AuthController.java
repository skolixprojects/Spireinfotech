package com.spire.backend.controller;

import com.spire.backend.dto.*;
import com.spire.backend.service.AuthService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    @PostMapping("/register")
    public ResponseEntity<ApiResponse<AuthResponse>> register(@Valid @RequestBody RegisterRequest request) {
        AuthResponse response = authService.register(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success("Registration successful", response));
    }

    @PostMapping("/login")
    public ResponseEntity<ApiResponse<AuthResponse>> login(@Valid @RequestBody LoginRequest request) {
        AuthResponse response = authService.login(request);
        return ResponseEntity.ok(ApiResponse.success("Login successful", response));
    }

    @PostMapping("/refresh")
    public ResponseEntity<ApiResponse<AuthResponse>> refresh(@RequestBody Map<String, String> body) {
        String refreshToken = body.get("refreshToken");
        AuthResponse response = authService.refreshToken(refreshToken);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    /**
     * Email verification — public, idempotent. Frontend hits this on
     * page load when the user clicks the link in the verification
     * email. Returns valid:true on success, valid:false (200) for any
     * invalid/expired token so the client can render a friendly error
     * without parsing exceptions.
     */
    @GetMapping("/verify-email")
    public ResponseEntity<ApiResponse<Map<String, Object>>> verifyEmail(@RequestParam String token) {
        try {
            authService.verifyEmail(token);
            return ResponseEntity.ok(ApiResponse.success("Email verified", Map.of("valid", true)));
        } catch (Exception e) {
            return ResponseEntity.ok(ApiResponse.success(Map.of("valid", false, "reason", e.getMessage())));
        }
    }

    /**
     * Password reset request — always reports success (regardless of
     * whether the email is on file) so the response can't be used to
     * enumerate accounts. The actual email send only happens for
     * matching addresses inside the service.
     */
    @PostMapping("/forgot-password")
    public ResponseEntity<ApiResponse<Map<String, String>>> forgotPassword(
            @RequestBody Map<String, String> body) {
        String email = body.get("email");
        if (email == null || email.isBlank()) {
            throw new IllegalArgumentException("Email is required");
        }
        authService.requestPasswordReset(email);
        return ResponseEntity.ok(ApiResponse.success(Map.of(
                "message", "If that email is registered, a reset link has been sent."
        )));
    }

    @PostMapping("/reset-password")
    public ResponseEntity<ApiResponse<Map<String, String>>> resetPassword(
            @RequestBody Map<String, String> body) {
        String token = body.get("token");
        String newPassword = body.get("newPassword");
        if (token == null || token.isBlank()) {
            throw new IllegalArgumentException("Token is required");
        }
        authService.resetPassword(token, newPassword);
        return ResponseEntity.ok(ApiResponse.success(Map.of("message", "Password updated")));
    }
}
