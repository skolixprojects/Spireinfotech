package com.spire.backend.service;

import com.spire.backend.dto.AuthResponse;
import com.spire.backend.dto.LoginRequest;
import com.spire.backend.dto.RegisterRequest;
import com.spire.backend.dto.RegistrationResponse;
import com.spire.backend.dto.UserDTO;
import com.spire.backend.entity.Role;
import com.spire.backend.entity.User;
import com.spire.backend.exception.EmailNotVerifiedException;
import com.spire.backend.exception.ResourceNotFoundException;
import com.spire.backend.exception.UnauthorizedException;
import com.spire.backend.repository.RoleRepository;
import com.spire.backend.repository.UserRepository;
import com.spire.backend.security.JwtService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.LocalDateTime;
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

    private static final int CODE_TTL_MINUTES = 10;
    private static final int RESEND_COOLDOWN_SECONDS = 60;
    private static final int LOCKOUT_THRESHOLD = 5;
    private static final int LOCKOUT_MINUTES = 15;

    private static final SecureRandom RANDOM = new SecureRandom();

    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final EmailTemplateService emailTemplateService;

    @Transactional
    public RegistrationResponse register(RegisterRequest request) {
        if (userRepository.existsByEmail(request.getEmail())) {
            throw new IllegalArgumentException("Email already registered");
        }

        Role studentRole = roleRepository.findByName("STUDENT")
                .orElseThrow(() -> new IllegalStateException("Default role STUDENT not found in database"));

        String code = generateCode();
        User user = User.builder()
                .email(request.getEmail())
                .passwordHash(passwordEncoder.encode(request.getPassword()))
                .fullName(request.getFullName())
                .role(studentRole)
                .isActive(true)
                .emailVerified(false)
                .verificationCode(code)
                .verificationCodeExpiresAt(LocalDateTime.now().plusMinutes(CODE_TTL_MINUTES))
                .verificationFailedAttempts(0)
                .lastVerificationResendAt(LocalDateTime.now())
                .build();

        user = userRepository.save(user);

        try { emailTemplateService.sendVerificationCodeEmail(user, code); } catch (Exception ignored) {}

        return RegistrationResponse.builder()
                .userId(user.getId())
                .email(user.getEmail())
                .requiresVerification(true)
                .build();
    }

    @Transactional
    public AuthResponse verifyCode(String email, String code) {
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new ResourceNotFoundException("User", "email", email));

        if (Boolean.TRUE.equals(user.getEmailVerified())) {
            return buildAuthResponse(user);
        }

        if (user.getVerificationLockedUntil() != null
                && user.getVerificationLockedUntil().isAfter(LocalDateTime.now())) {
            long minutes = java.time.Duration
                    .between(LocalDateTime.now(), user.getVerificationLockedUntil())
                    .toMinutes() + 1;
            throw new IllegalArgumentException(
                    "Too many wrong attempts. Try again in about " + minutes + " minute"
                            + (minutes == 1 ? "" : "s") + ".");
        }

        if (user.getVerificationCode() == null) {
            throw new IllegalArgumentException("No verification code on file. Click \"Resend code\" to get a new one.");
        }

        if (user.getVerificationCodeExpiresAt() == null
                || user.getVerificationCodeExpiresAt().isBefore(LocalDateTime.now())) {
            throw new IllegalArgumentException("Code expired. Please request a new one.");
        }

        if (!user.getVerificationCode().equals(code == null ? "" : code.trim())) {
            int attempts = (user.getVerificationFailedAttempts() == null ? 0 : user.getVerificationFailedAttempts()) + 1;
            user.setVerificationFailedAttempts(attempts);
            if (attempts >= LOCKOUT_THRESHOLD) {
                user.setVerificationLockedUntil(LocalDateTime.now().plusMinutes(LOCKOUT_MINUTES));
                userRepository.save(user);
                throw new IllegalArgumentException(
                        "Too many wrong attempts. Try again in " + LOCKOUT_MINUTES + " minutes.");
            }
            userRepository.save(user);
            int remaining = LOCKOUT_THRESHOLD - attempts;
            throw new IllegalArgumentException(
                    "Invalid verification code. " + remaining + " attempt" + (remaining == 1 ? "" : "s")
                            + " remaining before lockout.");
        }

        user.setEmailVerified(true);
        user.setVerificationCode(null);
        user.setVerificationCodeExpiresAt(null);
        user.setVerificationFailedAttempts(0);
        user.setVerificationLockedUntil(null);
        user.setVerificationToken(null);
        user.setVerificationExpiresAt(null);
        User saved = userRepository.save(user);

        return buildAuthResponse(saved);
    }

    @Transactional
    public void resendVerificationCode(String email) {
        var found = userRepository.findByEmail(email);
        if (found.isEmpty()) return;
        User user = found.get();
        if (Boolean.TRUE.equals(user.getEmailVerified())) return;

        if (user.getLastVerificationResendAt() != null) {
            long secondsSince = java.time.Duration
                    .between(user.getLastVerificationResendAt(), LocalDateTime.now())
                    .getSeconds();
            if (secondsSince < RESEND_COOLDOWN_SECONDS) {
                long wait = RESEND_COOLDOWN_SECONDS - secondsSince;
                throw new IllegalArgumentException(
                        "Please wait " + wait + " more second" + (wait == 1 ? "" : "s") + " before requesting another code.");
            }
        }

        String code = generateCode();
        user.setVerificationCode(code);
        user.setVerificationCodeExpiresAt(LocalDateTime.now().plusMinutes(CODE_TTL_MINUTES));
        user.setVerificationFailedAttempts(0);
        user.setVerificationLockedUntil(null);
        user.setLastVerificationResendAt(LocalDateTime.now());
        userRepository.save(user);

        try { emailTemplateService.sendVerificationCodeEmail(user, code); } catch (Exception ignored) {}
    }

    private static String generateCode() {
        return String.format("%06d", RANDOM.nextInt(1_000_000));
    }

    @Transactional
    public void requestPasswordReset(String email) {
        userRepository.findByEmail(email).ifPresent(user -> {
            String token = UUID.randomUUID().toString();
            user.setResetToken(token);
            user.setResetTokenExpiresAt(LocalDateTime.now().plusHours(1));
            userRepository.save(user);
            try { emailTemplateService.sendPasswordResetEmail(user, token); } catch (Exception ignored) {}
        });
    }

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
    }

    public AuthResponse login(LoginRequest request) {
        User user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> new UnauthorizedException("Invalid email or password"));

        if (!passwordEncoder.matches(request.getPassword(), user.getPasswordHash())) {
            throw new UnauthorizedException("Invalid email or password");
        }

        if (!user.getIsActive()) {
            throw new UnauthorizedException("Account is deactivated");
        }

        if (!Boolean.TRUE.equals(user.getEmailVerified())) {
            throw new EmailNotVerifiedException(user.getEmail());
        }

        return buildAuthResponse(user);
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
