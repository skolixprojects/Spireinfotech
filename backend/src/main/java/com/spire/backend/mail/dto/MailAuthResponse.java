package com.spire.backend.mail.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Mail-auth result: always a full session — {@code accessToken} +
 * {@code refreshToken} + {@code account}. login / refresh / change-password all
 * return this shape. A must-change account also gets a (gated) session; the
 * must-change signal travels on {@code account.mustChangePassword} and the gate
 * is enforced by the access token's {@code mch} claim (Phase 19).
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@JsonInclude(JsonInclude.Include.NON_NULL)
public class MailAuthResponse {

    private String accessToken;
    private String refreshToken;
    private MailAccountSummary account;
}
