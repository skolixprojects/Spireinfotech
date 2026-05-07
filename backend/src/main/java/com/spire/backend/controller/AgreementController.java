package com.spire.backend.controller;

import com.spire.backend.dto.ApiResponse;
import com.spire.backend.exception.UnauthorizedException;
import com.spire.backend.service.AgreementService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * Endpoints for the email-reply Terms-of-Service flow + the public
 * terms read.
 *
 *   POST /api/auth/agreement/accept         — fire "Reply YES" email (auth'd)
 *   POST /api/auth/agreement/resend         — resend current step (auth'd)
 *   GET  /api/auth/agreement/check-status   — frontend polling target (auth'd)
 *   GET  /api/auth/agreement/status         — alias for legacy callers (auth'd)
 *   POST /api/auth/agreement/verify-code    — confirm OTP (auth'd)
 *   POST /api/auth/agreement/process-reply  — Vercel cron callback (cron secret)
 *   GET  /api/agreement/terms               — current terms text (public)
 *
 * Mounted under /api/auth/* so they're exempt from the agreement
 * gate (otherwise users could never reach the flow that lets them
 * satisfy it).
 */
@RestController
@RequiredArgsConstructor
public class AgreementController {

    private final AgreementService agreementService;

    @Value("${agreement.cron.secret:}")
    private String cronSecret;

    // ─── Auth'd endpoints ───────────────────────────────────────────

    @PostMapping("/api/auth/agreement/accept")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<ApiResponse<Map<String, Object>>> acceptAgreement(
            @RequestBody Map<String, Object> body,
            Authentication auth,
            HttpServletRequest request) {
        Long userId = Long.parseLong(auth.getPrincipal().toString());
        String legalName = (String) body.get("legalName");
        boolean termsAccepted = Boolean.TRUE.equals(body.get("termsAccepted"));
        boolean contentPolicyAccepted = Boolean.TRUE.equals(body.get("contentPolicyAccepted"));

        Map<String, Object> data = agreementService.requestAcceptance(
                userId, legalName, termsAccepted, contentPolicyAccepted,
                clientIp(request), request.getHeader("User-Agent"));
        return ResponseEntity.ok(ApiResponse.success(data));
    }

    @PostMapping("/api/auth/agreement/verify-code")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<ApiResponse<Map<String, Object>>> verifyAgreement(
            @RequestBody Map<String, String> body,
            Authentication auth) {
        Long userId = Long.parseLong(auth.getPrincipal().toString());
        String code = body.get("code");
        if (code == null || code.isBlank()) {
            throw new IllegalArgumentException("Code is required");
        }
        agreementService.verifyAcceptanceCode(userId, code);
        return ResponseEntity.ok(ApiResponse.success(
                "Agreement accepted",
                Map.of("status", "VERIFIED", "accepted", true)));
    }

    /**
     * Backward-compatible alias for the original verify endpoint.
     * The post-reply flow uses /verify-code; older clients that
     * still post to /verify continue to work.
     */
    @PostMapping("/api/auth/agreement/verify")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<ApiResponse<Map<String, Object>>> verifyAgreementAlias(
            @RequestBody Map<String, String> body,
            Authentication auth) {
        return verifyAgreement(body, auth);
    }

    @PostMapping("/api/auth/agreement/resend")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<ApiResponse<Map<String, Object>>> resendAgreementCode(
            Authentication auth) {
        Long userId = Long.parseLong(auth.getPrincipal().toString());
        agreementService.resend(userId);
        return ResponseEntity.ok(ApiResponse.success(
                "Email resent",
                Map.of("cooldownSeconds", 60)));
    }

    @GetMapping({"/api/auth/agreement/status", "/api/auth/agreement/check-status"})
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getAgreementStatus(
            Authentication auth) {
        Long userId = Long.parseLong(auth.getPrincipal().toString());
        return ResponseEntity.ok(ApiResponse.success(agreementService.getStatus(userId)));
    }

    // ─── Cron callback (no auth — gated by shared secret) ───────────

    /**
     * Called by the Vercel IMAP cron after it detects a YES reply.
     * Authenticated via a shared secret rather than a JWT because
     * the caller is a serverless function, not a user. If the
     * secret is unset on the backend, we refuse — empty-string
     * matches would let any anonymous caller in.
     */
    @PostMapping("/api/auth/agreement/process-reply")
    public ResponseEntity<ApiResponse<Map<String, Object>>> processReply(
            @RequestHeader(value = "X-Cron-Secret", required = false) String headerSecret,
            @RequestBody Map<String, Object> body) {
        if (cronSecret == null || cronSecret.isBlank()
                || !cronSecret.equals(headerSecret)) {
            throw new UnauthorizedException("Invalid cron secret");
        }
        Object userIdRaw = body.get("userId");
        Object fromEmailRaw = body.get("fromEmail");
        Object replyRaw = body.get("replyContent");
        if (userIdRaw == null || fromEmailRaw == null) {
            throw new IllegalArgumentException("userId and fromEmail are required");
        }
        Long userId = userIdRaw instanceof Number
                ? ((Number) userIdRaw).longValue()
                : Long.parseLong(userIdRaw.toString());
        boolean processed = agreementService.processReply(
                userId, fromEmailRaw.toString(),
                replyRaw == null ? "YES" : replyRaw.toString());
        return ResponseEntity.ok(ApiResponse.success(Map.of(
                "processed", processed
        )));
    }

    // ─── Public: current terms text ─────────────────────────────────

    @GetMapping("/api/agreement/terms")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getTerms() {
        return ResponseEntity.ok(ApiResponse.success(Map.of(
                "version", AgreementService.CURRENT_VERSION,
                "lastUpdated", "2026-05-01",
                "sections", TERMS_SECTIONS
        )));
    }

    private static String clientIp(HttpServletRequest request) {
        String xff = request.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) {
            int comma = xff.indexOf(',');
            return (comma > 0 ? xff.substring(0, comma) : xff).trim();
        }
        return request.getRemoteAddr();
    }

    // ─── Terms text (matches PRODUCT.md) ────────────────────────────
    private static final List<Map<String, String>> TERMS_SECTIONS = List.of(
            sec("Introduction",
                    "Welcome to Spire Info Tech. By creating an account and using our platform, you agree to be bound by these Terms of Service and our Privacy Policy."),
            sec("Definitions",
                    "\"Platform\" means spireinfotech.vercel.app and related services. \"User\" means any person who creates an account. \"Content\" means courses, videos, quizzes, and materials. \"Mentor\" means an instructor assigned to guide a user."),
            sec("User Accounts",
                    "You must provide accurate information. Users must be 18+ or have parental consent. You are responsible for keeping your account credentials secure. One account per person."),
            sec("Course Content & Intellectual Property",
                    "All content is owned by Spire Info Tech and its instructors. Users may not record, screenshot, download, share, or redistribute any course content. Violation may result in account termination. Content is for personal learning only."),
            sec("Payments & Refunds",
                    "Course prices are one-time payments in INR. Refund requests must be made within 7 days of purchase. No refunds after accessing more than 25% of course content. Custom pricing agreements via Contact Sales are binding."),
            sec("Mentorship",
                    "Mentors provide guidance, not guaranteed outcomes. Session scheduling is subject to mentor availability. Users must attend scheduled sessions or cancel at least 24 hours in advance."),
            sec("Certificates",
                    "Certificates are issued upon course completion. Certificates can be verified at our verification page. Misrepresentation of certificates is prohibited."),
            sec("Privacy & Data Collection",
                    "We collect: name, email, phone, learning activity, IP address. We use data for: platform operation, communication, analytics. We do not sell personal data to third parties. Activity logs are maintained for security and audit. Users can request data export or deletion."),
            sec("Account Termination",
                    "We may terminate accounts for terms violation. Users can request account deletion via support. Upon termination, course access is revoked."),
            sec("Limitation of Liability",
                    "Platform is provided \"as is\". We are not liable for career outcomes. We are not liable for technical issues beyond reasonable control."),
            sec("Changes to Terms",
                    "We may update these terms with notice. Continued use after an update constitutes acceptance. Major changes will require re-acceptance."),
            sec("Governing Law",
                    "These terms are governed by the laws of India. Any disputes are subject to the jurisdiction of courts in Hyderabad."),
            sec("Contact",
                    "Email: noreply@spireitco.com. Website: spireinfotech.vercel.app/support.")
    );

    private static Map<String, String> sec(String title, String content) {
        return Map.of("title", title, "content", content);
    }
}
