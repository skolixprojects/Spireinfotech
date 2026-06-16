package com.spire.backend.mail.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * A node in the caller's folder tree (flat adjacency list — the client
 * assembles the tree via parentId). Carries per-folder total and unread
 * counts over non-deleted entries.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MailFolderDto {
    private Long id;
    private String name;
    private Long parentId;
    private String kind;        // SYSTEM | CUSTOM
    private String systemKey;   // INBOX/SENT/DRAFTS/ARCHIVE/TRASH for SYSTEM, else null
    private Integer sortOrder;
    private long total;
    private long unread;
}
