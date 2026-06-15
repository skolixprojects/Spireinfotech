package com.spire.backend.mail.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/** A conversation: every message in the thread the caller can see, oldest first. */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MailThreadView {
    private Long threadId;
    private List<MailMessageDetail> messages;
}
