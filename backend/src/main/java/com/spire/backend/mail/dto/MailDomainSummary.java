package com.spire.backend.mail.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MailDomainSummary {

    private Long id;
    private String domain;
    private String entityName;
    private Boolean isActive;
    private LocalDateTime createdAt;
}
