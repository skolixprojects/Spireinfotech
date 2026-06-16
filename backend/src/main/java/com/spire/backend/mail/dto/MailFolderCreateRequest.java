package com.spire.backend.mail.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class MailFolderCreateRequest {

    @NotBlank(message = "Folder name is required")
    @Size(max = 255, message = "Folder name is too long")
    private String name;

    /** Parent folder id; null = root level. Must be a folder the caller owns. */
    private Long parentFolderId;
}
