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

    // ─── Terms text (14 sections, frozen at v1.0) ───────────────────
    // Edits to this list bump the agreement version implicitly —
    // existing acceptance rows stamp the old version string at
    // accept time, so historic consents stay attributable.
    private static final List<Map<String, String>> TERMS_SECTIONS = List.of(
            sec("1. Introduction",
                    "Welcome to Spire Info Tech (\"Company\", \"we\", \"us\"). By creating an account and using our platform at spireinfotech.vercel.app, you agree to be bound by these Terms of Service and our Privacy Policy. If you do not agree, please do not use our services."),
            sec("2. Definitions",
                    "\"Platform\" refers to the Spire Info Tech website and all related services. \"User\" refers to any individual who creates an account. \"Content\" refers to all courses, video lessons, quizzes, assignments, and educational materials. \"Mentor\" refers to an instructor assigned to guide a User. \"Services\" refers to career services including resume preparation, interview training, LinkedIn optimization, and placement assistance."),
            sec("3. User Accounts",
                    "You must provide accurate and complete information when creating your account. You are responsible for maintaining the confidentiality of your login credentials. You must be at least 18 years of age or have parental/guardian consent. Each individual may maintain only one account. You agree to notify us immediately of any unauthorized use of your account."),
            sec("4. Course Content & Intellectual Property",
                    "All course content, including but not limited to video lessons, quizzes, assignments, code samples, and supplementary materials, is the intellectual property of Spire Info Tech and its respective instructors. You are granted a limited, non-exclusive, non-transferable license to access content solely for personal educational purposes. You may NOT record, screenshot, download, copy, distribute, share, or redistribute any course content by any means. You may NOT use screen recording software, capture tools, or any other method to capture course content. Violation of these terms may result in immediate account termination without refund and may subject you to legal action under applicable copyright laws."),
            sec("5. Payments & Refunds",
                    "All course prices are listed in Indian Rupees (INR) and are one-time payments granting lifetime access to the purchased course. Refund requests must be submitted within 7 days of purchase. No refunds will be issued if you have accessed more than 25% of the course content. Custom pricing agreements made through our Contact Sales feature are binding once accepted. Spire Info Tech reserves the right to modify pricing at any time. Existing purchases are not affected by price changes."),
            sec("6. Mentorship",
                    "Each course enrollment includes assignment of a personal mentor. Mentors provide guidance, feedback, and support but do not guarantee specific learning outcomes or career results. Session scheduling is subject to mentor availability. Users must attend scheduled sessions or cancel at least 24 hours in advance. Repeated no-shows may result in reduced session privileges. The mentor-student relationship is limited to the platform and course scope."),
            sec("7. Certificates",
                    "Certificates of completion are issued upon finishing all course requirements including lessons and assessments. Each certificate includes a unique verification number that can be independently verified at our verification page. Certificates represent completion of coursework and do not constitute a degree, diploma, or professional certification. Misrepresentation of certificate credentials is strictly prohibited."),
            sec("8. Privacy & Data Collection",
                    "We collect personal information including: name, email address, phone number, learning activity data, IP addresses, browser information, and device details. This data is used for: platform operation and improvement, communication regarding your account and courses, security monitoring and fraud prevention, and analytics to improve our services. We do NOT sell, rent, or trade your personal information to third parties. Activity logs and learning records are maintained for security, audit, and evidence purposes. You may request a complete export of your data or request deletion of your account by contacting support."),
            sec("9. Content Protection Monitoring",
                    "Our platform employs various security measures to protect course content, including but not limited to: browser-level protections against unauthorized copying, watermarking technology that identifies the viewing user, activity monitoring to detect potential content theft, and session tracking for security purposes. By using our platform, you consent to these protective measures. Attempting to circumvent content protection measures is a violation of these terms."),
            sec("10. Account Termination",
                    "Spire Info Tech reserves the right to suspend or terminate your account at any time for violation of these Terms of Service, including but not limited to: unauthorized content distribution, fraudulent activity, abusive behavior toward mentors or staff, or any other conduct deemed harmful to the platform or its users. Users may request voluntary account deletion through the support page. Upon termination, access to all courses and content is immediately revoked."),
            sec("11. Limitation of Liability",
                    "The platform and all content are provided on an \"as is\" and \"as available\" basis. Spire Info Tech makes no warranties regarding the accuracy, completeness, or reliability of any content. We are not liable for any direct, indirect, incidental, or consequential damages arising from your use of the platform. We do not guarantee specific career outcomes, job placements, or salary increases as a result of completing our courses or services."),
            sec("12. Changes to Terms",
                    "Spire Info Tech reserves the right to update or modify these Terms of Service at any time. Users will be notified of significant changes via email and/or platform notification. Continued use of the platform after changes constitutes acceptance of the updated terms. For major changes, users may be required to re-accept the updated terms."),
            sec("13. Governing Law & Dispute Resolution",
                    "These Terms of Service shall be governed by and construed in accordance with the laws of India. Any disputes arising from or relating to these terms shall be subject to the exclusive jurisdiction of the courts in Hyderabad, Telangana, India. Both parties agree to attempt to resolve any disputes through good-faith negotiation before pursuing legal action."),
            sec("14. Contact Information",
                    "For any questions or concerns regarding these Terms of Service, please contact us at: Email: noreply@spireitco.com | Website: spireinfotech.vercel.app/support | Address: Hyderabad, Telangana, India")
    );

    private static Map<String, String> sec(String title, String content) {
        return Map.of("title", title, "content", content);
    }
}
