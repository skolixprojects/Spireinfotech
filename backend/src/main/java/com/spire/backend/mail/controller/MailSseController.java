package com.spire.backend.mail.controller;

import com.spire.backend.mail.security.MailPrincipal;
import com.spire.backend.mail.service.MailSseService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * Live new-mail stream. Authenticated by the mail chain via the Bearer header
 * (no token in the URL) — the connection is opened only for the authenticated
 * account, and events are published only to that account's emitters.
 */
@RestController
@RequestMapping("/api/mail")
@RequiredArgsConstructor
public class MailSseController {

    private final MailSseService mailSseService;

    @GetMapping(value = "/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter events(Authentication auth) {
        MailPrincipal principal = (MailPrincipal) auth.getPrincipal();
        return mailSseService.register(principal.accountId());
    }
}
