package com.spire.backend.service;

import com.spire.backend.entity.User;
import com.spire.backend.entity.WorkflowState;
import com.spire.backend.repository.UserRepository;
import com.spire.backend.repository.WorkflowStateRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;

/**
 * Participant lifecycle state machine (Phase 5B trimmed ladder).
 *
 * The pre-dashboard onboarding steps used to have per-status
 * entries; Phase 5A moved every gate onto the boolean completion
 * flags on User, and Phase 5B removed the vestigial status writes.
 * DRAFT_STARTED is now the single "pre-dashboard, onboarding in
 * progress" sentinel; every user rests there until either the
 * DIRECT attribution transitions them straight to DASHBOARD_ENABLED
 * or the reference onboarding chain lifts them through
 * WELCOME_SENT → DEEPTHI_INTRO_SENT → ERM_ASSIGNED → DASHBOARD_ENABLED.
 *
 * Soft validation: {@link #transition} accepts ANY status change
 * (no whitelist of allowed pairs, no forward-only guard). Forward
 * jumps are used by the DIRECT-attribution and onboarding-chain
 * paths; the workflow_states row records the from/to pair so any
 * out-of-order move remains auditable.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class WorkflowService {

    /**
     * The 12 canonical lifecycle statuses. DRAFT_STARTED is the
     * pre-dashboard sentinel (below DASHBOARD_ENABLED so upper-
     * lifecycle gates still block users during onboarding). The tail
     * from WEEKLY_REPORTING_ACTIVE through PAYMENTS_TRACKED drives
     * the payment/invoicing lifecycle.
     */
    public enum Status {
        DRAFT_STARTED,
        WELCOME_SENT,
        DEEPTHI_INTRO_SENT,
        ERM_ASSIGNED,
        DASHBOARD_ENABLED,
        WEEKLY_REPORTING_ACTIVE,
        EMPLOYMENT_ACCEPTED,
        PHASE_1_COMPLETED,
        PAYMENT_PLAN_ACCEPTED,
        CHECK_TRACKING_ADDED,
        INVOICING_ACTIVE,
        PAYMENTS_TRACKED
    }

    private final UserRepository userRepository;
    private final WorkflowStateRepository workflowStateRepository;
    private final RecordService recordService;

    // ── Status helpers ──────────────────────────────────────────────

    public Status currentStatus(User user) {
        String s = user.getCurrentStatus();
        if (s == null || s.isBlank()) return Status.DRAFT_STARTED;
        try {
            return Status.valueOf(s);
        } catch (IllegalArgumentException e) {
            // Defensive: unknown status string on an older row;
            // surface as DRAFT_STARTED so downstream gates still
            // refuse to advance.
            log.warn("Unknown workflow status '{}' on user {} — defaulting to DRAFT_STARTED",
                    s, user.getId());
            return Status.DRAFT_STARTED;
        }
    }

    public boolean isStatusAtLeast(User user, Status target) {
        return currentStatus(user).ordinal() >= target.ordinal();
    }

    // ── Gate helpers ───────────────────────────────────────────────

    /** Email-verified — required before minting a participant ID. */
    public boolean canCreateParticipantId(User user) {
        return Boolean.TRUE.equals(user.getEmailVerified());
    }

    /** ERM assigned — required before pairing coaches. */
    public boolean canAssignCoaches(User user) {
        return isStatusAtLeast(user, Status.ERM_ASSIGNED);
    }

    /** Phase 1 complete — required before activating the payment plan. */
    public boolean canActivatePayment(User user) {
        return isStatusAtLeast(user, Status.PHASE_1_COMPLETED);
    }

    // ── Transition (audited) ────────────────────────────────────────

    /**
     * Sets the user's currentStatus and appends a workflow_states
     * row plus a user_records WORKFLOW entry. Runs in the caller's
     * transaction so the user save and the audit row commit together.
     *
     * The audit row is best-effort — a failure to write to
     * user_records won't roll back the user save (RecordService uses
     * REQUIRES_NEW). The workflow_states row IS in the same tx and
     * thus does roll back on failure: that's the legal source of
     * truth for the lifecycle so we accept the linkage.
     */
    @Transactional
    public void transition(User user, Status newStatus, String trigger) {
        transition(user, newStatus, trigger, null);
    }

    @Transactional
    public void transition(User user, Status newStatus, String trigger, String notes) {
        String oldStatus = user.getCurrentStatus();
        user.setCurrentStatus(newStatus.name());
        userRepository.save(user);

        WorkflowState ws = WorkflowState.builder()
                .userId(user.getId())
                .fromStatus(oldStatus)
                .toStatus(newStatus.name())
                .triggerEvent(trigger)
                .notes(notes)
                .build();
        workflowStateRepository.save(ws);

        recordService.record(user.getId(), "WORKFLOW",
                RecordService.Category.ACCOUNT,
                "Status changed: " + (oldStatus == null ? "—" : oldStatus) + " → " + newStatus.name(),
                "trigger=" + (trigger == null ? "(none)" : trigger),
                Map.of(
                        "fromStatus", oldStatus == null ? "" : oldStatus,
                        "toStatus", newStatus.name(),
                        "trigger", trigger == null ? "" : trigger,
                        "notes", notes == null ? "" : notes
                ));

        log.info("Workflow transition user={} {}→{} trigger={}",
                user.getId(), oldStatus, newStatus.name(), trigger);
    }
}
