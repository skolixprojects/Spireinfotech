package com.spire.backend.mail.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Unified mail-auth result. Carries one of two shapes (NON_NULL
 * serialization drops the irrelevant fields):
 * <ul>
 *   <li>Full session: {@code accessToken} + {@code refreshToken} +
 *       {@code account}.</li>
 *   <li>Must-change-password: {@code mustChangePassword=true} +
 *       {@code changeToken} (+ {@code account}); NO session is issued
 *       until the password is changed.</li>
 * </ul>
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@JsonInclude(JsonInclude.Include.NON_NULL)
public class MailAuthResponse {

    private String accessToken;
    private String refreshToken;

    private Boolean mustChangePassword;
    private String changeToken;

    private MailAccountSummary account;
}
