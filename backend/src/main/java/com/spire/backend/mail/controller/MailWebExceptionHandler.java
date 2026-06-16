package com.spire.backend.mail.controller;

import com.spire.backend.dto.ApiResponse;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * Mail-scoped web exception handling. Restricted to the mail controllers via
 * {@code basePackages} and given highest precedence so it wins over the app-wide
 * handler for THESE endpoints only — LMS behavior is untouched (mail-only).
 *
 * <p>Turns an unreadable / type-invalid request body (e.g. an unknown enum value
 * in a rule's condition/action, which Jackson rejects during {@code @RequestBody}
 * deserialization BEFORE the controller runs) into a clean {@code 400} instead of
 * the app-wide catch-all's {@code 500}. The message is generic — it never echoes
 * the parser detail, which would leak enum class names / accepted values.
 */
@RestControllerAdvice(basePackages = "com.spire.backend.mail.controller")
@Order(Ordered.HIGHEST_PRECEDENCE)
public class MailWebExceptionHandler {

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiResponse<Object>> handleUnreadableBody(HttpMessageNotReadableException ex) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                .body(ApiResponse.error("Request body is malformed or contains an invalid value."));
    }
}
