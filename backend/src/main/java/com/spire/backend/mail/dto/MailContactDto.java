package com.spire.backend.mail.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** Autocomplete contact — an active account in the caller's own domain. */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MailContactDto {
    private Long id;
    private String email;
    private String displayName;
    private String role;
}
