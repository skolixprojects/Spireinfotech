package com.spire.backend.mail.dto;

import lombok.Data;

/** PATCH /messages/{id} — partial; only non-null fields are applied. */
@Data
public class MailFlagUpdateRequest {
    private Boolean read;
    private Boolean starred;
    private Boolean important;
    /** Move target: INBOX | ARCHIVE | TRASH (system folders SENT/DRAFTS rejected). */
    private String folder;
}
