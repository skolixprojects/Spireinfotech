package com.spire.backend.mail.controller;

import com.spire.backend.dto.ApiResponse;
import com.spire.backend.mail.dto.MailAccountSummary;
import com.spire.backend.mail.dto.MailAuthResponse;
import com.spire.backend.mail.dto.MailLoginRequest;
import com.spire.backend.mail.dto.MailRefreshRequest;
import com.spire.backend.mail.dto.MailSetPasswordRequest;
import com.spire.backend.mail.security.MailPrincipal;
import com.spire.backend.mail.service.MailAuthService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

/**
 * Mail authentication endpoints. Login / refresh / set-password live
 * under {@code /api/mail/auth/**} (public on the mail security chain);
 * {@code /api/mail/me} sits outside {@code /auth} so it is covered by
 * the chain's {@code authenticated()} rule.
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
        String message = Boolean.TRUE.equals(response.getMustChangePassword())
                ? "Password change required"
                : "Login successful";
        return ResponseEntity.ok(ApiResponse.success(message, response));
    }

    @PostMapping("/auth/refresh")
    public ResponseEntity<ApiResponse<MailAuthResponse>> refresh(
            @Valid @RequestBody MailRefreshRequest request) {
        MailAuthResponse response = mailAuthService.refresh(request.getRefreshToken());
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @PostMapping("/auth/set-password")
    public ResponseEntity<ApiResponse<MailAuthResponse>> setPassword(
            @Valid @RequestBody MailSetPasswordRequest request) {
        MailAuthResponse response = mailAuthService.setPassword(request.getToken(), request.getNewPassword());
        return ResponseEntity.ok(ApiResponse.success("Password updated", response));
    }

    @GetMapping("/me")
    public ResponseEntity<ApiResponse<MailAccountSummary>> me(Authentication authentication) {
        MailPrincipal principal = (MailPrincipal) authentication.getPrincipal();
        MailAccountSummary summary = mailAuthService.me(principal.accountId());
        return ResponseEntity.ok(ApiResponse.success(summary));
    }
}
