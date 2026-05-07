package com.spire.backend.service;

import jakarta.mail.internet.InternetAddress;
import jakarta.mail.internet.MimeMessage;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

/**
 * Low-level transactional email sender. Wraps Spring's
 * {@link JavaMailSender} with a graceful no-op when SMTP isn't
 * configured (no MAIL_USERNAME / MAIL_PASSWORD in env), so dev
 * environments and the first deploys never crash a signup just
 * because email isn't wired yet.
 *
 * Sends are fire-and-forget {@code @Async} — a slow SMTP roundtrip
 * shouldn't block the request that triggered it. Any exception is
 * logged and swallowed; the user-facing operation already succeeded.
 *
 * Templates are built by {@link EmailTemplateService}; this class
 * only knows how to put bytes on the wire.
 */
@Service
@Slf4j
public class EmailService {

    @Autowired(required = false)
    private JavaMailSender mailSender;

    @Value("${spring.mail.username:}")
    private String smtpUsername;

    @Value("${spring.mail.from:noreply@spireinfotech.com}")
    private String fromAddress;

    /**
     * True when SMTP credentials and a custom from-address are
     * configured. The default placeholder address is treated as
     * "not configured" so a half-set env doesn't accidentally send.
     */
    public boolean isConfigured() {
        return mailSender != null
                && smtpUsername != null && !smtpUsername.isBlank();
    }

    /**
     * Sends an HTML email to one recipient. Silently skips when not
     * configured; logs and swallows on failure. Sync rather than
     * async — Gmail SMTP responds in ~200ms and the auth/enrollment
     * handlers we call from already run inside transactions; pulling
     * in @EnableAsync just for this would force us to wire an
     * executor and reason about transaction propagation.
     */
    public void sendEmail(String to, String subject, String htmlBody) {
        if (!isConfigured()) {
            log.warn("Mail not configured — skipping send: subject='{}' to='{}'", subject, to);
            return;
        }
        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
            // Display name is hardcoded so MAIL_FROM can be a bare
            // address (Gmail SMTP rejects "Name <addr@x>" passed via
            // env vars — control characters in the local part error).
            // The recipient sees: Spire Info Tech <noreply@…>
            helper.setFrom(new InternetAddress(fromAddress, "Spire Info Tech", "UTF-8"));
            helper.setTo(to);
            helper.setSubject(subject);
            helper.setText(htmlBody, true);
            mailSender.send(message);
            log.info("Sent email: subject='{}' to='{}'", subject, to);
        } catch (Exception e) {
            log.error("Email send failed: subject='{}' to='{}': {}", subject, to, e.getMessage());
        }
    }
}
