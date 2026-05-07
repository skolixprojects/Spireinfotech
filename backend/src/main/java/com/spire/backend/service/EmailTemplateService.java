package com.spire.backend.service;

import com.spire.backend.entity.Certificate;
import com.spire.backend.entity.Course;
import com.spire.backend.entity.SessionRequest;
import com.spire.backend.entity.User;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Locale;

/**
 * Builds and dispatches every transactional email the platform
 * sends. Each public method maps to one of the ten template
 * categories the product spec defines; a single {@link #wrap}
 * helper renders the shared chrome (teal header + body card +
 * footer) so individual emails stay terse.
 *
 * Templates are inline string-builders rather than a templating
 * engine — keeps the dependency footprint small (no Thymeleaf /
 * Mustache) and the markup is small enough that the duplication
 * doesn't matter. If the template count grows past ~20 we'd switch.
 *
 * Every send delegates to {@link EmailService}, which silently
 * skips when SMTP isn't configured.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class EmailTemplateService {

    private static final DateTimeFormatter DATE_FMT =
            DateTimeFormatter.ofPattern("d MMM yyyy, h:mm a", Locale.ENGLISH);
    private static final DateTimeFormatter DATE_ONLY_FMT =
            DateTimeFormatter.ofPattern("d MMM yyyy", Locale.ENGLISH);
    private static final DateTimeFormatter TIME_ONLY_FMT =
            DateTimeFormatter.ofPattern("h:mm a", Locale.ENGLISH);
    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    private final EmailService emailService;

    @Value("${app.url:https://spireinfotech.vercel.app}")
    private String appUrl;

    // ── 1. Welcome ──────────────────────────────────────────────────
    public void sendWelcomeEmail(User user) {
        String body = p("You've joined a learning platform where every course comes with personal mentorship.")
                + p("Here's what you can do:")
                + bullet("Browse self-paced courses in tech, design, and data science")
                + bullet("Get matched with a personal mentor")
                + bullet("Earn verified certificates")
                + button("Browse Courses", appUrl + "/courses")
                + p("Need help? Reply to this email or visit our support page.");
        emailService.sendEmail(
                user.getEmail(),
                "Welcome to Spire Info Tech!",
                wrap("Welcome, " + firstName(user) + "!", body)
        );
    }

    // ── 2. Email verification (6-digit OTP) ─────────────────────────
    public void sendVerificationCodeEmail(User user, String code) {
        // Big, centered code block — built inline rather than reusing
        // button() because the styling is intentionally distinct
        // (huge letter-spaced number on a teal-tinted card) so the
        // recipient's eye lands on the code immediately.
        String codeBlock =
                "<div style=\"text-align:center; margin:24px 0;\">"
                        + "<span style=\"display:inline-block; font-size:32px; font-weight:bold; "
                        + "letter-spacing:8px; color:#0F766E; background:#f0fdf9; "
                        + "padding:12px 24px; border-radius:8px; "
                        + "border:1px solid rgba(15,118,110,0.2); font-family:'Courier New',monospace;\">"
                        + escape(code)
                        + "</span>"
                        + "</div>";

        String body = p("Hi " + firstName(user) + ",")
                + p("Your verification code is:")
                + codeBlock
                + p("This code expires in 10 minutes.")
                + muted("If you didn't create an account on Spire Info Tech, you can safely ignore this email.");
        emailService.sendEmail(
                user.getEmail(),
                "Your verification code: " + code,
                wrap("Verify your email", body)
        );
    }

    /**
     * @deprecated Legacy magic-link flow. Kept compiling so any
     * straggling callers don't break, but unused under the OTP gate;
     * remove after the next deploy when the call sites are confirmed
     * gone from staging.
     */
    @Deprecated
    public void sendVerificationEmail(User user, String token) {
        String url = appUrl + "/verify-email?token=" + token;
        String body = p("Hi " + firstName(user) + ",")
                + p("Please verify your email to activate your account.")
                + button("Verify Email", url)
                + p("This link expires in 24 hours.")
                + muted("If you didn't create an account, ignore this email.");
        emailService.sendEmail(
                user.getEmail(),
                "Verify your email — Spire Info Tech",
                wrap("Verify your email", body)
        );
    }

    // ── 3. Password reset ───────────────────────────────────────────
    public void sendPasswordResetEmail(User user, String token) {
        String url = appUrl + "/reset-password?token=" + token;
        String body = p("Hi " + firstName(user) + ",")
                + p("We received a request to reset your password.")
                + button("Reset Password", url)
                + p("This link expires in 1 hour.")
                + muted("If you didn't request this, ignore this email. Your password won't change.");
        emailService.sendEmail(
                user.getEmail(),
                "Reset your password — Spire Info Tech",
                wrap("Reset your password", body)
        );
    }

    // ── 4. Payment receipt ──────────────────────────────────────────
    public void sendPaymentReceiptEmail(
            User user, Course course, BigDecimal amount, String paymentId
    ) {
        String date = java.time.LocalDateTime.now(IST).format(DATE_FMT);
        String courseUrl = appUrl + "/courses/" + course.getId();
        String body = p("Hi " + firstName(user) + ",")
                + p("Your payment has been processed successfully.")
                + receipt(
                        "Course: " + course.getTitle(),
                        "Amount: ₹" + (amount == null ? "—" : amount.toPlainString()),
                        "Date: " + date + " IST",
                        "Payment ID: " + (paymentId == null ? "—" : paymentId)
                )
                + button("Go to Course", courseUrl)
                + muted("This email is your receipt. Save it for your records.");
        emailService.sendEmail(
                user.getEmail(),
                "Payment confirmed — ₹" + (amount == null ? "0" : amount.toPlainString()),
                wrap("Payment confirmed", body)
        );
    }

    // ── 5. Enrollment confirmation ──────────────────────────────────
    public void sendEnrollmentEmail(
            User user, Course course, int lessonCount, int moduleCount, String mentorName
    ) {
        String courseUrl = appUrl + "/courses/" + course.getId();
        String mentorLine = mentorName == null || mentorName.isBlank()
                ? "Your mentor will be assigned shortly"
                : "Your mentor: " + mentorName;
        String body = p("Hi " + firstName(user) + ",")
                + p("You've been enrolled in <strong>" + escape(course.getTitle()) + "</strong>.")
                + p("Here's what's waiting for you:")
                + bullet(lessonCount + " lessons across " + moduleCount + " modules")
                + bullet(mentorLine)
                + bullet("Quizzes and assessments")
                + bullet("Certificate on completion")
                + button("Start Learning", courseUrl);
        emailService.sendEmail(
                user.getEmail(),
                "You're enrolled in " + course.getTitle() + "!",
                wrap("You're in!", body)
        );
    }

    // ── 6. Certificate delivery ─────────────────────────────────────
    public void sendCertificateEmail(User user, Course course, Certificate cert) {
        String pdfUrl = cert.getCertificateUrl() == null ? appUrl
                : (cert.getCertificateUrl().startsWith("http")
                        ? cert.getCertificateUrl()
                        : appUrl.replaceAll("/$", "")
                                + "/api/certificates/" + cert.getCertificateId() + "/download");
        String verifyUrl = appUrl + "/verify/" + cert.getCertificateId();
        String linkedIn = "https://www.linkedin.com/sharing/share-offsite/?url="
                + java.net.URLEncoder.encode(verifyUrl, java.nio.charset.StandardCharsets.UTF_8);
        String body = p("You've completed <strong>" + escape(course.getTitle())
                        + "</strong> on Spire Info Tech!")
                + p("Your certificate is ready.")
                + receipt("Certificate ID: " + cert.getCertificateId())
                + button("Download Certificate", pdfUrl)
                + secondaryButton("Verify Certificate", verifyUrl)
                + p("Share your achievement: "
                        + "<a href=\"" + linkedIn + "\" style=\"color:#0F766E; text-decoration:none; font-weight:bold;\">Share on LinkedIn →</a>")
                + muted("Keep learning — browse more courses at Spire Info Tech.");
        emailService.sendEmail(
                user.getEmail(),
                "Certificate earned — " + course.getTitle(),
                wrap("Congratulations, " + firstName(user) + "!", body)
        );
    }

    // ── 7. Mentor assigned ──────────────────────────────────────────
    public void sendMentorAssignedEmail(User user, User mentor, Course course) {
        String courseUrl = appUrl + "/courses/" + course.getId();
        String body = p("Hi " + firstName(user) + ",")
                + p("Great news — a mentor has been assigned to help you through <strong>"
                        + escape(course.getTitle()) + "</strong>.")
                + receipt(
                        "Mentor: " + mentor.getFullName(),
                        "Email: " + mentor.getEmail()
                )
                + p("You can request 1:1 sessions with your mentor anytime from your course page.")
                + button("Go to Course", courseUrl);
        emailService.sendEmail(
                user.getEmail(),
                "Meet your mentor for " + course.getTitle(),
                wrap("You have a mentor!", body)
        );
    }

    // ── 8. Session scheduled ────────────────────────────────────────
    public void sendSessionScheduledEmail(User student, SessionRequest session) {
        if (session.getScheduledAt() == null) return;
        String date = session.getScheduledAt().format(DATE_ONLY_FMT);
        String time = session.getScheduledAt().format(TIME_ONLY_FMT);
        // SessionRequest -> MentorAssignment -> {Enrollment, mentor User}
        // Pull through both legs; mentor can be null while a pool slot
        // is still pending, but at the point we're emailing a scheduled
        // session it will always be populated.
        var assignment = session.getMentorAssignment();
        String mentorName = assignment.getMentor() != null
                ? assignment.getMentor().getFullName() : "Your mentor";
        String courseTitle = assignment.getEnrollment().getCourse().getTitle();
        String topic = session.getTopic() == null ? "—" : session.getTopic();
        String meetingUrl = session.getMeetingUrl() == null ? appUrl + "/dashboard" : session.getMeetingUrl();
        String body = p("Hi " + firstName(student) + ",")
                + p("Your session has been scheduled:")
                + receipt(
                        "Date: " + date,
                        "Time: " + time + " IST",
                        "Mentor: " + mentorName,
                        "Course: " + courseTitle,
                        "Topic: " + topic
                )
                + button("Join Meeting", meetingUrl)
                + muted("Add this to your calendar. Your mentor will be waiting.");
        emailService.sendEmail(
                student.getEmail(),
                "Session scheduled — " + date + " at " + time + " IST",
                wrap("Session confirmed", body)
        );
    }

    // ── 9. Inactive nudge (7-day) ───────────────────────────────────
    public void sendInactiveNudgeEmail(
            User user, String courseTitle, int progressPercent, String mentorName, String lessonUrl
    ) {
        String mentorLine = mentorName == null || mentorName.isBlank()
                ? "Your mentor is still here to help."
                : "Your mentor " + mentorName + " is still here to help.";
        String body = p("Hi " + firstName(user) + ",")
                + p("It's been a while since you visited Spire Info Tech.")
                + p("You were making great progress on <strong>" + escape(courseTitle)
                        + "</strong> — " + progressPercent + "% done!")
                + p(mentorLine)
                + button("Continue Learning", lessonUrl)
                + muted("Small steps count. Even 15 minutes today can make a difference.");
        emailService.sendEmail(
                user.getEmail(),
                "We miss you, " + firstName(user) + "!",
                wrap("Pick up where you left off", body)
        );
    }

    // ── 10. Sales reply notification ────────────────────────────────
    public void sendSalesReplyEmail(
            User student, String instructorName, String courseTitle,
            String messagePreview, long inquiryId
    ) {
        String url = appUrl + "/messages/" + inquiryId;
        String preview = messagePreview == null ? ""
                : (messagePreview.length() > 200
                        ? messagePreview.substring(0, 200) + "…"
                        : messagePreview);
        String body = p("Hi " + firstName(student) + ",")
                + p("<strong>" + escape(instructorName) + "</strong> replied to your inquiry about <strong>"
                        + escape(courseTitle) + "</strong>:")
                + quote(escape(preview))
                + button("View Conversation", url);
        emailService.sendEmail(
                student.getEmail(),
                "You have a reply about " + courseTitle,
                wrap("New message from " + instructorName, body)
        );
    }

    // ───────────────────────────────────────────────────────────────
    // Markup helpers
    // ───────────────────────────────────────────────────────────────

    private String wrap(String title, String body) {
        return """
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8"></head>
        <body style="margin:0; padding:0; background:#f4f4f5; font-family:Arial,Helvetica,sans-serif;">
          <table width="100%%" cellpadding="0" cellspacing="0" style="background:#f4f4f5; padding:40px 0;">
            <tr><td align="center">
              <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.06);">
                <tr>
                  <td style="background:#0F766E; padding:24px 32px; text-align:center;">
                    <h1 style="margin:0; color:#ffffff; font-size:20px; font-weight:bold;">Spire Info Tech</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding:32px;">
                    <h2 style="margin:0 0 16px; color:#111827; font-size:22px; font-weight:bold;">%s</h2>
                    %s
                  </td>
                </tr>
                <tr>
                  <td style="padding:20px 32px; background:#f9fafb; border-top:1px solid #e5e7eb; text-align:center;">
                    <p style="margin:0; color:#9ca3af; font-size:12px;">© 2026 Spire Info Tech</p>
                    <p style="margin:4px 0 0; color:#9ca3af; font-size:12px;">
                      <a href="%s" style="color:#0F766E; text-decoration:none;">spireinfotech.vercel.app</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td></tr>
          </table>
        </body>
        </html>
        """.formatted(escape(title), body, appUrl);
    }

    private static String p(String html) {
        return "<p style=\"margin:0 0 12px; color:#374151; font-size:15px; line-height:1.7;\">"
                + html + "</p>";
    }

    private static String muted(String text) {
        return "<p style=\"margin:16px 0 0; color:#9ca3af; font-size:13px; line-height:1.6;\">"
                + escape(text) + "</p>";
    }

    private static String bullet(String text) {
        return "<p style=\"margin:0 0 6px 0; color:#374151; font-size:14px; line-height:1.6;\">"
                + "✓ " + escape(text) + "</p>";
    }

    private static String button(String label, String url) {
        return """
        <table cellpadding="0" cellspacing="0" style="margin:24px 0;">
          <tr><td style="background:#0F766E; border-radius:8px;">
            <a href="%s" style="display:inline-block; padding:12px 28px; color:#ffffff; text-decoration:none; font-size:14px; font-weight:bold;">%s</a>
          </td></tr>
        </table>
        """.formatted(url, escape(label));
    }

    private static String secondaryButton(String label, String url) {
        return """
        <table cellpadding="0" cellspacing="0" style="margin:8px 0 24px;">
          <tr><td style="background:#ffffff; border:1px solid #0F766E; border-radius:8px;">
            <a href="%s" style="display:inline-block; padding:11px 28px; color:#0F766E; text-decoration:none; font-size:14px; font-weight:bold;">%s</a>
          </td></tr>
        </table>
        """.formatted(url, escape(label));
    }

    /** Bordered "receipt" block — used for payment / cert / session details. */
    private static String receipt(String... lines) {
        StringBuilder sb = new StringBuilder(
                "<div style=\"background:#f9fafb; border:1px solid #e5e7eb; border-radius:8px; padding:16px; margin:16px 0;\">");
        for (int i = 0; i < lines.length; i++) {
            sb.append("<p style=\"margin:")
              .append(i == 0 ? "0" : "6px 0 0")
              .append("; color:#374151; font-size:14px; font-family:'Courier New',monospace;\">")
              .append(escape(lines[i]))
              .append("</p>");
        }
        sb.append("</div>");
        return sb.toString();
    }

    /** Inline blockquote — used for the sales reply preview. */
    private static String quote(String text) {
        return "<div style=\"background:#f9fafb; border-left:3px solid #0F766E; "
                + "padding:12px 16px; margin:16px 0; border-radius:4px;\">"
                + "<p style=\"color:#374151; font-size:14px; margin:0; line-height:1.6;\">"
                + text + "</p></div>";
    }

    private static String firstName(User user) {
        if (user == null || user.getFullName() == null) return "there";
        String name = user.getFullName().trim();
        if (name.isEmpty()) return "there";
        int sp = name.indexOf(' ');
        return sp > 0 ? name.substring(0, sp) : name;
    }

    /**
     * Minimal HTML escape — guards against quotes / angle brackets in
     * user-supplied fields (course titles, mentor names, message
     * previews) breaking the email layout. Not a full sanitiser; we
     * never inline raw user HTML.
     */
    private static String escape(String s) {
        if (s == null) return "";
        return s.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;");
    }
}
