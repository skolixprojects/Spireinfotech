package com.spire.backend.mail.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class MailRefreshRequest {

    @NotBlank(message = "Refresh token is required")
    private String refreshToken;
}
