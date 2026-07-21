package com.spire.backend.service;

import com.spire.backend.entity.ErmAssignment;
import com.spire.backend.entity.User;
import com.spire.backend.repository.ErmAssignmentRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.Set;

/**
 * Centralised role-based access checks for participant-lifecycle
 * resources. Backed by the five canonical roles: STUDENT, INSTRUCTOR,
 * ADMIN, ERM, ACCOUNTS.
 *
 * Every method takes the {@code viewer} (the caller) and the
 * {@code target} (the user whose data is being read). Returning
 * {@code false} means the caller should reject the request; the
 * controller is responsible for the actual HTTP response.
 */
@Service
@RequiredArgsConstructor
public class PermissionService {

    private static final Set<String> ADMIN_ROLES = Set.of("ADMIN");
    private static final Set<String> FINANCE_ROLES = Set.of("ACCOUNTS", "ADMIN");

    private final ErmAssignmentRepository ermAssignmentRepository;

    /** Pulls the role name off a user with null-defence + uppercase. */
    public String roleOf(User user) {
        if (user == null || user.getRole() == null || user.getRole().getName() == null) {
            return "";
        }
        return user.getRole().getName().toUpperCase();
    }

    public boolean isAdmin(User viewer) {
        return ADMIN_ROLES.contains(roleOf(viewer));
    }

    public boolean isFinance(User viewer) {
        return FINANCE_ROLES.contains(roleOf(viewer));
    }

    /** True when the viewer is the user's currently-assigned ERM. */
    public boolean isAssignedErmFor(User viewer, User target) {
        if (viewer == null || target == null) return false;
        ErmAssignment assignment = ermAssignmentRepository
                .findFirstByUserIdOrderByAssignedDateDesc(target.getId())
                .orElse(null);
        return assignment != null
                && assignment.getErmUserId() != null
                && assignment.getErmUserId().equals(viewer.getId());
    }

    // ── Resource-level gates ──────────────────────────────────────

    /**
     * Document vault — visible to the document owner, their assigned
     * ERM, or any Admin.
     */
    public boolean canViewDocuments(User viewer, User target) {
        if (viewer == null || target == null) return false;
        if (viewer.getId().equals(target.getId())) return true;
        if (isAdmin(viewer)) return true;
        return isAssignedErmFor(viewer, target);
    }

    /**
     * Cheque images / check_documents — strictest tier. Visible to
     * Accounts and Admin only.
     */
    public boolean canViewCheckImages(User viewer) {
        return isFinance(viewer);
    }

    /**
     * Payment plan, invoices, ledger details — Accounts and Admin.
     * Participants see their OWN payment data via a separate narrower
     * check below.
     */
    public boolean canViewPaymentDetails(User viewer) {
        return isFinance(viewer);
    }

    /** Participants can read their own payment summary (own rows only). */
    public boolean canViewOwnPayments(User viewer, User target) {
        if (viewer == null || target == null) return false;
        return viewer.getId().equals(target.getId()) || isFinance(viewer);
    }

    /**
     * Workflow transitions — Admin or the assigned ERM. Used by the
     * participant management UI to gate "advance step" buttons.
     */
    public boolean canTransitionWorkflow(User viewer, User target) {
        if (viewer == null || target == null) return false;
        return isAdmin(viewer) || isAssignedErmFor(viewer, target);
    }
}
