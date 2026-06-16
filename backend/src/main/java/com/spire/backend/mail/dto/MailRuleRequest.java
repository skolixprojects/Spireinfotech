package com.spire.backend.mail.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.List;

/**
 * Create / update body for an inbox rule. {@code matchMode} is "ALL"|"ANY"
 * (default ALL); {@code priority}/{@code enabled}/{@code stopProcessing} are
 * optional. Deeper shape checks (>=1 condition, >=1 action, MOVE target owned)
 * happen in the service.
 */
@Data
public class MailRuleRequest {

    @NotBlank(message = "Rule name is required")
    @Size(max = 255, message = "Rule name is too long")
    private String name;

    private Integer priority;
    private Boolean enabled;
    private String matchMode;          // ALL | ANY (default ALL)
    private Boolean stopProcessing;

    @NotNull(message = "At least one condition is required")
    private List<RuleCondition> conditions;

    @NotNull(message = "At least one action is required")
    private List<RuleAction> actions;
}
