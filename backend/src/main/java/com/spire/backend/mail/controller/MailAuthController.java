package com.spire.backend.mail.controller;

import com.spire.backend.dto.ApiResponse;
import com.spire.backend.mail.dto.MailAccountSummary;
import com.spire.backend.mail.dto.MailAuthResponse;
import com.spire.backend.mail.dto.MailChangePasswordRequest;
import com.spire.backend.mail.dto.MailLoginRequest;
import com.spire.backend.mail.dto.MailRefreshRequest;
import com.spire.backend.mail.security.MailPrincipal;
import com.spire.backend.mail.service.MailAuthService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

/**
 * Mail authentication endpoints. Login / refresh live under
 * {@code /api/mail/auth/**} (public on the mail security chain);
 * {@code /api/mail/me} and {@code /api/mail/me/change-password} sit outside
 * {@code /auth} so they are covered by the chain's {@code authenticated()} rule.
 */
@RestController
@RequestMapping("/api/mail")
@RequiredArgsConstructor
public class MailAuthController {

    private final MailAuthService mailAuthService;

    @PostMapping("/auth/login")
    public ResponseEntity<ApiResponse<MailAuthResponse>> login(
            @Valid @RequestBody MailLoginRequest request) {
        MailAuthResponse response = mailAuthService.login(request.getEmail(), request.getPassword());
        boolean mustChange = response.getAccount() != null
                && Boolean.TRUE.equals(response.getAccount().getMustChangePassword());
        String message = mustChange ? "Password change required" : "Login successful";
        return ResponseEntity.ok(ApiResponse.success(message, response));
    }

    @PostMapping("/auth/refresh")
    public ResponseEntity<ApiResponse<MailAuthResponse>> refresh(
            @Valid @RequestBody MailRefreshRequest request) {
        MailAuthResponse response = mailAuthService.refresh(request.getRefreshToken());
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @GetMapping("/me")
    public ResponseEntity<ApiResponse<MailAccountSummary>> me(Authentication authentication) {
        MailPrincipal principal = (MailPrincipal) authentication.getPrincipal();
        MailAccountSummary summary = mailAuthService.me(principal.accountId());
        return ResponseEntity.ok(ApiResponse.success(summary));
    }

    /**
     * Authenticated self-change of the caller's own password (forced
     * first-login change, or voluntary). Outside {@code /auth/**} so the
     * mail chain requires a valid session — no token. Clears must-change.
     */
    @PostMapping("/me/change-password")
    public ResponseEntity<ApiResponse<MailAuthResponse>> changePassword(
            Authentication authentication, @Valid @RequestBody MailChangePasswordRequest request) {
        MailPrincipal principal = (MailPrincipal) authentication.getPrincipal();
        // Returns a FRESH, ungated session so the client immediately leaves the gate.
        MailAuthResponse session = mailAuthService.changePassword(principal.accountId(), request.getNewPassword());
        return ResponseEntity.ok(ApiResponse.success("Password updated", session));
    }
}
