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
}
