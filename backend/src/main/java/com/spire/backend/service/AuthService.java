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

import java.util.Map;

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

    @Transactional
    public AuthResponse register(RegisterRequest request) {
        // 1. Check duplicate email
        if (userRepository.existsByEmail(request.getEmail())) {
            throw new IllegalArgumentException("Email already registered");
        }

        // 2. Fetch STUDENT role from roles table
        Role studentRole = roleRepository.findByName("STUDENT")
                .orElseThrow(() -> new IllegalStateException("Default role STUDENT not found in database"));

        // 3. Build and save user
        User user = User.builder()
                .email(request.getEmail())
                .passwordHash(passwordEncoder.encode(request.getPassword()))
                .fullName(request.getFullName())
                .role(studentRole)
                .isActive(true)
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

        // 4. Generate tokens and return
        return buildAuthResponse(user);
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
