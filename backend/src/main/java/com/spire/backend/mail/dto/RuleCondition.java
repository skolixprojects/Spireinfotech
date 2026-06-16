package com.spire.backend.mail.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * One condition of an inbox rule (Phase 17). Serialized as JSON inside
 * {@code mail_rules.conditions_json}. {@code value} is the comparand for
 * CONTAINS/EQUALS; it is ignored for HAS_ATTACHMENT (IS_TRUE).
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@JsonIgnoreProperties(ignoreUnknown = true)
public class RuleCondition {

    private Field field;
    private Operator operator;
    private String value;

    public enum Field { FROM, TO, CC, SUBJECT, HAS_ATTACHMENT }

    public enum Operator { CONTAINS, EQUALS, IS_TRUE }
}
