package com.spire.backend.mail.security;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.stereotype.Component;

import java.io.IOException;

/**
 * Returns a JSON 401 for unauthenticated requests to the mail chain.
 * Without this, Spring's default entry point answers 403 for an
 * anonymous request; the mail contract (and the future mail-api client)
 * expects 401 = "no/invalid session", reserving 403 for an authenticated
 * caller who lacks the required mail authority. Scoped to the mail
 * security chain only — the LMS chain is untouched.
 */
@Component
public class MailRestAuthenticationEntryPoint implements AuthenticationEntryPoint {

    @Override
    public void commence(HttpServletRequest request, HttpServletResponse response,
                         AuthenticationException authException) throws IOException {
        response.setStatus(HttpStatus.UNAUTHORIZED.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.getWriter().write("{\"success\":false,\"message\":\"Unauthorized\"}");
    }
}
