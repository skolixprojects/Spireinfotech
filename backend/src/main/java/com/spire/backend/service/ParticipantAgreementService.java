package com.spire.backend.service;

import com.spire.backend.entity.AgreementAcceptance;
import com.spire.backend.entity.User;
import com.spire.backend.exception.ResourceNotFoundException;
import com.spire.backend.exception.UnauthorizedException;
import com.spire.backend.repository.AgreementAcceptanceRepository;
import com.spire.backend.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.Map;

/**
 * Phase 3B — wraps {@link AgreementService} (the email-reply + OTP
 * machinery shared with the legacy /agreement-legacy flow) and
 * layers the participant-lifecycle workflow transitions on top.
 *
 * Why a wrapper rather than threading the transitions through
 * AgreementService itself: the legacy /agreement-legacy page also
 * uses AgreementService, and we don't want to mutate user.currentStatus
 * for users who are mid-legacy-flow (their currentStatus is
 * irrelevant to the legacy gate). The wrapper is gated by the
 * participant lifecycle: only callers who reached PROGRAM_SELECTED
 * trigger the new transitions.
 *
 * Status chain through this service:
 *   send()   → PROGRAM_SELECTED → DOCUSIGN_SENT
 *              (legacy row: WAITING_REPLY, request email sent w/ PDF)
 *   ... IMAP cron detects "Yes, I agree" ... legacy: CODE_SENT
 *   verify() → DOCUSIGN_SENT → DOCUSIGN_COMPLETED
 *              → SIGNED_AGREEMENT_SENT_TO_ERM (erm_notified=true)
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ParticipantAgreementService {

    private final AgreementService agreementService;
    private final AgreementAcceptanceRepository agreementRepository;
    private final UserRepository userRepository;
    private final WorkflowService workflowService;
    private final RecordService recordService;
    private final OnboardingService onboardingService;

    // ── Send agreement (Step 7 of the lifecycle) ────────────────

    @Transactional
    public Map<String, Object> send(
            Long userId,
            String legalName,
            String signatureImage,
            String signatureMethod,
            String ipAddress,
            String userAgent
    ) {
        User user = requireGatedUser(userId);

        // Idempotent — already past the signing step? Just return.
        if (workflowService.isStatusAtLeast(user,
                WorkflowService.Status.DOCUSIGN_COMPLETED)) {
            return Map.of(
                    "success", true,
                    "alreadySigned", true,
                    "status", user.getCurrentStatus()
            );
        }

        // Reuse the legacy email-reply machinery — sends the PDF
        // attachment + tracking-marker subject and persists a
        // WAITING_REPLY row on agreement_acceptances. The two
        // boolean consents map to "I confirm all information is
        // correct" on the page; both are required to reach this
        // method client-side, so we pass true.
        Map<String, Object> result = agreementService.requestAcceptance(
                userId, legalName, true, true,
                signatureImage, signatureMethod,
                ipAddress, userAgent);

        // Walk the participant workflow forward to DOCUSIGN_SENT.
        // Skip if we're already there (Phase 3A flow runs
        // PROGRAM_SELECTED first; resubmit from DOCUSIGN_SENT
        // is harmless via transition's audit row).
        if (!workflowService.isStatusAtLeast(user,
                WorkflowService.Status.DOCUSIGN_SENT)) {
            workflowService.transition(user,
                    WorkflowService.Status.DOCUSIGN_SENT,
                    "agreement_sent");
        }

        Map<String, Object> out = new HashMap<>(result);
        out.put("workflowStatus", user.getCurrentStatus());
        return out;
    }

    // ── Verify OTP + post-process (Steps 8b → 9) ────────────────

    @Transactional
    public Map<String, Object> verifyCode(Long userId, String code) {
        User user = requireGatedUser(userId);

        // Underlying verify flips the legacy row to VERIFIED, sets
        // user.agreementAccepted=true, fires signed-PDF + welcome
        // emails. We chain workflow transitions and ERM routing.
        agreementService.verifyAcceptanceCode(userId, code);

        // Refresh user — agreementAccepted was just set.
        user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", userId));

        if (!workflowService.isStatusAtLeast(user,
                WorkflowService.Status.DOCUSIGN_COMPLETED)) {
            workflowService.transition(user,
                    WorkflowService.Status.DOCUSIGN_COMPLETED,
                    "agreement_completed");
        }
        if (!workflowService.isStatusAtLeast(user,
                WorkflowService.Status.SIGNED_AGREEMENT_SENT_TO_ERM)) {
            workflowService.transition(user,
                    WorkflowService.Status.SIGNED_AGREEMENT_SENT_TO_ERM,
                    "erm_routed");
        }

        // Flag the row as ERM-routed so the operations dashboard
        // can pick it up. Best-effort — the workflow transition
        // above is the authoritative source of truth.
        agreementRepository.findByUserId(userId).ifPresent(row -> {
            if (!Boolean.TRUE.equals(row.getErmNotified())) {
                row.setErmNotified(true);
                agreementRepository.save(row);
            }
        });

        recordService.logAction(userId, RecordService.Category.ACCOUNT,
                "Agreement signed and routed to ERM",
                "Phase 3B verify-code completed",
                Map.of(
                        "workflowStatus", user.getCurrentStatus(),
                        "ermNotified", true
                ));

        // Phase 4 — kick off the team-assembly chain (welcome,
        // coordinator, ERM, coaches, dashboard). Best-effort: if
        // any step inside fails, the chain logs and continues; the
        // /welcome page's polling endpoint surfaces the partial
        // progress and an operations admin can manually complete
        // missing assignments.
        try {
            onboardingService.completeOnboarding(user);
            // Refresh after the chain — currentStatus may have
            // advanced to DASHBOARD_ENABLED already.
            user = userRepository.findById(userId)
                    .orElseThrow(() -> new ResourceNotFoundException("User", "id", userId));
        } catch (Exception e) {
            log.warn("OnboardingService chain failed for user {}: {}", userId, e.getMessage());
        }

        log.info("Phase 3B agreement completed for user {} → currentStatus={}",
                userId, user.getCurrentStatus());
        return Map.of(
                "success", true,
                "status", user.getCurrentStatus(),
                "nextStep", "/welcome"
        );
    }

    // ── Status read for the polling loop ───────────────────────

    @Transactional(readOnly = true)
    public Map<String, Object> getStatus(Long userId) {
        User user = requireGatedUser(userId);
        Map<String, Object> base = agreementService.getStatus(userId);
        Map<String, Object> out = new HashMap<>(base);
        AgreementAcceptance row = agreementRepository.findByUserId(userId).orElse(null);
        out.put("workflowStatus", user.getCurrentStatus());
        out.put("ermNotified", row != null && Boolean.TRUE.equals(row.getErmNotified()));
        return out;
    }

    // ── Gate ──────────────────────────────────────────────────

    private User requireGatedUser(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", userId));
        if (!workflowService.isStatusAtLeast(user,
                WorkflowService.Status.PROGRAM_SELECTED)) {
            throw new UnauthorizedException(
                    "Complete program selection before reaching the agreement step.");
        }
        return user;
    }
}
