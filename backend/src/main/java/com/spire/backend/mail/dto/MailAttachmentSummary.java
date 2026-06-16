package com.spire.backend.mail.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** Non-sensitive attachment view — never includes the storage key or URL. */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MailAttachmentSummary {
    private Long id;
    private String filename;
    private String contentType;
    private Long sizeBytes;
}
