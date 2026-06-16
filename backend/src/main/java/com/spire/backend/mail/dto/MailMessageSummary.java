package com.spire.backend.mail.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.List;

/** Row in a folder/search listing — the caller's view of a message. */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MailMessageSummary {
    private Long messageId;
    private Long threadId;
    private String from;
    private String fromName;
    private List<String> to;
    private String subject;
    private String snippet;
    private LocalDateTime createdAt;
    private Boolean read;
    private Boolean starred;
    private Boolean important;
    private Boolean hasAttachments;
    private String folder;     // system key (INBOX/…) or custom folder name
    private Long folderId;     // folder_id (Phase 14) for the custom-folder UI
}
