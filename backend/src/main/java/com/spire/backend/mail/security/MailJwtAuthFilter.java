package com.spire.backend.mail.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.lang.NonNull;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

/**
 * Resolves a mail session from the {@code Authorization: Bearer} header
 * and installs a {@link MailPrincipal} into the security context. It is
 * wired ONLY into the mail security chain (scoped to {@code
 * /api/mail/**}), so it never runs on LMS routes and the LMS
 * {@code JwtAuthFilter} never runs here.
 *
 * <p>Only {@code access} tokens authenticate — refresh and change
 * tokens are rejected as bearers so they can't reach protected
 * endpoints. The granted authority is {@code MAIL_<role>} (never the
 * Spring {@code ROLE_} namespace), keeping mail RBAC entirely separate
 * from Spire RBAC.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class MailJwtAuthFilter extends OncePerRequestFilter {

    private final MailJwtService mailJwtService;

    @Override
    protected void doFilterInternal(
            @NonNull HttpServletRequest request,
            @NonNull HttpServletResponse response,
            @NonNull FilterChain filterChain) throws ServletException, IOException {

        String authHeader = request.getHeader("Authorization");

        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            filterChain.doFilter(request, response);
            return;
        }

        String token = authHeader.substring(7);

        if (mailJwtService.isTokenValid(token)
                && SecurityContextHolder.getContext().getAuthentication() == null) {

            // Only access tokens authenticate. A refresh/change token
            // used as a bearer is ignored — the request continues
            // unauthenticated and the chain's rules reject it.
            String type = mailJwtService.extractType(token);
            if (!MailJwtService.TYPE_ACCESS.equals(type)) {
                log.debug("Mail token type '{}' is not an access token — skipping auth", type);
                filterChain.doFilter(request, response);
                return;
            }

            Long accountId = mailJwtService.extractAccountId(token);
            String role = mailJwtService.extractRole(token);
            Long domainId = mailJwtService.extractDomainId(token);
            boolean mustChange = mailJwtService.extractMustChange(token);

            if (role == null || role.isBlank()) {
                log.warn("Mail access token has no role claim — accountId: {}", accountId);
                filterChain.doFilter(request, response);
                return;
            }

            List<SimpleGrantedAuthority> authorities = List.of(
                    new SimpleGrantedAuthority("MAIL_" + role));

            MailPrincipal principal = new MailPrincipal(accountId, domainId, role, mustChange);

            UsernamePasswordAuthenticationToken authToken =
                    new UsernamePasswordAuthenticationToken(principal, null, authorities);
            authToken.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));

            SecurityContextHolder.getContext().setAuthentication(authToken);
        }

        filterChain.doFilter(request, response);
    }
}
