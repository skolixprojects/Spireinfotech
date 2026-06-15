package com.spire.backend.mail.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/** Admin-facing mailbox view (richer than the auth MailAccountSummary). */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MailboxSummary {

    private Long id;
    private String email;
    private String localPart;
    private Long domainId;
    private String domain;
    private String displayName;
    private String role;
    private String status;
    private Long quotaBytes;
    private Boolean mustChangePassword;
    private LocalDateTime lastLoginAt;
    private LocalDateTime createdAt;
}
