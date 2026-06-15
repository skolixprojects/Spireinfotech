package com.spire.backend.mail.security;

import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfigurationSource;

/**
 * The parallel mail security chain. Scoped to {@code /api/mail/**} and
 * ordered ahead of the LMS chain ({@code @Order(1)} vs the LMS chain's
 * {@code @Order(2)}), so mail requests are handled entirely here and the
 * LMS {@code JwtAuthFilter}/{@code AgreementGateFilter} never run on
 * them. Everything else falls through to the (catch-all) LMS chain
 * unchanged.
 *
 * <p>Stateless, CSRF off, CORS reused from the shared {@code CorsConfig}
 * bean. Authorization uses the {@code MAIL_<role>} authority namespace —
 * NOT Spring's {@code ROLE_} — so it can never satisfy an LMS role check.
 */
@Configuration
@RequiredArgsConstructor
public class MailSecurityConfig {

    private final MailJwtAuthFilter mailJwtAuthFilter;
    private final MailRestAuthenticationEntryPoint mailAuthEntryPoint;
    private final CorsConfigurationSource corsConfigurationSource;

    @Bean
    @Order(1)
    public SecurityFilterChain mailSecurityFilterChain(HttpSecurity http) throws Exception {
        http
                .securityMatcher("/api/mail/**")
                .cors(cors -> cors.configurationSource(corsConfigurationSource))
                .csrf(AbstractHttpConfigurer::disable)
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                // 401 (not Spring's default 403) for unauthenticated mail requests.
                .exceptionHandling(ex -> ex.authenticationEntryPoint(mailAuthEntryPoint))
                .authorizeHttpRequests(auth -> auth
                        // Public: login, refresh, set-password.
                        .requestMatchers("/api/mail/auth/**").permitAll()
                        // Mail admin console endpoints (Phase 2) require a
                        // mail admin authority — never Spire RBAC.
                        .requestMatchers("/api/mail/admin/**")
                                .hasAnyAuthority("MAIL_ADMIN", "MAIL_SUPER_ADMIN")
                        .anyRequest().authenticated()
                )
                .addFilterBefore(mailJwtAuthFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }
}
