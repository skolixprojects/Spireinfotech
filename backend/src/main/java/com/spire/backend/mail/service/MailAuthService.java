package com.spire.backend.mail.service;

import com.spire.backend.exception.ResourceNotFoundException;
import com.spire.backend.exception.UnauthorizedException;
import com.spire.backend.mail.dto.MailAccountSummary;
import com.spire.backend.mail.dto.MailAuthResponse;
import com.spire.backend.mail.entity.MailAccount;
import com.spire.backend.mail.entity.MailDomain;
import com.spire.backend.mail.repository.MailAccountRepository;
import com.spire.backend.mail.repository.MailDomainRepository;
import com.spire.backend.mail.security.MailJwtService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

/**
 * Mail identity service — login, refresh, self-service password change,
 * and account lookup. Lives entirely beside LMS auth: it resolves only mail
 * accounts, signs only mail tokens, and never touches the Spire
 * {@code users} table. It reuses the shared {@link PasswordEncoder}
 * bean (BCrypt) — sharing the encoder does not link the two identities.
 *
 * <p>The walled-per-entity rule is enforced here at the service layer:
 * an account is always resolved by {@code (localPart, domainId)} after
 * re-loading the domain from the database; the token's domain claim is
 * never consulted as authority.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class MailAuthService {

    private static final String INVALID_CREDENTIALS = "Invalid email or password";

    private final MailDomainRepository mailDomainRepository;
    private final MailAccountRepository mailAccountRepository;
    private final MailJwtService mailJwtService;
    private final PasswordEncoder passwordEncoder;

    /**
     * Resolve the account within its own domain and verify the password,
     * stamp {@code lastLoginAt}, and return a full session. A must-change
     * account also gets a session, but its access token is gated (Phase 19):
     * only the change flow is reachable until the password is changed.
     */
    @Transactional
    public MailAuthResponse login(String email, String rawPassword) {
        String[] parts = splitEmail(email);
        String localPart = parts[0];
        String domainStr = parts[1];

        // Generic failures throughout so the response can't reveal
        // which of {domain, account, password} was wrong.
        MailDomain domain = mailDomainRepository.findByDomain(domainStr)
                .orElseThrow(() -> new UnauthorizedException(INVALID_CREDENTIALS));
        if (Boolean.FALSE.equals(domain.getIsActive())) {
            throw new UnauthorizedException(INVALID_CREDENTIALS);
        }

        MailAccount account = mailAccountRepository
                .findByLocalPartAndDomain_Id(localPart, domain.getId())
                .orElseThrow(() -> new UnauthorizedException(INVALID_CREDENTIALS));

        if (!passwordEncoder.matches(rawPassword, account.getPasswordHash())) {
            throw new UnauthorizedException(INVALID_CREDENTIALS);
        }

        // Only after the password is proven do we surface a non-generic
        // reason — otherwise the distinct "suspended" message would let
        // an unauthenticated caller enumerate which mailboxes exist.
        assertAccountUsable(account);

        // A must-change account still gets a full session; the account
        // summary carries mustChangePassword=true and the client routes the
        // user to the AUTHENTICATED self-change screen (no token). The forced
        // change is completed via changePassword() below.
        account.setLastLoginAt(LocalDateTime.now());
        mailAccountRepository.save(account);
        return fullSession(account);
    }

    /**
     * Authenticated self-change of the logged-in user's OWN password (the
     * forced first-login change, or a voluntary change). Clears
     * must-change-password and returns a FRESH, ungated session (Phase 19),
     * so a gated user is never stuck. The account is the authenticated
     * principal — no setup token is involved.
     */
    @Transactional
    public MailAuthResponse changePassword(Long accountId, String newPassword) {
        MailAccount account = mailAccountRepository.findById(accountId)
                .orElseThrow(() -> new UnauthorizedException("Session is no longer valid."));
        assertAccountUsable(account);
        applyNewPassword(account, newPassword);   // encode, clear must-change, stamp lastLogin, save
        // must-change is now cleared, so the new access token is ungated.
        return fullSession(account);
    }

    /** Exchange a valid refresh token for a fresh access token. */
    @Transactional(readOnly = true)
    public MailAuthResponse refresh(String refreshToken) {
        if (!mailJwtService.isTokenValid(refreshToken)
                || !MailJwtService.TYPE_REFRESH.equals(safeType(refreshToken))) {
            throw new UnauthorizedException("Invalid or expired refresh token.");
        }
        Long accountId = mailJwtService.extractAccountId(refreshToken);
        MailAccount account = mailAccountRepository.findById(accountId)
                .orElseThrow(() -> new UnauthorizedException("Invalid or expired refresh token."));
        // Re-check suspension AND domain-active so a deactivated entity
        // (or suspended account) can't keep minting access tokens for the
        // life of the refresh token — same gate login applies.
        assertAccountUsable(account);
        return MailAuthResponse.builder()
                .accessToken(mailJwtService.generateAccessToken(
                        account.getId(), account.getRole().name(), account.getDomain().getId(),
                        Boolean.TRUE.equals(account.getMustChangePassword())))
                .refreshToken(refreshToken)
                .account(toSummary(account))
                .build();
    }

    /** Account summary for the authenticated principal ({@code /me}). */
    @Transactional(readOnly = true)
    public MailAccountSummary me(Long accountId) {
        MailAccount account = mailAccountRepository.findById(accountId)
                .orElseThrow(() -> new ResourceNotFoundException("MailAccount", "id", accountId));
        return toSummary(account);
    }

    // ─── Helpers ────────────────────────────────────────────────────

    /**
     * Reject sessions for accounts that should no longer have access: a
     * suspended account, or one whose owning domain/entity is inactive.
     * Enforced on EVERY session-issuing path (login after the password is
     * proven, set-password, refresh) so neither the suspension control
     * nor the walled-per-entity gate can be bypassed via one auth route.
     * Callers reach this only after proving identity, so a specific
     * reason here is not an enumeration oracle.
     */
    private void assertAccountUsable(MailAccount account) {
        if (account.getStatus() == MailAccount.Status.SUSPENDED) {
            throw new UnauthorizedException("This mailbox is suspended.");
        }
        if (Boolean.FALSE.equals(account.getDomain().getIsActive())) {
            throw new UnauthorizedException("This mailbox is unavailable.");
        }
    }

    private MailAuthResponse fullSession(MailAccount account) {
        return MailAuthResponse.builder()
                .accessToken(mailJwtService.generateAccessToken(
                        account.getId(), account.getRole().name(), account.getDomain().getId(),
                        Boolean.TRUE.equals(account.getMustChangePassword())))
                .refreshToken(mailJwtService.generateRefreshToken(account.getId()))
                .account(toSummary(account))
                .build();
    }

    private void applyNewPassword(MailAccount account, String newPassword) {
        account.setPasswordHash(passwordEncoder.encode(newPassword));
        account.setMustChangePassword(false);
        account.setLastLoginAt(LocalDateTime.now());
        mailAccountRepository.save(account);
    }

    private MailAccountSummary toSummary(MailAccount account) {
        return MailAccountSummary.builder()
                .id(account.getId())
                .email(emailOf(account))
                .displayName(account.getDisplayName())
                .role(account.getRole().name())
                .status(account.getStatus().name())
                .mustChangePassword(account.getMustChangePassword())
                .domain(account.getDomain().getDomain())
                .entityName(account.getDomain().getEntityName())
                .build();
    }

    private String emailOf(MailAccount account) {
        return account.getLocalPart() + "@" + account.getDomain().getDomain();
    }

    private String safeType(String token) {
        try {
            return mailJwtService.extractType(token);
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * Split an email into a lower-cased {@code [localPart, domain]}.
     * Shared with the bootstrap seeder so both parse addresses
     * identically. Throws {@link IllegalArgumentException} on a
     * malformed address.
     */
    public static String[] splitEmail(String email) {
        if (email == null) {
            throw new IllegalArgumentException("Email is required");
        }
        String trimmed = email.trim().toLowerCase();
        int at = trimmed.indexOf('@');
        if (at <= 0 || at != trimmed.lastIndexOf('@') || at == trimmed.length() - 1) {
            throw new IllegalArgumentException("Enter a valid email address");
        }
        return new String[]{trimmed.substring(0, at), trimmed.substring(at + 1)};
    }
}
