package com.spire.backend.mail.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * One action of an inbox rule (Phase 17). Serialized as JSON inside
 * {@code mail_rules.actions_json}. {@code targetFolderId} is required only for
 * MOVE_TO_FOLDER and must be a folder the rule's owner owns (validated at
 * create/update; re-checked + skipped at evaluation if it later vanishes).
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@JsonIgnoreProperties(ignoreUnknown = true)
public class RuleAction {

    private Type type;
    private Long targetFolderId;

    public enum Type { MOVE_TO_FOLDER, MARK_READ, STAR, MARK_IMPORTANT, DELETE }
}
