package com.spire.backend.mail.security;

/**
 * The authenticated principal for a mail request, resolved from a mail
 * access token by {@link MailJwtAuthFilter}. Deliberately tiny and
 * separate from any LMS principal — mail auth never resolves a Spire
 * user.
 *
 * <p>{@code domainId} is a convenience hint carried in the token; the
 * walled-per-entity rule is always enforced by re-loading the account's
 * domain from the database at the service layer, never by trusting this
 * value as authority.
 */
public record MailPrincipal(Long accountId, Long domainId, String role) {
}
