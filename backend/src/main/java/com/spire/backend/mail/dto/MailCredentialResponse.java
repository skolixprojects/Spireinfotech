package com.spire.backend.mail.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * One-time credential result for admin create / reset. The {@code password}
 * is PLAINTEXT and exists ONLY here (the create/reset HTTP response and the
 * show-once admin modal) — it is never persisted, never logged, and never
 * returned by any GET. Only the BCrypt hash is stored on the account.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MailCredentialResponse {
    private MailboxSummary account;
    private String password;
}
