package com.spire.backend.mail.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Non-sensitive view of a mail account — returned by {@code /me} and
 * alongside a successful login. Never carries the password hash.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MailAccountSummary {

    private Long id;
    private String email;
    private String displayName;
    private String role;
    private String status;
    private Boolean mustChangePassword;
    private String domain;
    private String entityName;
}
