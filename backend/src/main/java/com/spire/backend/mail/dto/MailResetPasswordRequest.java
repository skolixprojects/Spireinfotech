package com.spire.backend.mail.dto;

import lombok.Data;

/**
 * Admin password reset. {@code password} is optional — blank means the
 * server generates a strong one. Validated for strength in the service
 * (min length); the result is returned ONCE and never stored in plaintext.
 */
@Data
public class MailResetPasswordRequest {
    private String password;
}
