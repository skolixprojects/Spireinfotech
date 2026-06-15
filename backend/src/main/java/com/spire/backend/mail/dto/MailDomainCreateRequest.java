package com.spire.backend.mail.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class MailDomainCreateRequest {

    @NotBlank(message = "Domain is required")
    private String domain;

    @NotBlank(message = "Entity name is required")
    private String entityName;
}
