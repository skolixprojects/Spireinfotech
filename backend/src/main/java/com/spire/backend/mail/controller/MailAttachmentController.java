package com.spire.backend.mail.controller;

import com.spire.backend.dto.ApiResponse;
import com.spire.backend.mail.dto.MailAttachmentSummary;
import com.spire.backend.mail.security.MailPrincipal;
import com.spire.backend.mail.service.MailAttachmentService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

/**
 * Attachment endpoints under /api/mail. The mail chain authenticates
 * every route; the service enforces draft-ownership (add/remove) and the
 * walled access check (download). The download streams raw bytes — the
 * underlying blob URL is never sent to the client.
 */
@RestController
@RequestMapping("/api/mail")
@RequiredArgsConstructor
public class MailAttachmentController {

    private final MailAttachmentService mailAttachmentService;

    @PostMapping("/attachments")
    public ResponseEntity<ApiResponse<MailAttachmentSummary>> upload(
            Authentication auth,
            @RequestParam("draftId") Long draftId,
            @RequestParam("file") MultipartFile file) {
        return ResponseEntity.ok(ApiResponse.success("Attachment added",
                mailAttachmentService.upload(principal(auth), draftId, file)));
    }

    /** Copy a source message's attachments onto a draft (forwarding attachments). */
    @PostMapping("/attachments/copy")
    public ResponseEntity<ApiResponse<List<MailAttachmentSummary>>> copyFromMessage(
            Authentication auth,
            @RequestParam("draftId") Long draftId,
            @RequestParam("fromMessageId") Long fromMessageId) {
        return ResponseEntity.ok(ApiResponse.success("Attachments copied",
                mailAttachmentService.copyFromMessage(principal(auth), draftId, fromMessageId)));
    }

    @DeleteMapping("/attachments/{id}")
    public ResponseEntity<ApiResponse<Map<String, Object>>> remove(
            Authentication auth, @PathVariable Long id) {
        mailAttachmentService.remove(principal(auth), id);
        return ResponseEntity.ok(ApiResponse.success("Attachment removed", Map.of("ok", true)));
    }

    @GetMapping("/attachments/{id}")
    public ResponseEntity<byte[]> download(Authentication auth, @PathVariable Long id) {
        MailAttachmentService.Download d = mailAttachmentService.download(principal(auth), id);
        MediaType type;
        try {
            type = MediaType.parseMediaType(d.contentType());
        } catch (Exception e) {
            type = MediaType.APPLICATION_OCTET_STREAM;
        }
        String disposition = ContentDisposition.attachment()
                .filename(d.filename(), StandardCharsets.UTF_8).build().toString();
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition)
                .contentType(type)
                .body(d.data());
    }

    private MailPrincipal principal(Authentication auth) {
        return (MailPrincipal) auth.getPrincipal();
    }
}
