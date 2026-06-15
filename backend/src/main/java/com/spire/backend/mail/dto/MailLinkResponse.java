package com.spire.backend.mail.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * Response for mailbox creation and setup/reset link issuance. The raw
 * one-time {@code token} (and ready-to-send {@code url}) are returned
 * EXACTLY ONCE here — only its SHA-256 hash is persisted. The admin
 * never learns the user's password.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MailLinkResponse {

    private MailboxSummary account;
    private String purpose;   // SETUP | RESET
    private String token;     // raw, one-time
    private String url;       // <APP_URL>/mail/set-password?token=...
    private LocalDateTime expiresAt;
}
