package com.spire.backend.mail.service;

import com.spire.backend.exception.ResourceNotFoundException;
import com.spire.backend.exception.UnauthorizedException;
import com.spire.backend.mail.dto.*;
import com.spire.backend.mail.entity.MailAccount;
import com.spire.backend.mail.entity.MailAuditLog;
import com.spire.backend.mail.entity.MailDomain;
import com.spire.backend.mail.repository.MailAccountRepository;
import com.spire.backend.mail.repository.MailAuditLogRepository;
import com.spire.backend.mail.repository.MailDomainRepository;
import com.spire.backend.mail.security.MailPrincipal;
import jakarta.persistence.criteria.Predicate;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * Mail Admin backend. Provisioning, suspend/role management, one-time
 * SETUP/RESET links, domain registry, and an audit trail.
 *
 * <p>Authorization is enforced HERE, from the actor re-loaded by the
 * authenticated {@link MailPrincipal} (never from request input):
 * <ul>
 *   <li>SUPER_ADMIN — all domains, full control.</li>
 *   <li>ADMIN — own domain only; may manage USER accounts (create,
 *       suspend/reactivate, links, display name / quota); may NOT change
 *       roles and may NOT touch ADMIN / SUPER_ADMIN accounts.</li>
 * </ul>
 * The last active super administrator can never be suspended, demoted,
 * or have their domain disabled. Mailboxes are never hard-deleted —
 * suspend is the disable primitive.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class MailAdminService {

    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    // Generated-password alphabet: unambiguous (no O/0/I/l/1) for easy
    // hand-off. 16 chars from this set is ~92 bits of entropy.
    private static final char[] PW_ALPHABET =
            "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789".toCharArray();

    /** Grace window between "delete" and the automatic hard purge. */
    private static final int DELETION_GRACE_DAYS = 15;

    private final MailDomainRepository mailDomainRepository;
    private final MailAccountRepository mailAccountRepository;
    private final MailAuditLogRepository mailAuditLogRepository;
    private final PasswordEncoder passwordEncoder;
    private final MailFolderService mailFolderService;
    private final MailAccountPurgeService mailAccountPurgeService;

    // ─── Domains ────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<MailDomainSummary> listDomains(MailPrincipal principal) {
        MailAccount actor = loadActor(principal);
        List<MailDomain> domains = isSuper(actor)
                ? mailDomainRepository.findAll()
                : List.of(actor.getDomain());
        return domains.stream().map(this::toDomainSummary).toList();
    }

    @Transactional
    public MailDomainSummary createDomain(MailPrincipal principal, MailDomainCreateRequest req) {
        MailAccount actor = loadActor(principal);
        requireSuper(actor);
        String domainStr = req.getDomain().trim().toLowerCase();
        if (mailDomainRepository.findByDomain(domainStr).isPresent()) {
            throw new IllegalArgumentException("That domain already exists.");
        }
        MailDomain domain = mailDomainRepository.save(MailDomain.builder()
                .domain(domainStr)
                .entityName(req.getEntityName().trim())
                .isActive(true)
                .build());
        writeAudit(actor, "DOMAIN_CREATE", "DOMAIN", domain.getId(),
                "created domain " + domainStr);
        return toDomainSummary(domain);
    }

    @Transactional
    public MailDomainSummary updateDomain(MailPrincipal principal, Long id, MailDomainUpdateRequest req) {
        MailAccount actor = loadActor(principal);
        requireSuper(actor);
        MailDomain domain = mailDomainRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("MailDomain", "id", id));
        StringBuilder details = new StringBuilder();
        if (req.getEntityName() != null) {
            domain.setEntityName(req.getEntityName().trim());
            details.append("entityName; ");
        }
        if (req.getIsActive() != null) {
            if (Boolean.FALSE.equals(req.getIsActive()) && Boolean.TRUE.equals(domain.getIsActive())) {
                // Don't disable the domain of the last active super admin.
                if (countUsableSuperAdmins(domain.getId()) == 0) {
                    throw new IllegalArgumentException(
                            "Cannot deactivate the domain of the last active super administrator.");
                }
            }
            domain.setIsActive(req.getIsActive());
            details.append("isActive=").append(req.getIsActive());
        }
        mailDomainRepository.save(domain);
        writeAudit(actor, "DOMAIN_UPDATE", "DOMAIN", domain.getId(), details.toString().trim());
        return toDomainSummary(domain);
    }

    // ─── Mailboxes ──────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public PagedResponse<MailboxSummary> listMailboxes(
            MailPrincipal principal, Long domainId, String status, String q, Pageable pageable) {
        MailAccount actor = loadActor(principal);
        // ADMIN is hard-scoped to their own domain regardless of the filter.
        Long effectiveDomain = isSuper(actor) ? domainId : actor.getDomain().getId();
        MailAccount.Status st = parseStatus(status);
        Specification<MailAccount> spec = buildMailboxSpec(effectiveDomain, st, q);
        Page<MailAccount> page = mailAccountRepository.findAll(spec, pageable);
        return PagedResponse.from(page, page.getContent().stream().map(this::toMailboxSummary).toList());
    }

    @Transactional
    public MailCredentialResponse createMailbox(MailPrincipal principal, MailboxCreateRequest req) {
        MailAccount actor = loadActor(principal);
        Long domainId = req.getDomainId();
        if (!isSuper(actor) && !actor.getDomain().getId().equals(domainId)) {
            throw new AccessDeniedException("Access denied.");   // ADMIN: own domain only
        }
        MailDomain domain = mailDomainRepository.findById(domainId)
                .orElseThrow(() -> new ResourceNotFoundException("MailDomain", "id", domainId));
        MailAccount.Role role = parseRole(req.getRole(), MailAccount.Role.USER);
        if (!isSuper(actor) && role != MailAccount.Role.USER) {
            throw new AccessDeniedException("Access denied.");   // ADMIN: USER accounts only
        }
        String localPart = req.getLocalPart().trim().toLowerCase();
        if (mailAccountRepository.existsByLocalPartAndDomain_Id(localPart, domainId)) {
            throw new IllegalArgumentException("A mailbox with that address already exists.");
        }
        // Admin-set or server-generated password; only the BCrypt hash is stored.
        String password = resolvePassword(req.getPassword());
        // Default FALSE: an admin-set password is the user's real password. Tick
        // "require change on first login" only when you want to force a reset.
        boolean mustChange = Boolean.TRUE.equals(req.getRequireChangeOnFirstLogin());
        MailAccount account = mailAccountRepository.save(MailAccount.builder()
                .localPart(localPart)
                .domain(domain)
                .passwordHash(passwordEncoder.encode(password))
                .displayName(req.getDisplayName())
                .role(role)
                .status(MailAccount.Status.ACTIVE)
                .mustChangePassword(mustChange)
                .quotaBytes(0L)
                .build());
        mailFolderService.ensureSystemFolders(account);   // seed the new account's folder tree
        writeAudit(actor, "MAILBOX_CREATE", "MAILBOX", account.getId(),
                "created " + emailOf(account) + " role=" + role + " requireChange=" + mustChange);
        // Plaintext returned ONCE here; never persisted/logged.
        return MailCredentialResponse.builder().account(toMailboxSummary(account)).password(password).build();
    }

    /**
     * Reset a mailbox to a new admin-set or server-generated password (shown
     * once). The new password is FINAL by default; pass
     * {@code requireChangeOnFirstLogin=true} to force the user to change it on
     * next login. SUPER_ADMIN org-wide; ADMIN within their own domain, USER
     * accounts only (same authz as every other target operation). Never reveals
     * the existing password.
     */
    @Transactional
    public MailCredentialResponse resetPassword(MailPrincipal principal, Long id, MailResetPasswordRequest req) {
        MailAccount actor = loadActor(principal);
        MailAccount target = mailAccountRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("MailAccount", "id", id));
        assertCanManageTarget(actor, target, false);
        String password = resolvePassword(req == null ? null : req.getPassword());
        boolean mustChange = req != null && Boolean.TRUE.equals(req.getRequireChangeOnFirstLogin());
        target.setPasswordHash(passwordEncoder.encode(password));
        target.setMustChangePassword(mustChange);
        mailAccountRepository.save(target);
        writeAudit(actor, "MAILBOX_PASSWORD_RESET", "MAILBOX", target.getId(),
                "reset password for " + emailOf(target) + " requireChange=" + mustChange);   // NO password
        return MailCredentialResponse.builder().account(toMailboxSummary(target)).password(password).build();
    }

    @Transactional
    public MailboxSummary updateMailbox(MailPrincipal principal, Long id, MailboxUpdateRequest req) {
        MailAccount actor = loadActor(principal);
        MailAccount target = mailAccountRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("MailAccount", "id", id));
        boolean roleChange = req.getRole() != null;
        assertCanManageTarget(actor, target, roleChange);

        StringBuilder details = new StringBuilder();
        if (req.getDisplayName() != null) {
            target.setDisplayName(req.getDisplayName());
            details.append("displayName; ");
        }
        if (req.getQuotaBytes() != null) {
            target.setQuotaBytes(req.getQuotaBytes());
            details.append("quota=").append(req.getQuotaBytes()).append("; ");
        }
        if (roleChange) {
            // Reachable only for SUPER_ADMIN actors (assertCanManageTarget
            // blocks ADMIN role changes).
            MailAccount.Role newRole = parseRole(req.getRole(), null);
            if (newRole == null) throw new IllegalArgumentException("Invalid role.");
            MailAccount.Role oldRole = target.getRole();
            if (oldRole != newRole) {
                if (oldRole == MailAccount.Role.SUPER_ADMIN && newRole != MailAccount.Role.SUPER_ADMIN) {
                    assertNotLastUsableSuperAdmin(target);
                }
                target.setRole(newRole);
                details.append("role ").append(oldRole).append("->").append(newRole);
            }
        }
        mailAccountRepository.save(target);
        writeAudit(actor, "MAILBOX_UPDATE", "MAILBOX", target.getId(), details.toString().trim());
        return toMailboxSummary(target);
    }

    @Transactional
    public MailboxSummary suspend(MailPrincipal principal, Long id) {
        MailAccount actor = loadActor(principal);
        MailAccount target = mailAccountRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("MailAccount", "id", id));
        assertCanManageTarget(actor, target, false);
        assertNotLastUsableSuperAdmin(target);          // never disable the last super admin
        target.setStatus(MailAccount.Status.SUSPENDED);
        mailAccountRepository.save(target);
        writeAudit(actor, "MAILBOX_SUSPEND", "MAILBOX", target.getId(), "suspended " + emailOf(target));
        return toMailboxSummary(target);
    }

    @Transactional
    public MailboxSummary reactivate(MailPrincipal principal, Long id) {
        MailAccount actor = loadActor(principal);
        MailAccount target = mailAccountRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("MailAccount", "id", id));
        assertCanManageTarget(actor, target, false);
        target.setDeleteAfter(null);                     // a reactivate also cancels a pending deletion
        target.setStatus(MailAccount.Status.ACTIVE);
        mailAccountRepository.save(target);
        writeAudit(actor, "MAILBOX_REACTIVATE", "MAILBOX", target.getId(), "reactivated " + emailOf(target));
        return toMailboxSummary(target);
    }

    // ─── Deletion (soft schedule → auto hard purge after a grace window) ──

    /**
     * Schedule a mailbox for deletion: it's disabled immediately (login gated)
     * and hard-purged automatically after {@link #DELETION_GRACE_DAYS} days.
     * Cancelable any time before then. Same authz as suspend (ADMIN: own-domain
     * USER accounts; SUPER_ADMIN: anywhere) plus: never the last super admin and
     * never your own mailbox.
     */
    @Transactional
    public MailboxSummary scheduleDeletion(MailPrincipal principal, Long id) {
        MailAccount actor = loadActor(principal);
        MailAccount target = mailAccountRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("MailAccount", "id", id));
        assertCanManageTarget(actor, target, false);
        if (target.getId().equals(actor.getId())) {
            throw new IllegalArgumentException("You can't delete your own mailbox.");
        }
        assertNotLastUsableSuperAdmin(target);
        LocalDateTime purgeAt = LocalDateTime.now().plusDays(DELETION_GRACE_DAYS);
        target.setStatus(MailAccount.Status.PENDING_DELETION);
        target.setDeleteAfter(purgeAt);
        mailAccountRepository.save(target);
        writeAudit(actor, "MAILBOX_DELETE_SCHEDULE", "MAILBOX", target.getId(),
                "scheduled deletion of " + emailOf(target) + " (purge after " + purgeAt + ")");
        return toMailboxSummary(target);
    }

    /** Cancel a pending deletion and reactivate the mailbox. */
    @Transactional
    public MailboxSummary cancelDeletion(MailPrincipal principal, Long id) {
        MailAccount actor = loadActor(principal);
        MailAccount target = mailAccountRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("MailAccount", "id", id));
        assertCanManageTarget(actor, target, false);
        if (target.getStatus() != MailAccount.Status.PENDING_DELETION) {
            throw new IllegalArgumentException("That mailbox is not scheduled for deletion.");
        }
        target.setDeleteAfter(null);
        target.setStatus(MailAccount.Status.ACTIVE);
        mailAccountRepository.save(target);
        writeAudit(actor, "MAILBOX_DELETE_CANCEL", "MAILBOX", target.getId(),
                "cancelled deletion of " + emailOf(target));
        return toMailboxSummary(target);
    }

    /**
     * Hard-purge every mailbox whose grace window has elapsed. Called by the
     * scheduled job (and the super-admin manual trigger). Each account is purged
     * in its own transaction so one failure never blocks the rest.
     */
    @Transactional(readOnly = true)
    public int purgeDueDeletions() {
        List<MailAccount> due = mailAccountRepository.findByStatusAndDeleteAfterLessThanEqual(
                MailAccount.Status.PENDING_DELETION, LocalDateTime.now());
        int purged = 0;
        for (MailAccount a : due) {
            try {
                mailAccountPurgeService.purge(a.getId());   // its own REQUIRES_NEW tx per account
                purged++;
            } catch (Exception e) {
                log.warn("Scheduled mailbox purge failed for account {}: {}", a.getId(), e.toString());
            }
        }
        if (purged > 0) log.info("Scheduled mailbox purge: removed {} mailbox(es).", purged);
        return purged;
    }

    /** Super-admin manual trigger: process any mailboxes whose grace has elapsed now. */
    public int runDueDeletions(MailPrincipal principal) {
        MailAccount actor = loadActor(principal);
        if (!isSuper(actor)) {
            throw new AccessDeniedException("Only a super administrator can run deletions.");
        }
        return purgeDueDeletions();
    }

    // ─── Audit ──────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public PagedResponse<MailAuditEntry> listAudit(MailPrincipal principal, Pageable pageable) {
        MailAccount actor = loadActor(principal);
        Page<MailAuditLog> page = isSuper(actor)
                ? mailAuditLogRepository.findAllByOrderByCreatedAtDesc(pageable)
                : mailAuditLogRepository.findByActorAccount_Domain_IdOrderByCreatedAtDesc(
                        actor.getDomain().getId(), pageable);
        return PagedResponse.from(page, page.getContent().stream().map(this::toAuditEntry).toList());
    }

    // ─── Authorization helpers ──────────────────────────────────────

    /** Re-load the actor from the authenticated principal and verify they
     *  are still an active mail admin. Catches tokens issued before a
     *  demotion / suspension / domain disable. */
    private MailAccount loadActor(MailPrincipal principal) {
        MailAccount actor = mailAccountRepository.findById(principal.accountId())
                .orElseThrow(() -> new UnauthorizedException("Session is no longer valid."));
        if (actor.getStatus() != MailAccount.Status.ACTIVE
                || Boolean.FALSE.equals(actor.getDomain().getIsActive())) {
            throw new UnauthorizedException("Session is no longer valid.");
        }
        if (actor.getRole() != MailAccount.Role.ADMIN && actor.getRole() != MailAccount.Role.SUPER_ADMIN) {
            throw new AccessDeniedException("Access denied.");
        }
        return actor;
    }

    private boolean isSuper(MailAccount a) {
        return a.getRole() == MailAccount.Role.SUPER_ADMIN;
    }

    private void requireSuper(MailAccount actor) {
        if (!isSuper(actor)) {
            throw new AccessDeniedException("Only a super administrator can manage domains.");
        }
    }

    /** Walling + role-scope guard for any target mailbox operation. */
    private void assertCanManageTarget(MailAccount actor, MailAccount target, boolean roleChange) {
        if (isSuper(actor)) return;                       // SUPER_ADMIN: anything, anywhere
        // ADMIN:
        if (!actor.getDomain().getId().equals(target.getDomain().getId())) {
            throw new AccessDeniedException("Access denied.");      // other domain
        }
        if (target.getRole() != MailAccount.Role.USER) {
            throw new AccessDeniedException("Access denied.");      // can't touch ADMIN/SUPER_ADMIN
        }
        if (roleChange) {
            throw new AccessDeniedException("Access denied.");      // ADMIN can't change roles
        }
    }

    /** Refuse if the target is the LAST active super admin in an active domain. */
    private void assertNotLastUsableSuperAdmin(MailAccount target) {
        boolean targetUsable = target.getRole() == MailAccount.Role.SUPER_ADMIN
                && target.getStatus() == MailAccount.Status.ACTIVE
                && Boolean.TRUE.equals(target.getDomain().getIsActive());
        if (!targetUsable) return;
        if (countUsableSuperAdmins(null) <= 1) {
            throw new IllegalArgumentException(
                    "Cannot suspend or demote the last active super administrator.");
        }
    }

    /**
     * Count "usable" super admins (ACTIVE account in an active domain),
     * optionally excluding one domain. Acquires a PESSIMISTIC_WRITE lock
     * on the ACTIVE super-admin rows FIRST, so concurrent suspend /
     * demote / domain-disable transactions serialize and cannot race the
     * system below one usable super admin.
     */
    private long countUsableSuperAdmins(Long excludeDomainId) {
        return mailAccountRepository
                .lockActiveSuperAdmins(MailAccount.Role.SUPER_ADMIN, MailAccount.Status.ACTIVE)
                .stream()
                .filter(a -> Boolean.TRUE.equals(a.getDomain().getIsActive()))
                .filter(a -> excludeDomainId == null || !a.getDomain().getId().equals(excludeDomainId))
                .count();
    }

    // ─── Password generation / strength ─────────────────────────────

    /** Use the admin-typed password (validated) or generate a strong one. */
    private String resolvePassword(String provided) {
        if (provided != null && !provided.isBlank()) {
            validatePasswordStrength(provided);
            return provided;
        }
        return generatePassword();
    }

    /** Mirror the set-password rule (min length); reject weak admin input. */
    private static void validatePasswordStrength(String pw) {
        if (pw == null || pw.length() < 8) {
            throw new IllegalArgumentException("Password must be at least 8 characters.");
        }
    }

    private static String generatePassword() {
        StringBuilder sb = new StringBuilder(16);
        for (int i = 0; i < 16; i++) {
            sb.append(PW_ALPHABET[SECURE_RANDOM.nextInt(PW_ALPHABET.length)]);
        }
        return sb.toString();
    }

    // ─── Mappers / parsing ──────────────────────────────────────────

    private Specification<MailAccount> buildMailboxSpec(Long domainId, MailAccount.Status status, String q) {
        return (root, query, cb) -> {
            List<Predicate> ps = new ArrayList<>();
            if (domainId != null) ps.add(cb.equal(root.get("domain").get("id"), domainId));
            if (status != null) ps.add(cb.equal(root.get("status"), status));
            if (q != null && !q.isBlank()) {
                String like = "%" + q.trim().toLowerCase() + "%";
                ps.add(cb.or(
                        cb.like(cb.lower(root.get("localPart")), like),
                        cb.like(cb.lower(cb.coalesce(root.get("displayName"), "")), like)));
            }
            return cb.and(ps.toArray(new Predicate[0]));
        };
    }

    private MailboxSummary toMailboxSummary(MailAccount a) {
        return MailboxSummary.builder()
                .id(a.getId())
                .email(emailOf(a))
                .localPart(a.getLocalPart())
                .domainId(a.getDomain().getId())
                .domain(a.getDomain().getDomain())
                .displayName(a.getDisplayName())
                .role(a.getRole().name())
                .status(a.getStatus().name())
                .quotaBytes(a.getQuotaBytes())
                .mustChangePassword(a.getMustChangePassword())
                .lastLoginAt(a.getLastLoginAt())
                .deleteAfter(a.getDeleteAfter())
                .createdAt(a.getCreatedAt())
                .build();
    }

    private MailDomainSummary toDomainSummary(MailDomain d) {
        return MailDomainSummary.builder()
                .id(d.getId())
                .domain(d.getDomain())
                .entityName(d.getEntityName())
                .isActive(d.getIsActive())
                .createdAt(d.getCreatedAt())
                .build();
    }

    private MailAuditEntry toAuditEntry(MailAuditLog log) {
        MailAccount actor = log.getActorAccount();
        return MailAuditEntry.builder()
                .id(log.getId())
                .actorId(actor.getId())
                .actorEmail(emailOf(actor))
                .action(log.getAction())
                .targetType(log.getTargetType())
                .targetId(log.getTargetId())
                .details(log.getDetails())
                .createdAt(log.getCreatedAt())
                .build();
    }

    private void writeAudit(MailAccount actor, String action, String targetType, Long targetId, String details) {
        mailAuditLogRepository.save(MailAuditLog.builder()
                .actorAccount(actor)
                .action(action)
                .targetType(targetType)
                .targetId(targetId)
                .details(details == null || details.isBlank() ? null : details)
                .build());
    }

    private String emailOf(MailAccount a) {
        return a.getLocalPart() + "@" + a.getDomain().getDomain();
    }

    private MailAccount.Role parseRole(String s, MailAccount.Role fallback) {
        if (s == null || s.isBlank()) return fallback;
        try {
            return MailAccount.Role.valueOf(s.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Invalid role: " + s);
        }
    }

    private MailAccount.Status parseStatus(String s) {
        if (s == null || s.isBlank()) return null;
        try {
            return MailAccount.Status.valueOf(s.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Invalid status: " + s);
        }
    }

}
