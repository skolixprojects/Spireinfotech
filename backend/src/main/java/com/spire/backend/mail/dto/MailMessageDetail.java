package com.spire.backend.mail.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Full message as seen by the caller. {@code bcc} is populated only when
 * the caller is the sender — recipients never see the BCC list.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@JsonInclude(JsonInclude.Include.NON_NULL)
public class MailMessageDetail {
    private Long messageId;
    private Long threadId;
    private String messageUid;
    private String from;
    private String fromName;
    private List<String> to;
    private List<String> cc;
    private List<String> bcc;
    private String subject;
    private String bodyHtml;
    private String bodyText;
    private LocalDateTime createdAt;
    private Boolean hasAttachments;
    private Long inReplyToId;
    private java.util.List<MailAttachmentSummary> attachments;
    // caller's own envelope state
    private String folder;
    private Boolean read;
    private Boolean starred;
    private Boolean important;
}
