package com.spire.backend.mail.dto;

import lombok.Data;

@Data
public class MailFolderMoveRequest {
    /** New parent folder id; null = move to root level. Must be owned by the caller. */
    private Long parentFolderId;
}
