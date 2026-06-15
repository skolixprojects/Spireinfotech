package com.spire.backend.mail.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.domain.Page;

import java.util.List;

/** A paged folder view plus that folder's unread count. */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MailFolderListing {
    private List<MailMessageSummary> content;
    private int page;
    private int size;
    private long totalElements;
    private int totalPages;
    private long unreadCount;

    public static MailFolderListing from(Page<?> page, List<MailMessageSummary> content, long unreadCount) {
        return MailFolderListing.builder()
                .content(content)
                .page(page.getNumber())
                .size(page.getSize())
                .totalElements(page.getTotalElements())
                .totalPages(page.getTotalPages())
                .unreadCount(unreadCount)
                .build();
    }
}
