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

import java.util.Map;

/**
 * One-click on-site agreement signing for the participant lifecycle.
 *
 *   sign() → DOCUSIGN_SENT → DOCUSIGN_COMPLETED
 *          → SIGNED_AGREEMENT_SENT_TO_ERM (erm_notified=true)
 *          → OnboardingService.completeOnboarding() chain
 *
 * Wraps {@link AgreementService#signImmediate} so the legacy
 * /agreement-legacy email-reply path can keep using AgreementService
 * directly without touching the participant workflow.
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

    @Transactional
    public Map<String, Object> sign(
            Long userId,
            String legalName,
            String signatureImage,
            String signatureMethod,
            String ipAddress,
            String userAgent
    ) {
        User user = requireGatedUser(userId);

        if (workflowService.isStatusAtLeast(user,
                WorkflowService.Status.SIGNED_AGREEMENT_SENT_TO_ERM)) {
            return Map.of(
                    "success", true,
                    "alreadySigned", true,
                    "status", user.getCurrentStatus(),
                    "nextStep", "/welcome"
            );
        }

        agreementService.signImmediate(userId, legalName,
                signatureImage, signatureMethod, ipAddress, userAgent);

        user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", userId));

        if (!workflowService.isStatusAtLeast(user,
                WorkflowService.Status.DOCUSIGN_SENT)) {
            workflowService.transition(user,
                    WorkflowService.Status.DOCUSIGN_SENT,
                    "agreement_sent");
        }
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

        agreementRepository.findByUserId(userId).ifPresent(row -> {
            if (!Boolean.TRUE.equals(row.getErmNotified())) {
                row.setErmNotified(true);
                agreementRepository.save(row);
            }
        });

        recordService.logAction(userId, RecordService.Category.ACCOUNT,
                "Agreement signed and routed to ERM",
                "On-site signing completed",
                Map.of(
                        "workflowStatus", user.getCurrentStatus(),
                        "ermNotified", true
                ));

        try {
            onboardingService.completeOnboarding(user);
            user = userRepository.findById(userId)
                    .orElseThrow(() -> new ResourceNotFoundException("User", "id", userId));
        } catch (Exception e) {
            log.warn("OnboardingService chain failed for user {}: {}", userId, e.getMessage());
        }

        log.info("Agreement signed on-site for user {} → currentStatus={}",
                userId, user.getCurrentStatus());
        return Map.of(
                "success", true,
                "status", user.getCurrentStatus(),
                "nextStep", "/welcome"
        );
    }

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
