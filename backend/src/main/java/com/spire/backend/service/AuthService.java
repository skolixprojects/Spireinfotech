package com.spire.backend.service;

import com.spire.backend.dto.*;
import com.spire.backend.entity.Role;
import com.spire.backend.entity.User;
import com.spire.backend.exception.UnauthorizedException;
import com.spire.backend.repository.RoleRepository;
import com.spire.backend.repository.UserRepository;
import com.spire.backend.security.JwtService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;

/**
 * Handles user registration, login, and token refresh.
 * - Registration: validates email uniqueness, hashes password, assigns STUDENT role
 * - Login: verifies credentials, generates JWT tokens
 * - Refresh: validates refresh token, issues new access token
 */
@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final RecordService recordService;
    private final EmailTemplateService emailTemplateService;

    @Transactional
    public AuthResponse register(RegisterRequest request) {
        // 1. Check duplicate email
        if (userRepository.existsByEmail(request.getEmail())) {
            throw new IllegalArgumentException("Email already registered");
        }

        // 2. Fetch STUDENT role from roles table
        Role studentRole = roleRepository.findByName("STUDENT")
                .orElseThrow(() -> new IllegalStateException("Default role STUDENT not found in database"));

        // 3. Build and save user with a verification token. Token has
        //    a 24h expiry — the verify-email endpoint refuses anything
        //    older. emailVerified defaults false; the user can still
        //    log in (we don't gate access on verification yet) but
        //    nudges and password reset rely on a verified address.
        String verificationToken = UUID.randomUUID().toString();
        User user = User.builder()
                .email(request.getEmail())
                .passwordHash(passwordEncoder.encode(request.getPassword()))
                .fullName(request.getFullName())
                .role(studentRole)
                .isActive(true)
                .emailVerified(false)
                .verificationToken(verificationToken)
                .verificationExpiresAt(LocalDateTime.now().plusHours(24))
                .build();

        user = userRepository.save(user);

        recordService.record(user.getId(), "ACCOUNT_CREATED", RecordService.Category.ACCOUNT,
                "Account created",
                "User registered with email " + user.getEmail(),
                Map.of(
                        "email", user.getEmail(),
                        "fullName", user.getFullName() != null ? user.getFullName() : "",
                        "registrationMethod", "email_password"
                ));

        // 4. Welcome + verification emails. Both are no-ops if SMTP
        //    isn't configured — the signup itself never fails because
        //    of a missing/broken mail server.
        try { emailTemplateService.sendWelcomeEmail(user); } catch (Exception ignored) {}
        try { emailTemplateService.sendVerificationEmail(user, verificationToken); } catch (Exception ignored) {}

        // 5. Generate tokens and return
        return buildAuthResponse(user);
    }

    // ─── Email verification ─────────────────────────────────────────

    /**
     * Marks the user's email as verified if the supplied token
     * matches an unexpired one on the user record. Idempotent — a
     * second call with a stale (already-consumed) token returns the
     * already-verified user rather than throwing.
     */
    @Transactional
    public User verifyEmail(String token) {
        User user = userRepository.findByVerificationToken(token)
                .orElseThrow(() -> new IllegalArgumentException("Invalid verification link"));
        if (user.getVerificationExpiresAt() != null
                && user.getVerificationExpiresAt().isBefore(LocalDateTime.now())) {
            throw new IllegalArgumentException("Verification link has expired");
        }
        user.setEmailVerified(true);
        user.setVerificationToken(null);
        user.setVerificationExpiresAt(null);
        User saved = userRepository.save(user);
        recordService.record(saved.getId(), "ACCOUNT_EMAIL_VERIFIED", RecordService.Category.ACCOUNT,
                "Email verified",
                "User verified email address",
                Map.of("email", saved.getEmail()));
        return saved;
    }

    // ─── Password reset ─────────────────────────────────────────────

    /**
     * Generates a reset token + 1-hour expiry on the user (if found)
     * and emails them a reset link. To prevent account enumeration,
     * the calling endpoint always returns a generic success regardless
     * of whether an account was found here — this method just no-ops.
     */
    @Transactional
    public void requestPasswordReset(String email) {
        userRepository.findByEmail(email).ifPresent(user -> {
            String token = UUID.randomUUID().toString();
            user.setResetToken(token);
            user.setResetTokenExpiresAt(LocalDateTime.now().plusHours(1));
            userRepository.save(user);
            try { emailTemplateService.sendPasswordResetEmail(user, token); } catch (Exception ignored) {}
            recordService.record(user.getId(), "ACCOUNT_PASSWORD_RESET_REQUESTED",
                    RecordService.Category.SECURITY,
                    "Password reset requested",
                    "Reset link sent to " + user.getEmail(),
                    Map.of("email", user.getEmail()));
        });
    }

    /**
     * Consumes a reset token and replaces the password hash. Single-
     * use: the token is cleared on success so the same link can't be
     * reused later.
     */
    @Transactional
    public void resetPassword(String token, String newPassword) {
        User user = userRepository.findByResetToken(token)
                .orElseThrow(() -> new IllegalArgumentException("Invalid or expired reset link"));
        if (user.getResetTokenExpiresAt() == null
                || user.getResetTokenExpiresAt().isBefore(LocalDateTime.now())) {
            throw new IllegalArgumentException("Reset link has expired");
        }
        if (newPassword == null || newPassword.length() < 8) {
            throw new IllegalArgumentException("Password must be at least 8 characters");
        }
        user.setPasswordHash(passwordEncoder.encode(newPassword));
        user.setResetToken(null);
        user.setResetTokenExpiresAt(null);
        userRepository.save(user);
        recordService.record(user.getId(), "ACCOUNT_PASSWORD_RESET",
                RecordService.Category.SECURITY,
                "Password reset",
                "User reset password via emailed link",
                Map.of("email", user.getEmail()));
    }

    public AuthResponse login(LoginRequest request) {
        // 1. Find user by email
        User user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> {
                    recordLoginFailed(null, request.getEmail(), "user_not_found");
                    return new UnauthorizedException("Invalid email or password");
                });

        // 2. Verify password
        if (!passwordEncoder.matches(request.getPassword(), user.getPasswordHash())) {
            recordLoginFailed(user.getId(), user.getEmail(), "wrong_password");
            throw new UnauthorizedException("Invalid email or password");
        }

        // 3. Check if active
        if (!user.getIsActive()) {
            recordLoginFailed(user.getId(), user.getEmail(), "account_deactivated");
            throw new UnauthorizedException("Account is deactivated");
        }

        recordService.record(user.getId(), "ACCOUNT_LOGIN", RecordService.Category.ACCOUNT,
                "Logged in",
                "User logged in successfully",
                Map.of("email", user.getEmail()));

        return buildAuthResponse(user);
    }

    private void recordLoginFailed(Long userId, String email, String reason) {
        // userId may be null when the email doesn't exist — still log
        // the attempt so admins can spot enumeration probes (we just
        // can't attribute it to a real user).
        if (userId == null) return;
        recordService.record(userId, "ACCOUNT_LOGIN_FAILED", RecordService.Category.SECURITY,
                "Failed login attempt",
                "Failed login attempt for " + email,
                Map.of("email", email != null ? email : "", "reason", reason));
    }

    public AuthResponse refreshToken(String refreshToken) {
        if (!jwtService.isTokenValid(refreshToken)) {
            throw new UnauthorizedException("Invalid or expired refresh token");
        }

        Long userId = jwtService.extractUserId(refreshToken);
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new UnauthorizedException("User not found"));

        return buildAuthResponse(user);
    }

    private AuthResponse buildAuthResponse(User user) {
        String accessToken = jwtService.generateAccessToken(user.getId(), user.getRole().getName());
        String refreshToken = jwtService.generateRefreshToken(user.getId());

        return AuthResponse.builder()
                .accessToken(accessToken)
                .refreshToken(refreshToken)
                .user(UserDTO.from(user))
                .build();
    }
}
