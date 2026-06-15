package com.spire.backend.mail.dto;

import lombok.Data;

import java.util.List;

/**
 * Compose payload for send / save-draft / update-draft. Recipients are
 * addresses (full {@code local@domain} or bare local part) resolved and
 * walled to the sender's own domain at send time. Send requires at least
 * one recipient; a draft may have none.
 */
@Data
public class MailComposeRequest {
    private List<String> to;
    private List<String> cc;
    private List<String> bcc;
    private String subject;
    private String bodyHtml;
    private String bodyText;
    private Long inReplyToId;
}
