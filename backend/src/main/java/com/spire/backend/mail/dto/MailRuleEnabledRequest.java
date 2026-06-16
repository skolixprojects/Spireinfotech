package com.spire.backend.mail.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

/** Toggle body for enabling/disabling a rule without resending its full shape. */
@Data
public class MailRuleEnabledRequest {

    @NotNull(message = "enabled is required")
    private Boolean enabled;
}
