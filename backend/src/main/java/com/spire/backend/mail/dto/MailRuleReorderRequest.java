package com.spire.backend.mail.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.List;

/**
 * Reorder body: the caller's rule ids in the desired evaluation order. Each id
 * must belong to the caller; priority is reassigned to the list position.
 */
@Data
public class MailRuleReorderRequest {

    @NotNull(message = "ruleIds is required")
    private List<Long> ruleIds;
}
