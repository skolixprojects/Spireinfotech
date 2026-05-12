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

    /**
     * Internal operations mailbox that receives a CC of certain
     * lifecycle events (program selection, future review queues).
     * Empty default keeps the internal-copy branch a no-op when
     * the env var isn't set on a dev box.
     */
    @Value("${program.operations.email:}")
    private String operationsEmail;

    /** Phase 4 — program coordinator display name on the intro email. */
    @Value("${program.coordinator.name:Deepthi R}")
    private String coordinatorName;

    /** Phase 6 — finance team inbox for Phase 1 completion + check
     *  notifications. Empty default skips the finance copy. */
    @Value("${program.finance.email:}")
    private String financeEmail;

    // ── 1. Welcome (sent LAST, after agreement is fully accepted) ───
    /**
     * Final onboarding email. Fires after the user has completed
     * email verification and the OTP-confirmed agreement acceptance.
     *
     * Branches on whether the user is on the Phase 1-3B participant
     * lifecycle (has a participantId) or the legacy LMS flow (no
     * participantId, course-only). The Phase 4 copy primes the
     * participant for the team-assembly step that runs immediately
     * after; the legacy copy points them at the course catalog.
     */
    public void sendWelcomeEmail(User user) {
        String body;
        String subject;
        String title;
        if (user.getParticipantId() != null && !user.getParticipantId().isBlank()) {
            // Phase 4 — participant lifecycle.
            body = p("Dear " + escape(user.getFullName() == null ? "there" : user.getFullName()) + ",")
                    + p("Congratulations! Your enrollment is confirmed and your agreement is on file.")
                    + receipt(
                            "Participant ID: " + safe(user.getParticipantId()),
                            "Technology: " + safe(user.getSelectedTechnology())
                    )
                    + p("Your team is being assembled. You will receive introduction emails "
                            + "shortly with your:")
                    + bullet("Program Coordinator")
                    + bullet("Relationship Manager (ERM)")
                    + bullet("Career Coach and Technical Advisor")
                    + p("Once your team is ready, your dashboard will open with your "
                            + "personalised roadmap and next steps.")
                    + p("We're excited to support your career journey!")
                    + p("Regards,<br/>Spire Info Tech");
            subject = "Welcome to Spire Info Tech, " + firstName(user) + "!";
            title = "Welcome aboard, " + firstName(user) + "!";
        } else {
            // Legacy LMS flow.
            body = p("Hi " + firstName(user) + ",")
                    + p("You're all set! Your account is verified and your agreement is on file.")
                    + p("You've joined a learning platform where every course comes with personal "
                            + "mentorship, career services, and verified certificates.")
                    + p("Here's what to do next:")
                    + bullet("Browse courses and find your first one")
                    + bullet("Each course includes a dedicated mentor")
                    + bullet("Complete courses to earn verified certificates")
                    + button("Browse Courses", appUrl + "/courses")
                    + p("Welcome aboard!")
                    + muted("— The Spire Info Tech Team");
            subject = "Welcome to Spire Info Tech, " + firstName(user) + "!";
            title = "You're all set, " + firstName(user) + "!";
        }
        emailService.sendEmail(user.getEmail(), subject, wrap(title, body));
    }

    // ── 12. Weekly report reminder (Phase 5A — Mondays) ─────────────
    /**
     * Monday nudge for participants in WEEKLY_REPORTING_ACTIVE who
     * haven't submitted the current week's report yet. Best-effort —
     * the job logs and continues on any per-user failure.
     */
    public void sendWeeklyReminderEmail(User user, java.time.LocalDate weekStart, java.time.LocalDate weekEnd) {
        String first = firstName(user);
        String body = p("Hi " + escape(first) + ",")
                + p("A quick reminder that your weekly submission report for "
                        + escape(weekStart.toString()) + " – " + escape(weekEnd.toString())
                        + " is due. Logging your job submissions, resume activity, and any "
                        + "interview prep keeps your ERM in the loop and your roadmap on track.")
                + button("Submit Weekly Report", appUrl + "/dashboard")
                + muted("If you've already submitted, you can ignore this reminder.");
        emailService.sendEmail(user.getEmail(),
                "Weekly report due — Spire Info Tech",
                wrap("Your weekly report is due", body));
    }

    // ── 11. Coordinator intro (Phase 4 Step 12) ─────────────────────
    /**
     * "Meet your program coordinator" — fired right after the
     * welcome email. Coordinator name + email come from env
     * (program.coordinator.name / program.coordinator.email),
     * defaulting to the values shipped in the PRD spec.
     */
    public void sendCoordinatorIntroEmail(User user) {
        String coordName = coordinatorName == null || coordinatorName.isBlank()
                ? "Deepthi" : coordinatorName;
        String body = p("Dear " + escape(user.getFullName() == null ? "there" : user.getFullName()) + ",")
                + p("I'm " + escape(coordName) + ", your program coordinator at Spire Info Tech.")
                + p("I'll be overseeing your overall program experience and ensuring everything "
                        + "runs smoothly. If you have any general questions about the program, "
                        + "feel free to reach out.")
                + p("Your relationship manager will be introduced shortly — they'll be your "
                        + "primary point of contact going forward.")
                + p("Looking forward to working with you!")
                + p("Best regards,<br/>"
                        + escape(coordName) + "<br/>"
                        + "<span style=\"color:#6b7280;\">Program Coordinator, Spire Info Tech</span>");
        emailService.sendEmail(
                user.getEmail(),
                "Meet your program coordinator — Spire Info Tech",
                wrap("Meet " + escape(coordName), body));
    }

    // ── 12. ERM intro — participant copy (Phase 4 Step 13) ─────────
    public void sendErmIntroEmail(User user, com.spire.backend.entity.User erm) {
        String ermName = erm == null || erm.getFullName() == null
                ? "Your ERM" : erm.getFullName();
        String ermEmail = erm == null ? "" : safe(erm.getEmail());
        String body = p("Dear " + escape(user.getFullName() == null ? "there" : user.getFullName()) + ",")
                + p("Your Employee Relationship Manager (ERM) has been assigned:")
                + receipt(
                        "Name: " + safe(ermName),
                        "Email: " + ermEmail
                )
                + p(escape(ermName) + " is your primary communication owner. They will guide you "
                        + "through your program, review your weekly reports, and support you at "
                        + "every step.")
                + p("You can reach " + escape(ermName) + " via email or through your dashboard "
                        + "once it's ready.")
                + p("Regards,<br/>Spire Info Tech");
        emailService.sendEmail(
                user.getEmail(),
                "Your relationship manager — Spire Info Tech",
                wrap("Meet your ERM", body));
    }

    // ── 12b. ERM intro — ERM-side notification ──────────────────────
    public void sendErmAssignmentNotification(com.spire.backend.entity.User erm,
                                              User participant,
                                              com.spire.backend.entity.ProgramSelection program) {
        if (erm == null || erm.getEmail() == null) return;
        String programStr = program == null ? "—" : safe(program.getProgram());
        String phaseStr = program == null ? "—" : safe(program.getPhase());
        String tech = program != null && program.getSkillset() != null
                ? program.getSkillset() : safe(participant.getSelectedTechnology());
        String target = program == null ? "—" : safe(program.getTargetJobTitle());

        String body = p("Hi " + firstName(erm) + ",")
                + p("A new participant has been assigned to you:")
                + receipt(
                        "Name: " + safe(participant.getFullName()),
                        "Participant ID: " + safe(participant.getParticipantId()),
                        "Email: " + safe(participant.getEmail()),
                        "Program: " + programStr,
                        "Phase: " + phaseStr,
                        "Technology: " + safe(tech),
                        "Target: " + safe(target)
                )
                + p("Please review their profile and prepare for onboarding.")
                + muted("— Spire Info Tech operations");
        emailService.sendEmail(
                erm.getEmail(),
                "New participant assigned: " + safe(participant.getFullName())
                        + " (" + safe(participant.getParticipantId()) + ")",
                wrap("New participant assignment", body));
    }

    // ── 13. Coach / advisor assignment (Phase 4 Step 14) ────────────
    /**
     * Sent after coaches have been assigned (or marked pending).
     * Accepts a map keyed by role label ("Career Coach", "Technical
     * Advisor", …) → coach display name. Roles with no available
     * assignee can pass through with value "Awaiting assignment".
     */
    public void sendCoachAssignmentEmail(User user, java.util.Map<String, String> coachesByRole) {
        StringBuilder rows = new StringBuilder();
        if (coachesByRole != null) {
            for (java.util.Map.Entry<String, String> e : coachesByRole.entrySet()) {
                rows.append(safe(e.getKey())).append(": ").append(safe(e.getValue())).append("\n");
            }
        }
        String[] receiptLines = rows.toString().split("\n");
        String body = p("Dear " + escape(user.getFullName() == null ? "there" : user.getFullName()) + ",")
                + p("Your support team has been assembled:")
                + receipt(receiptLines)
                + p("Your first checkpoint will be scheduled by your ERM. You can view your "
                        + "team contacts in your dashboard.")
                + button("Enter Your Dashboard", appUrl + "/dashboard")
                + p("Regards,<br/>Spire Info Tech");
        emailService.sendEmail(
                user.getEmail(),
                "Your coaching team — Spire Info Tech",
                wrap("Your coaching team", body));
    }

    // ── 1c. Program selection confirmation (Phase 3A) ───────────────
    /**
     * Sent immediately after a participant finalises their program
     * selection. Confirms the chosen program / phase / skillset back
     * to the participant and points them at the next onboarding step
     * (/agreement). The internal operations-mailbox copy is optional
     * — controlled by {@code program.operations.email} — so a dev
     * env without that env var still sends the participant copy.
     */
    public void sendProgramSelectionConfirmationEmail(
            com.spire.backend.entity.User user,
            com.spire.backend.entity.ProgramSelection selection
    ) {
        String greeting = user.getFullName() == null || user.getFullName().isBlank()
                ? "there" : user.getFullName();
        String body = p("Dear " + escape(greeting) + ",")
                + p("Your program selection has been recorded:")
                + receipt(
                        "Program: " + safe(selection.getProgram()),
                        "Phase: " + safe(selection.getPhase()),
                        "Technology: " + safe(selection.getSkillset()),
                        "Target Job Title: " + safe(selection.getTargetJobTitle()),
                        "Availability: " + safe(selection.getAvailability()),
                        "Participant ID: " + safe(user.getParticipantId())
                )
                + p("Your next step: Review and sign your agreement.")
                + button("Continue to Agreement", appUrl + "/agreement")
                + p("Regards,<br/>Spire Info Tech");
        emailService.sendEmail(
                user.getEmail(),
                "Program selection confirmed — Spire Info Tech",
                wrap("Program selected", body));

        // Internal operations notification — kept best-effort and
        // off the participant's eyeline. Same template wrapper as
        // the participant copy so the inbox layout stays consistent.
        if (operationsEmail != null && !operationsEmail.isBlank()) {
            String opsBody = p("New program selection on Spire Info Tech:")
                    + receipt(
                            "Participant: " + safe(user.getFullName())
                                    + " (" + safe(user.getParticipantId()) + ")",
                            "Email: " + safe(user.getEmail()),
                            "Program: " + safe(selection.getProgram()),
                            "Phase: " + safe(selection.getPhase()),
                            "Skillset: " + safe(selection.getSkillset()),
                            "Target: " + safe(selection.getTargetJobTitle()),
                            "Availability: " + safe(selection.getAvailability())
                    )
                    + p("→ Ready for agreement generation.");
            try {
                emailService.sendEmail(
                        operationsEmail,
                        "New program selection: "
                                + safe(user.getFullName())
                                + " (" + safe(user.getParticipantId()) + ")",
                        wrap("Program selection — internal", opsBody));
            } catch (Exception ignored) {
                // Internal-copy outage doesn't fail the participant flow.
            }
        }
    }

    private static String safe(String s) {
        return s == null || s.isBlank() ? "—" : s;
    }

    // ── 1b. Participant ID (Phase 1B) ───────────────────────────────
    /**
     * Sent immediately after OTP verification once the platform has
     * minted a SIT-2026-XXXXX participant ID. Confirms the ID to the
     * user and routes them to the next onboarding step.
     */
    public void sendParticipantIdEmail(User user, String participantId) {
        String greeting = user.getFullName() == null || user.getFullName().isBlank()
                ? "there" : user.getFullName();
        String idBlock =
                "<div style=\"text-align:center; margin:24px 0;\">"
                        + "<span style=\"display:inline-block; font-size:26px; font-weight:bold; "
                        + "letter-spacing:4px; color:#0F766E; background:#f0fdf9; "
                        + "padding:14px 28px; border-radius:8px; "
                        + "border:1px solid rgba(15,118,110,0.2); font-family:'Courier New',monospace;\">"
                        + escape(participantId)
                        + "</span></div>";
        String body = p("Dear " + escape(greeting) + ",")
                + p("Welcome! Your email has been verified successfully.")
                + p("Your official Spire Info Tech Participant ID is:")
                + idBlock
                + p("Please keep this ID for your records. It will be used in all future "
                        + "communications and documents.")
                + p("Your next step: Complete the acknowledgment and upload your required documents.")
                + button("Continue to Next Step", appUrl + "/participant-id")
                + p("Regards,<br/>Spire Info Tech");
        emailService.sendEmail(
                user.getEmail(),
                "Your Spire Info Tech Participant ID: " + participantId,
                wrap("Welcome to Spire Info Tech", body));
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

    // ── 2b. Agreement: "Reply YES" request ──────────────────────────
    /**
     * Sent the moment the user clicks "Accept" on /agreement. The
     * subject embeds a tracking marker {@code [AGREE-{userId}-{ts}]}
     * the IMAP inbox cron uses to match the user's reply back to
     * the pending acceptance row. Body asks the user to reply with
     * the literal word YES; any other reply is ignored. Returns
     * the subject so the caller can persist it on the row.
     */
    public String sendAgreementReplyRequestEmail(
            User user, String legalName, String ipAddress,
            long userId, long trackingTimestamp, byte[] pendingPdfBytes
    ) {
        // Subject embeds the tracking marker the IMAP cron uses to
        // match incoming replies back to this row. Format must stay
        // [AGREE-{userId}-{ts}] — see TRACKING_REGEX in the cron.
        String tracking = String.format("[AGREE-%d-%d]", userId, trackingTimestamp);
        String subject = "Spire Info Tech — Terms of Service Agreement " + tracking;
        // ipAddress is captured on the row for the audit trail but
        // intentionally not surfaced in the email body — the spec
        // wording deliberately reads as a formal letter rather than
        // a security receipt.
        if (ipAddress != null) { /* keep on signature for callers */ }

        String replyCallout =
                "<div style=\"text-align:center; margin:24px 0;\">"
                        + "<span style=\"display:inline-block; font-size:20px; font-weight:bold; "
                        + "letter-spacing:1px; color:#0F766E; background:#f0fdf9; "
                        + "padding:12px 28px; border-radius:8px; "
                        + "border:1px solid rgba(15,118,110,0.2); font-family:Arial,Helvetica,sans-serif;\">"
                        + "Yes, I agree"
                        + "</span></div>";

        String body = p("Dear " + escape(legalName == null || legalName.isBlank()
                        ? firstName(user) : legalName) + ",")
                + p("Please find attached the Terms of Service agreement for <strong>Spire Info Tech</strong>.")
                + p("We request you to review the attached document carefully.")
                + p("To confirm your acceptance of these terms, please <strong>reply</strong> to this email with:")
                + replyCallout
                + p("By replying, you acknowledge that you have read and accept all terms and conditions stated in the attached document.")
                + p("This request expires in <strong>30 minutes</strong>.")
                + p("Regards,<br/>Spire Info Tech<br/>"
                        + "<span style=\"color:#6b7280;\">info@spireitco.com &nbsp;•&nbsp; www.spireitco.com</span>")
                + muted("If you did not initiate this, please ignore this email — no agreement will be recorded.");

        java.util.List<EmailService.Attachment> attachments =
                pendingPdfBytes == null || pendingPdfBytes.length == 0
                        ? java.util.List.of()
                        : java.util.List.of(new EmailService.Attachment(
                                "Spire_Agreement_v1.0.pdf",
                                "application/pdf", pendingPdfBytes));

        emailService.sendEmail(user.getEmail(), subject,
                wrap("Terms of Service Agreement", body), attachments);
        return subject;
    }

    // ── 2c. Agreement: verification code (post-reply) ───────────────
    /**
     * Sent when the IMAP cron has detected a "YES" reply and the
     * backend has issued the OTP. Entering this code on the website
     * completes the acceptance.
     */
    public void sendAgreementCodeEmail(User user, String legalName, String code) {
        String codeBlock =
                "<div style=\"text-align:center; margin:24px 0;\">"
                        + "<span style=\"display:inline-block; font-size:32px; font-weight:bold; "
                        + "letter-spacing:8px; color:#0F766E; background:#f0fdf9; "
                        + "padding:12px 24px; border-radius:8px; "
                        + "border:1px solid rgba(15,118,110,0.2); font-family:'Courier New',monospace;\">"
                        + escape(code)
                        + "</span>"
                        + "</div>";

        String greeting = legalName == null || legalName.isBlank()
                ? firstName(user) : legalName;

        String body = p("Dear " + escape(greeting) + ",")
                + p("Thank you for accepting the Terms of Service.")
                + p("Your verification code is:")
                + codeBlock
                + p("Enter this code on the website to complete your agreement.")
                + p("This code expires in 10 minutes.")
                + p("Regards,<br/>Spire Info Tech")
                + muted("If you didn't request this, ignore this email — your agreement won't be recorded.");
        emailService.sendEmail(
                user.getEmail(),
                "Agreement verification code: " + code,
                wrap("Verification code", body)
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

    // ── 2d. Agreement: signed PDF delivery (post-verification) ──────
    /**
     * Sent immediately after the OTP verifies. Body confirms the
     * acceptance and attaches the personalized signed agreement PDF
     * generated by {@code AgreementPdfService}.
     *
     * @param pdfBytes  raw PDF bytes — base64-encoded into the relay
     *                  payload by {@link EmailService}
     * @param recordId  e.g. "AGR-2026-00042" — surfaced in the body
     *                  as the user's reference number
     */
    public void sendSignedAgreementEmail(
            User user, String legalName, String acceptedAtIst,
            String version, String recordId, byte[] pdfBytes
    ) {
        // Filename uses the user's legal name when available so the
        // attachment lands in their inbox with a personal anchor;
        // strip whitespace + non-filename-safe chars first.
        String namePart = (legalName == null || legalName.isBlank())
                ? (recordId == null ? "signed" : recordId)
                : legalName.trim().replaceAll("[^A-Za-z0-9._-]", "_");
        String filename = "Spire_Agreement_Signed_" + namePart + ".pdf";
        // legalName + version are kept on the signature for audit
        // logging on the caller side; the user-facing body shows
        // only the acceptance ID + timestamp per spec.

        String greeting = legalName == null || legalName.isBlank()
                ? firstName(user) : legalName;

        String body = p("Dear " + escape(greeting) + ",")
                + p("Your agreement with <strong>Spire Info Tech</strong> has been confirmed.")
                + p("Attached is your signed copy of the Terms of Service. Please keep this document for your records.")
                + receipt(
                        "Agreement ID: " + (recordId == null ? "—" : recordId),
                        "Accepted on: " + acceptedAtIst
                )
                + button("View on Platform", appUrl + "/dashboard")
                + p("Regards,<br/>Spire Info Tech");

        java.util.List<EmailService.Attachment> attachments =
                pdfBytes == null || pdfBytes.length == 0
                        ? java.util.List.of()
                        : java.util.List.of(new EmailService.Attachment(
                                filename, "application/pdf", pdfBytes));

        emailService.sendEmail(
                user.getEmail(),
                "Your signed agreement — Spire Info Tech",
                wrap("Agreement confirmed", body),
                attachments
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

    // ── 13. Employment / Phase 1 completion (Phase 6 Step 17) ────────
    /**
     * Email #13 — fires when a participant accepts the Phase 1
     * completion acknowledgment. Three recipients with tailored bodies:
     *   - Participant: congratulations + payment-plan heads-up.
     *   - ERM: confirmation + reminder to action approvals.
     *   - Finance: Phase 1 complete → payment-plan scheduling can begin.
     *
     * Each send is wrapped in try / ignored — a single failed recipient
     * never stops the others.
     */
    public void sendPhase1CompletionEmails(
            com.spire.backend.entity.User user,
            com.spire.backend.entity.User erm,
            com.spire.backend.entity.EmploymentAcceptance emp,
            java.time.LocalDateTime acceptedAt) {

        String fullName = safe(user.getFullName());
        String participantId = safe(user.getParticipantId());
        String employer = emp == null ? "—" : safe(emp.getEmployerClient());
        String jobTitle = emp == null ? "—" : safe(emp.getJobTitle());
        String startDate = emp == null || emp.getStartDate() == null
                ? "—" : emp.getStartDate().toString();
        String completionDate = acceptedAt == null
                ? "" : acceptedAt.atZone(IST).format(DATE_FMT) + " IST";

        // ── Participant ─────────────────────────────────────────
        try {
            String body = p("Dear " + fullName + ",")
                    + p("Congratulations! Your Phase 1 pre-employment readiness "
                            + "program is now complete.")
                    + receipt(
                            "Employment: " + employer + " — " + jobTitle,
                            "Start date: " + startDate,
                            "Phase 1 completed: " + completionDate)
                    + p("Your payment plan will be activated shortly. You can view "
                            + "your payment schedule in your dashboard once it's live.")
                    + p("Phase 2 post-offer support is now available as per your agreement.")
                    + button("Open your dashboard", appUrl + "/dashboard")
                    + p("Regards,<br/>Spire Info Tech");
            emailService.sendEmail(user.getEmail(),
                    "Phase 1 completed — " + fullName + " — Spire Info Tech",
                    wrap("Phase 1 complete — congratulations!", body));
        } catch (Exception ignored) {}

        // ── ERM ─────────────────────────────────────────────────
        if (erm != null && erm.getEmail() != null && !erm.getEmail().isBlank()) {
            try {
                String body = p("Phase 1 completed for " + fullName
                                + " (" + participantId + ").")
                        + receipt(
                                "Employer: " + employer,
                                "Job title: " + jobTitle,
                                "Start date: " + startDate,
                                "Completion: " + completionDate)
                        + p("Payment plan activation is pending. Approve the "
                                + "Phase 1 acknowledgment from your ERM dashboard "
                                + "if you haven't already.")
                        + p("— Spire Info Tech");
                emailService.sendEmail(erm.getEmail(),
                        "Phase 1 completed: " + fullName + " (" + participantId + ")",
                        wrap("Phase 1 complete — ERM heads-up", body));
            } catch (Exception ignored) {}
        }

        // ── Finance ─────────────────────────────────────────────
        if (financeEmail != null && !financeEmail.isBlank()) {
            try {
                String body = p("Phase 1 completed for " + fullName
                                + " (" + participantId + ").")
                        + receipt(
                                "Employer: " + employer,
                                "Job title: " + jobTitle,
                                "Start date: " + startDate,
                                "Completion: " + completionDate)
                        + p("Payment plan scheduling can begin. The participant's "
                                + "signed agreement and Phase 1 record are on file.")
                        + p("— Spire Info Tech");
                emailService.sendEmail(financeEmail,
                        "Phase 1 complete — payment plan ready: "
                                + fullName + " (" + participantId + ")",
                        wrap("Phase 1 complete — finance heads-up", body));
            } catch (Exception ignored) {}
        }
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
