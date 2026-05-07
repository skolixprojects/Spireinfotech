package com.spire.backend.controller;

import com.spire.backend.service.EmailService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Map;

/**
 * TODO: Remove this test endpoint before production launch.
 *
 * Unauthenticated email-delivery probe used during the email
 * rollout. Hits the real {@link EmailService} so it confirms SMTP
 * creds, "From" header rendering, and template HTML in one round
 * trip — no real user account or signup needed.
 *
 * Public on purpose: lets us check delivery from the homepage
 * without a login, but that means anyone can pump emails through
 * here, so it must come out before going live.
 */
@RestController
@RequestMapping("/api/test")
@RequiredArgsConstructor
@Slf4j
public class TestController {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");
    private static final DateTimeFormatter STAMP =
            DateTimeFormatter.ofPattern("d MMM yyyy, h:mm a");

    private final EmailService emailService;

    @GetMapping("/send-email")
    public ResponseEntity<Map<String, Object>> testEmail(@RequestParam String to) {
        if (!emailService.isConfigured()) {
            return ResponseEntity.ok(Map.of(
                    "success", false,
                    "message", "Email is not configured on the server (MAIL_USERNAME / MAIL_PASSWORD missing)."
            ));
        }
        try {
            String stamp = LocalDateTime.now(IST).format(STAMP);
            emailService.sendEmail(
                    to,
                    "Test Email from Spire Info Tech",
                    "<div style='font-family:Arial,Helvetica,sans-serif; padding:24px; max-width:520px; margin:0 auto;'>"
                            + "<h2 style='color:#0F766E; margin:0 0 12px;'>It works!</h2>"
                            + "<p style='color:#374151; margin:0 0 12px;'>This is a test email from Spire Info Tech.</p>"
                            + "<p style='color:#374151; margin:0 0 16px;'>If you see this, your email system is configured correctly.</p>"
                            + "<p style='color:#6b7280; font-size:12px; margin:0;'>Sent at: " + stamp + " IST</p>"
                            + "</div>"
            );
            log.info("Test email triggered to {}", to);
            return ResponseEntity.ok(Map.of(
                    "success", true,
                    "message", "Email sent to " + to
            ));
        } catch (Exception e) {
            log.error("Test email failed to {}: {}", to, e.getMessage());
            return ResponseEntity.ok(Map.of(
                    "success", false,
                    "message", "Failed: " + e.getMessage()
            ));
        }
    }
}
