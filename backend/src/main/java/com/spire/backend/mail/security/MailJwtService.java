package com.spire.backend.mail.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;
import java.util.function.Function;

/**
 * Mints and verifies mail-session JWTs. Mirrors the LMS
 * {@code JwtService} (HS256, same jjwt API) but is a wholly separate
 * service with its OWN signing secret ({@code mail.jwt-secret}) — an
 * LMS token can never be replayed as a mail token, nor vice-versa.
 *
 * <p>Every token carries a {@code typ} claim so each kind is
 * single-purpose:
 * <ul>
 *   <li>{@code access} — carries {@code role} + {@code did} (domain id);
 *       the only kind {@link MailJwtAuthFilter} will authenticate.</li>
 *   <li>{@code refresh} — subject only; exchanged for a new access
 *       token at {@code /api/mail/auth/refresh}.</li>
 * </ul>
 *
 * <p>The must-change-password flow does NOT use a JWT — it issues a
 * single-use DB token (see {@code MailSetupToken}), so set-password has
 * exactly one consume mechanism.
 */
@Service
public class MailJwtService {

    public static final String TYPE_ACCESS = "access";
    public static final String TYPE_REFRESH = "refresh";

    @Value("${mail.jwt-secret}")
    private String secretKey;

    @Value("${mail.access-token-expiration}")
    private long accessTokenExpiration;

    @Value("${mail.refresh-token-expiration}")
    private long refreshTokenExpiration;

    public String generateAccessToken(Long accountId, String role, Long domainId) {
        Map<String, Object> claims = new HashMap<>();
        claims.put("typ", TYPE_ACCESS);
        claims.put("role", role);
        claims.put("did", domainId);
        return buildToken(claims, String.valueOf(accountId), accessTokenExpiration);
    }

    public String generateRefreshToken(Long accountId) {
        return buildToken(Map.of("typ", TYPE_REFRESH), String.valueOf(accountId), refreshTokenExpiration);
    }

    public Long extractAccountId(String token) {
        return Long.parseLong(extractClaim(token, Claims::getSubject));
    }

    public String extractType(String token) {
        return extractClaim(token, claims -> claims.get("typ", String.class));
    }

    public String extractRole(String token) {
        return extractClaim(token, claims -> claims.get("role", String.class));
    }

    public Long extractDomainId(String token) {
        return extractClaim(token, claims -> {
            Object did = claims.get("did");
            return did == null ? null : ((Number) did).longValue();
        });
    }

    public boolean isTokenValid(String token) {
        try {
            return !isTokenExpired(token);
        } catch (Exception e) {
            return false;
        }
    }

    private boolean isTokenExpired(String token) {
        return extractClaim(token, Claims::getExpiration).before(new Date());
    }

    private <T> T extractClaim(String token, Function<Claims, T> resolver) {
        Claims claims = Jwts.parser()
                .verifyWith(getSigningKey())
                .build()
                .parseSignedClaims(token)
                .getPayload();
        return resolver.apply(claims);
    }

    private String buildToken(Map<String, Object> extraClaims, String subject, long expiration) {
        return Jwts.builder()
                .claims(extraClaims)
                .subject(subject)
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + expiration))
                .signWith(getSigningKey())
                .compact();
    }

    // Mirrors the LMS JwtService key derivation so the same length of
    // secret behaves identically across both auth systems.
    private SecretKey getSigningKey() {
        byte[] keyBytes = Decoders.BASE64.decode(
                java.util.Base64.getEncoder().encodeToString(secretKey.getBytes()));
        return Keys.hmacShaKeyFor(keyBytes);
    }
}
