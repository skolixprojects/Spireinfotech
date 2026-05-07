package com.spire.backend.service;

import com.spire.backend.entity.AgreementAcceptance;
import com.spire.backend.entity.User;
import com.spire.backend.exception.ResourceNotFoundException;
import com.spire.backend.repository.AgreementAcceptanceRepository;
import com.spire.backend.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

/**
 * Implements the email-reply-based Terms of Service acceptance flow.
 *
 *   1. {@link #requestAcceptance} — validates the user's typed legal
 *      name + checkbox state, persists an unverified row in
 *      {@code WAITING_REPLY}, and emails the user a "Reply YES"
 *      message whose subject contains a tracking marker
 *      {@code [AGREE-{userId}-{millis}]}. No OTP is generated here.
 *
 *   2. {@link #processReply} — called by the Vercel IMAP cron when
 *      it finds an unread reply matching a tracking marker and
 *      containing YES/agreed/etc. Verifies the row is still
 *      WAITING_REPLY and not expired (30-minute window),
 *      generates the 6-digit OTP, emails it, and flips the row to
 *      {@code CODE_SENT}.
 *
 *   3. {@link #verifyAcceptanceCode} — validates the OTP and flips
 *      the row to {@code VERIFIED}; from this point the row is
 *      treated as immutable legal evidence.
 *
 * Seven-layer evidence chain on a verified row:
 *   email-verified user → terms read (frontend tracks scroll) →
 *   typed legal name → checked consent boxes → replied YES from
 *   the user's own inbox → OTP entered correctly → IP / browser /
 *   timestamps stamped throughout.
 *
 * Immutability is enforced in code (we never mutate a verified row)
 * rather than at the DB layer; portable across MySQL / Postgres.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class AgreementService {

    public static final String CURRENT_VERSION = "v1.0";

    public static final String STATUS_WAITING_REPLY = "WAITING_REPLY";
    public static final String STATUS_CODE_SENT = "CODE_SENT";
    public static final String STATUS_VERIFIED = "VERIFIED";

    private static final int CODE_TTL_MINUTES = 10;
    private static final int AGREEMENT_EMAIL_TTL_MINUTES = 30;
    private static final int RESEND_COOLDOWN_SECONDS = 60;
    private static final SecureRandom RANDOM = new SecureRandom();

    private final AgreementAcceptanceRepository agreementRepository;
    private final UserRepository userRepository;
    private final EmailTemplateService emailTemplateService;
    private final RecordService recordService;

    // ─── Status read ────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public Map<String, Object> getStatus(Long userId) {
        Optional<AgreementAcceptance> row = agreementRepository.findByUserId(userId);
        Map<String, Object> out = new HashMap<>();
        out.put("version", CURRENT_VERSION);
        if (row.isEmpty()) {
            out.put("status", "NOT_STARTED");
            out.put("accepted", false);
            return out;
        }
        AgreementAcceptance a = row.get();
        out.put("status", a.getStatus());
        out.put("accepted", STATUS_VERIFIED.equals(a.getStatus()));
        if (a.getAgreementExpiresAt() != null) {
            out.put("agreementExpiresAt", a.getAgreementExpiresAt().toString());
        }
        if (a.getAcceptedAt() != null) {
            out.put("acceptedAt", a.getAcceptedAt().toString());
            out.put("legalName", a.getLegalName());
        }
        return out;
    }

    // ─── Request acceptance — sends "Reply YES" email ───────────────

    /**
     * Creates (or refreshes) the pending row in WAITING_REPLY and
     * emails the user a "Reply YES" prompt. No OTP yet — that
     * happens in {@link #processReply} after the inbox cron sees
     * the reply.
     *
     * Re-callable for users who already have a pending row, as long
     * as it hasn't been verified — each call resets the 30-minute
     * email window and sends a fresh request email.
     */
    @Transactional
    public Map<String, Object> requestAcceptance(
            Long userId, String legalName, boolean termsAccepted,
            boolean contentPolicyAccepted, String ipAddress, String userAgent
    ) {
        if (legalName == null || countWords(legalName) < 2) {
            throw new IllegalArgumentException(
                    "Please enter your full legal name (first and last).");
        }
        if (!termsAccepted || !contentPolicyAccepted) {
            throw new IllegalArgumentException(
                    "You must agree to both the Terms of Service and the content policy.");
        }

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", userId));

        Optional<AgreementAcceptance> existing = agreementRepository.findByUserId(userId);
        if (existing.isPresent() && STATUS_VERIFIED.equals(existing.get().getStatus())) {
            // Already accepted — return idempotently. A verified
            // row is immutable; never overwrite it.
            return Map.of(
                    "success", true,
                    "alreadyAccepted", true,
                    "status", STATUS_VERIFIED,
                    "message", "Agreement already accepted."
            );
        }

        AgreementAcceptance row = existing.orElseGet(AgreementAcceptance::new);
        long trackingTimestamp = System.currentTimeMillis() / 1000L;
        UserAgentInfo ua = parseUserAgent(userAgent);
        LocalDateTime now = LocalDateTime.now();

        row.setUser(user);
        row.setLegalName(legalName.trim());
        row.setAgreementVersion(CURRENT_VERSION);
        row.setStatus(STATUS_WAITING_REPLY);
        row.setAcceptanceCode(null);
        row.setCodeVerified(false);
        row.setIpAddress(ipAddress);
        row.setUserAgent(userAgent);
        row.setBrowser(ua.browser);
        row.setOs(ua.os);
        row.setAgreementEmailSentAt(now);
        row.setAgreementExpiresAt(now.plusMinutes(AGREEMENT_EMAIL_TTL_MINUTES));
        row.setLastResendAt(now);
        // Clear any stale post-reply state from a previous attempt.
        row.setUserReplyReceivedAt(null);
        row.setUserReplyContent(null);
        row.setVerificationCodeSentAt(null);
        row.setVerificationCodeVerifiedAt(null);
        row.setCodeExpiresAt(null);

        // Send the request email and capture the subject so the
        // IMAP cron can match the reply back to this row.
        String subject = emailTemplateService.sendAgreementReplyRequestEmail(
                user, row.getLegalName(), ipAddress, userId, trackingTimestamp);
        row.setAgreementEmailSubject(subject);

        AgreementAcceptance saved = agreementRepository.save(row);

        log.info("Agreement reply-request issued for user {} (row {}, expires {})",
                userId, saved.getId(), saved.getAgreementExpiresAt());

        Map<String, Object> out = new HashMap<>();
        out.put("success", true);
        out.put("alreadyAccepted", false);
        out.put("status", STATUS_WAITING_REPLY);
        out.put("expiresAt", saved.getAgreementExpiresAt().toString());
        out.put("message", "Agreement email sent. Reply YES from your inbox.");
        return out;
    }

    // ─── Process inbox reply (called by Vercel cron) ────────────────

    /**
     * Called by the Vercel IMAP cron when it finds a YES reply
     * matching a tracking marker. Idempotent — if the row is
     * already CODE_SENT or VERIFIED, returns silently. Verifies
     * the from-address matches the user's email so a forwarded
     * reply from a stranger can't be used to claim consent.
     *
     * Returns true when a code was actually generated (i.e. this
     * call moved the row from WAITING_REPLY → CODE_SENT) so the
     * cron can log meaningful counters.
     */
    @Transactional
    public boolean processReply(Long userId, String fromEmail, String replyContent) {
        AgreementAcceptance row = agreementRepository.findByUserId(userId).orElse(null);
        if (row == null) {
            log.warn("processReply: no agreement row for user {}", userId);
            return false;
        }
        if (!STATUS_WAITING_REPLY.equals(row.getStatus())) {
            log.info("processReply: user {} row already in status {}, ignoring", userId, row.getStatus());
            return false;
        }
        if (row.getAgreementExpiresAt() != null
                && row.getAgreementExpiresAt().isBefore(LocalDateTime.now())) {
            log.info("processReply: user {} agreement window expired, ignoring", userId);
            return false;
        }

        User user = row.getUser();
        // Defence in depth — the cron already filters by user id, but
        // ensure the reply address matches the on-record email so a
        // misrouted reply can't be misattributed.
        if (user == null || user.getEmail() == null
                || !user.getEmail().equalsIgnoreCase(fromEmail)) {
            log.warn("processReply: from-address {} does not match user {}", fromEmail, userId);
            return false;
        }

        String code = generateCode();
        LocalDateTime now = LocalDateTime.now();

        row.setStatus(STATUS_CODE_SENT);
        row.setUserReplyReceivedAt(now);
        row.setUserReplyContent(replyContent == null
                ? "" : replyContent.trim().substring(0, Math.min(64, replyContent.trim().length())));
        row.setAcceptanceCode(code);
        row.setCodeExpiresAt(now.plusMinutes(CODE_TTL_MINUTES));
        row.setVerificationCodeSentAt(now);
        agreementRepository.save(row);

        try { emailTemplateService.sendAgreementCodeEmail(user, code); } catch (Exception ignored) {}

        log.info("Agreement code emailed to user {} after reply detection", userId);
        return true;
    }

    // ─── Verify OTP ─────────────────────────────────────────────────

    @Transactional
    public void verifyAcceptanceCode(Long userId, String code) {
        AgreementAcceptance row = agreementRepository.findByUserId(userId)
                .orElseThrow(() -> new IllegalArgumentException(
                        "No agreement in progress. Please restart from the agreement page."));

        if (STATUS_VERIFIED.equals(row.getStatus())) {
            return; // idempotent — already accepted
        }
        if (!STATUS_CODE_SENT.equals(row.getStatus())) {
            throw new IllegalArgumentException(
                    "We haven't received your reply yet. Reply YES to the agreement email first.");
        }
        if (row.getCodeExpiresAt() == null
                || row.getCodeExpiresAt().isBefore(LocalDateTime.now())) {
            throw new IllegalArgumentException("Code expired. Please restart.");
        }

        String submitted = code == null ? "" : code.trim();
        if (row.getAcceptanceCode() == null || !row.getAcceptanceCode().equals(submitted)) {
            throw new IllegalArgumentException("Invalid code. Please try again.");
        }

        LocalDateTime now = LocalDateTime.now();
        row.setStatus(STATUS_VERIFIED);
        row.setCodeVerified(true);
        row.setVerificationCodeVerifiedAt(now);
        row.setAcceptedAt(now);
        agreementRepository.save(row);

        User user = row.getUser();
        user.setAgreementAccepted(true);
        userRepository.save(user);

        recordService.record(userId, "AGREEMENT_ACCEPTED",
                RecordService.Category.SECURITY,
                "Agreement accepted",
                "User accepted Terms of Service " + row.getAgreementVersion(),
                Map.of(
                        "version", row.getAgreementVersion(),
                        "legalName", row.getLegalName(),
                        "ip", row.getIpAddress() != null ? row.getIpAddress() : "",
                        "browser", row.getBrowser() != null ? row.getBrowser() : "",
                        "os", row.getOs() != null ? row.getOs() : "",
                        "replyContent", row.getUserReplyContent() != null ? row.getUserReplyContent() : ""
                ));
    }

    // ─── Resend agreement-request email ─────────────────────────────

    /**
     * Re-emails the "Reply YES" prompt. 60-second cooldown
     * server-side. Refuses on already-verified rows. If the row is
     * already in CODE_SENT, the user should re-trigger the flow
     * (the OTP was already sent); we treat resend on CODE_SENT as
     * resending the code itself, not the request email.
     */
    @Transactional
    public void resend(Long userId) {
        AgreementAcceptance row = agreementRepository.findByUserId(userId)
                .orElseThrow(() -> new IllegalArgumentException(
                        "No agreement in progress. Please restart from the agreement page."));

        if (STATUS_VERIFIED.equals(row.getStatus())) {
            throw new IllegalArgumentException("Agreement is already accepted.");
        }

        if (row.getLastResendAt() != null) {
            long secondsSince = Duration
                    .between(row.getLastResendAt(), LocalDateTime.now())
                    .getSeconds();
            if (secondsSince < RESEND_COOLDOWN_SECONDS) {
                long wait = RESEND_COOLDOWN_SECONDS - secondsSince;
                throw new IllegalArgumentException(
                        "Please wait " + wait + " more second" + (wait == 1 ? "" : "s")
                                + " before requesting another email.");
            }
        }

        if (STATUS_WAITING_REPLY.equals(row.getStatus())) {
            // Resend the "Reply YES" prompt. Bump the tracking
            // timestamp + the 30-minute window so a stale subject
            // doesn't outlive the new expiry.
            long trackingTimestamp = System.currentTimeMillis() / 1000L;
            LocalDateTime now = LocalDateTime.now();
            row.setAgreementEmailSentAt(now);
            row.setAgreementExpiresAt(now.plusMinutes(AGREEMENT_EMAIL_TTL_MINUTES));
            row.setLastResendAt(now);
            String subject = emailTemplateService.sendAgreementReplyRequestEmail(
                    row.getUser(), row.getLegalName(), row.getIpAddress(),
                    userId, trackingTimestamp);
            row.setAgreementEmailSubject(subject);
            agreementRepository.save(row);
            return;
        }

        if (STATUS_CODE_SENT.equals(row.getStatus())) {
            // Resend the OTP. Reuse the existing code so a stale
            // earlier email is still valid; just fire the email
            // again and bump the cooldown anchor.
            row.setLastResendAt(LocalDateTime.now());
            agreementRepository.save(row);
            try { emailTemplateService.sendAgreementCodeEmail(row.getUser(), row.getAcceptanceCode()); } catch (Exception ignored) {}
        }
    }

    // ─── Internals ──────────────────────────────────────────────────

    private static String generateCode() {
        return String.format("%06d", RANDOM.nextInt(1_000_000));
    }

    private static int countWords(String s) {
        if (s == null) return 0;
        String trimmed = s.trim();
        if (trimmed.isEmpty()) return 0;
        return trimmed.split("\\s+").length;
    }

    /**
     * Tiny user-agent parser — enough to surface a readable browser
     * + OS for audit display. We don't pull in a dedicated UA
     * library because the audit row needs an approximation, not
     * perfect classification.
     */
    static UserAgentInfo parseUserAgent(String ua) {
        if (ua == null || ua.isBlank()) return new UserAgentInfo("Unknown", "Unknown");

        String browser;
        if (ua.contains("Edg/")) browser = "Edge";
        else if (ua.contains("OPR/") || ua.contains("Opera")) browser = "Opera";
        else if (ua.contains("Chrome/") && !ua.contains("Chromium")) browser = "Chrome";
        else if (ua.contains("Firefox/")) browser = "Firefox";
        else if (ua.contains("Safari/") && !ua.contains("Chrome/")) browser = "Safari";
        else browser = "Unknown";

        String os;
        if (ua.contains("Windows NT 10")) os = "Windows 10/11";
        else if (ua.contains("Windows")) os = "Windows";
        else if (ua.contains("Mac OS X") || ua.contains("Macintosh")) os = "macOS";
        else if (ua.contains("Android")) os = "Android";
        else if (ua.contains("iPhone") || ua.contains("iPad") || ua.contains("iOS")) os = "iOS";
        else if (ua.contains("Linux")) os = "Linux";
        else os = "Unknown";

        return new UserAgentInfo(browser, os);
    }

    record UserAgentInfo(String browser, String os) {}
}
