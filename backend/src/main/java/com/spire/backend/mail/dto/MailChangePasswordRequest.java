package com.spire.backend.mail.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * Authenticated self-change of the logged-in user's own password (the
 * forced first-login change, or a voluntary change). No token — the caller
 * is identified by their mail session.
 */
@Data
public class MailChangePasswordRequest {

    @NotBlank(message = "New password is required")
    @Size(min = 8, message = "Password must be at least 8 characters")
    private String newPassword;
}
