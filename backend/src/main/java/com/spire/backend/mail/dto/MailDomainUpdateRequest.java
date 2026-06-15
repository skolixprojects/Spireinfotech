package com.spire.backend.mail.dto;

import lombok.Data;

/** PATCH — all fields optional; only non-null fields are applied. */
@Data
public class MailDomainUpdateRequest {

    private String entityName;
    private Boolean isActive;
}
