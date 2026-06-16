package com.spire.backend.mail.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class MailboxCreateRequest {

    @NotBlank(message = "Local part is required")
    private String localPart;

    @NotNull(message = "Domain id is required")
    private Long domainId;

    private String displayName;

    /** USER | ADMIN | SUPER_ADMIN. Optional; defaults to USER. Only a
     *  SUPER_ADMIN may set a value other than USER. */
    private String role;

    /** Admin-typed initial password. Optional — blank means the server
     *  generates a strong one. Validated for strength in the service.
     *  Returned ONCE; only its BCrypt hash is stored. */
    private String password;

    /** Force a password change on first login. Optional; defaults to FALSE —
     *  an admin-set password is final unless this is explicitly true. */
    private Boolean requireChangeOnFirstLogin;
}
