package com.spire.backend.mail.dto;

import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Rules API response shape. Conditions/actions are returned PARSED (not raw
 * JSON) so the client never has to parse {@code *_json} itself.
 */
@Data
@Builder
public class MailRuleDto {

    private Long id;
    private String name;
    private Integer priority;
    private Boolean enabled;
    private String matchMode;        // ALL | ANY
    private Boolean stopProcessing;
    private List<RuleCondition> conditions;
    private List<RuleAction> actions;
    private LocalDateTime createdAt;
}
