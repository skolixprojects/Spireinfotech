package com.spire.backend.mail.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class MailSetPasswordRequest {

    /**
     * Either a change token from a must-change-password login, or a
     * SETUP/RESET setup-token (issuance of those arrives in Phase 2).
     */
    @NotBlank(message = "Token is required")
    private String token;

    @NotBlank(message = "New password is required")
    @Size(min = 8, message = "Password must be at least 8 characters")
    private String newPassword;
}
