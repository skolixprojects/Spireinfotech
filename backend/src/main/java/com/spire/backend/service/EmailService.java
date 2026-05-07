package com.spire.backend.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Email relay client. Posts to a Vercel-hosted Next.js API route
 * (see {@code frontend/src/app/api/send-email/route.ts}) which
 * forwards to Gmail SMTP via Nodemailer.
 *
 * Why the indirection: Railway's egress firewall blocks SMTP on
 * every port (587, 465, 25) so the JavaMail-based path could never
 * connect. Vercel's Node runtime can reach SMTP, so the backend
 * formats the message and delegates the wire-level send.
 *
 * Authentication is a shared secret in the JSON body; the Vercel
 * route refuses any request whose {@code secret} doesn't match.
 *
 * Sends are best-effort and synchronous — slow Vercel responses
 * delay the calling request, but every callsite already wraps
 * sendEmail in try/catch so an outage can't break signup,
 * enrollment, etc.
 */
@Service
@Slf4j
public class EmailService {

    @Value("${email.relay.url:}")
    private String relayUrl;

    @Value("${email.relay.secret:}")
    private String relaySecret;

    private final RestTemplate restTemplate;

    public EmailService() {
        // Tight timeouts so a hung Vercel deploy can't pin the calling
        // thread for the default minutes-long fetch. 5s connect / 15s
        // read is ample for a JSON POST + Gmail handoff.
        // Configured via SimpleClientHttpRequestFactory for portability
        // across Spring Boot versions where RestTemplateBuilder's
        // timeout API differs.
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(5_000);
        factory.setReadTimeout(15_000);
        this.restTemplate = new RestTemplate(factory);
    }

    /**
     * True when both the relay URL and shared secret are wired up.
     * Used by the test endpoint and the inactive-nudge cron to bail
     * out cleanly when email isn't configured for the environment.
     */
    public boolean isConfigured() {
        return relayUrl != null && !relayUrl.isBlank()
                && relaySecret != null && !relaySecret.isBlank();
    }

    /**
     * Posts the message to the relay. Logs and swallows any
     * exception — callers expect this to never throw.
     */
    public void sendEmail(String to, String subject, String htmlBody) {
        if (!isConfigured()) {
            log.warn("Email relay not configured — skipping send: subject='{}' to='{}'", subject, to);
            return;
        }
        try {
            Map<String, String> payload = new HashMap<>();
            payload.put("to", to);
            payload.put("subject", subject);
            payload.put("html", htmlBody);
            payload.put("secret", relaySecret);

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);
            HttpEntity<Map<String, String>> request = new HttpEntity<>(payload, headers);

            // Use LinkedHashMap so any future logging of the response
            // body keeps a stable field order.
            @SuppressWarnings("rawtypes")
            ResponseEntity<LinkedHashMap> response = restTemplate.postForEntity(
                    relayUrl, request, LinkedHashMap.class);

            @SuppressWarnings("unchecked")
            Map<String, Object> body = response.getBody();
            boolean ok = response.getStatusCode().is2xxSuccessful()
                    && body != null
                    && Boolean.TRUE.equals(body.get("ok"));

            if (ok) {
                log.info("Email relayed via Vercel: subject='{}' to='{}'", subject, to);
            } else {
                String detail = body != null && body.get("message") != null
                        ? body.get("message").toString() : "no body";
                log.error("Relay rejected send: subject='{}' to='{}': {}", subject, to, detail);
            }
        } catch (Exception e) {
            log.error("Email relay call failed: subject='{}' to='{}': {}",
                    subject, to, e.getMessage());
        }
    }
}
