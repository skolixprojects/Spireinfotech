package com.spire.backend.mail.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.lang.NonNull;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * Hard server-side gate for a must-change-password session (Phase 19). When the
 * authenticated {@link MailPrincipal} carries {@code mustChange=true}, the
 * session may reach ONLY the change flow — {@code POST /api/mail/me/change-password}
 * and {@code GET /api/mail/me} (plus the public {@code /api/mail/auth/**}); every
 * other {@code /api/mail/**} request is rejected with 403. This closes the
 * Phase 13 gap where a must-change user held a full session and could skip the
 * change. Runs AFTER {@link MailJwtAuthFilter} (so the principal is resolved)
 * and only acts when a mustChange principal is present — unauthenticated and
 * ungated requests pass straight through.
 */
@Component
public class MailMustChangeGateFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(
            @NonNull HttpServletRequest request,
            @NonNull HttpServletResponse response,
            @NonNull FilterChain filterChain) throws ServletException, IOException {

        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof MailPrincipal principal
                && principal.mustChange() && !allowedWhileMustChange(request)) {
            response.setStatus(HttpStatus.FORBIDDEN.value());
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.getWriter().write("{\"success\":false,\"message\":\"Password change required.\"}");
            return;
        }
        filterChain.doFilter(request, response);
    }

    /** While must-change: only the change flow + the public auth endpoints. */
    private boolean allowedWhileMustChange(HttpServletRequest request) {
        String uri = request.getRequestURI();
        String method = request.getMethod();
        if (uri.startsWith("/api/mail/auth/")) return true;
        if ("GET".equals(method) && "/api/mail/me".equals(uri)) return true;
        if ("POST".equals(method) && "/api/mail/me/change-password".equals(uri)) return true;
        return false;
    }
}
