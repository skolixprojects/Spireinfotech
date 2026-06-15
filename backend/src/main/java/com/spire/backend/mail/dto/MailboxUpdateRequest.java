package com.spire.backend.mail.dto;

import lombok.Data;

/**
 * PATCH — all fields optional; only non-null fields are applied.
 * A non-null {@code role} is a role change (SUPER_ADMIN-only, lockout-
 * guarded); {@code displayName} / {@code quotaBytes} are profile edits.
 */
@Data
public class MailboxUpdateRequest {

    private String displayName;
    private Long quotaBytes;
    private String role;
}
