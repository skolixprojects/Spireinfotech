package com.spire.backend.mail.service;

import com.spire.backend.exception.ResourceNotFoundException;
import com.spire.backend.exception.UnauthorizedException;
import com.spire.backend.mail.dto.MailAccountSummary;
import com.spire.backend.mail.dto.MailAuthResponse;
import com.spire.backend.mail.entity.MailAccount;
import com.spire.backend.mail.entity.MailDomain;
import com.spire.backend.mail.entity.MailSetupToken;
import com.spire.backend.mail.repository.MailAccountRepository;
import com.spire.backend.mail.repository.MailDomainRepository;
import com.spire.backend.mail.repository.MailSetupTokenRepository;
import com.spire.backend.mail.security.MailJwtService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Base64;

/**
 * Mail identity service — login, refresh, set-password, and account
 * lookup. Lives entirely beside LMS auth: it resolves only mail
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

    /** TTL for the single-use must-change-password CHANGE token. */
    private static final Duration CHANGE_TOKEN_TTL = Duration.ofMinutes(15);

    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    private final MailDomainRepository mailDomainRepository;
    private final MailAccountRepository mailAccountRepository;
    private final MailSetupTokenRepository mailSetupTokenRepository;
    private final MailJwtService mailJwtService;
    private final PasswordEncoder passwordEncoder;

    /**
     * Resolve the account within its own domain and verify the password.
     * On a must-change-password account, returns a change token only
     * (NO session). Otherwise stamps {@code lastLoginAt} and returns a
     * full session.
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

        if (Boolean.TRUE.equals(account.getMustChangePassword())) {
            // First-time / forced reset: issue a single-use CHANGE token
            // (stored hashed in mail_setup_tokens) that authorizes ONLY
            // set-password. No session is issued until the password is set.
            String rawToken = generateRawToken();
            mailSetupTokenRepository.save(MailSetupToken.builder()
                    .account(account)
                    .tokenHash(sha256(rawToken))
                    .purpose(MailSetupToken.Purpose.CHANGE)
                    .expiresAt(LocalDateTime.now().plus(CHANGE_TOKEN_TTL))
                    .build());
            return MailAuthResponse.builder()
                    .mustChangePassword(true)
                    .changeToken(rawToken)
                    .account(toSummary(account))
                    .build();
        }

        account.setLastLoginAt(LocalDateTime.now());
        mailAccountRepository.save(account);
        return fullSession(account);
    }

    /**
     * Set a new password using a single-use {@code mail_setup_tokens}
     * row. This is the ONE consume path for every token kind: the
     * must-change-password {@code CHANGE} token issued at login, and
     * (Phase 2) admin-issued {@code SETUP} / {@code RESET} tokens.
     * Clears must-change, marks the token used, and issues a full
     * session. Expired / used / unknown tokens fail generically.
     */
    @Transactional
    public MailAuthResponse setPassword(String token, String newPassword) {
        MailSetupToken st = mailSetupTokenRepository.findByTokenHashAndUsedAtIsNull(sha256(token))
                .orElseThrow(() -> new IllegalArgumentException("Invalid or expired token."));
        if (st.getExpiresAt() == null || st.getExpiresAt().isBefore(LocalDateTime.now())) {
            throw new IllegalArgumentException("Invalid or expired token.");
        }
        MailAccount account = st.getAccount();
        // set-password issues a full session, so it must enforce the same
        // suspension / domain-active gate as login and refresh — a token
        // minted before the account was suspended must not still work.
        assertAccountUsable(account);
        applyNewPassword(account, newPassword);
        st.setUsedAt(LocalDateTime.now());   // single-use — a replay finds no unused row
        mailSetupTokenRepository.save(st);
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
                        account.getId(), account.getRole().name(), account.getDomain().getId()))
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
                        account.getId(), account.getRole().name(), account.getDomain().getId()))
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

    /** A URL-safe, unguessable raw token (256 bits of entropy). */
    private static String generateRawToken() {
        byte[] bytes = new byte[32];
        SECURE_RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    /** SHA-256 hex of a raw token — only the hash is ever stored. */
    public static String sha256(String raw) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] digest = md.digest(raw.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(digest.length * 2);
            for (byte b : digest) {
                sb.append(Character.forDigit((b >> 4) & 0xF, 16));
                sb.append(Character.forDigit(b & 0xF, 16));
            }
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            // SHA-256 is mandated by the JVM spec — unreachable.
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }
}
