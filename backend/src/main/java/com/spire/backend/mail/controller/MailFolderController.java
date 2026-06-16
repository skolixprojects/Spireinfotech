package com.spire.backend.mail.controller;

import com.spire.backend.dto.ApiResponse;
import com.spire.backend.mail.dto.MailFolderCreateRequest;
import com.spire.backend.mail.dto.MailFolderDto;
import com.spire.backend.mail.dto.MailFolderMoveRequest;
import com.spire.backend.mail.dto.MailFolderRenameRequest;
import com.spire.backend.mail.security.MailPrincipal;
import com.spire.backend.mail.service.MailFolderService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * Per-account folder tree CRUD (Phase 14). Authenticated by the mail chain;
 * every op is walled to the caller in {@link MailFolderService}. Mapped under
 * /api/mail/folders alongside (but not colliding with) the message-listing
 * GET /api/mail/folders/{folder}.
 */
@RestController
@RequestMapping("/api/mail/folders")
@RequiredArgsConstructor
public class MailFolderController {

    private final MailFolderService mailFolderService;

    /** The caller's full folder tree (flat adjacency list) with counts. */
    @GetMapping
    public ResponseEntity<ApiResponse<List<MailFolderDto>>> list(Authentication auth) {
        return ResponseEntity.ok(ApiResponse.success(mailFolderService.listFolders(principal(auth))));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<MailFolderDto>> create(
            Authentication auth, @Valid @RequestBody MailFolderCreateRequest req) {
        return ResponseEntity.ok(ApiResponse.success("Folder created",
                mailFolderService.createFolder(principal(auth), req.getName(), req.getParentFolderId())));
    }

    @PatchMapping("/{id}")
    public ResponseEntity<ApiResponse<MailFolderDto>> rename(
            Authentication auth, @PathVariable Long id, @Valid @RequestBody MailFolderRenameRequest req) {
        return ResponseEntity.ok(ApiResponse.success("Folder renamed",
                mailFolderService.renameFolder(principal(auth), id, req.getName())));
    }

    @PostMapping("/{id}/move")
    public ResponseEntity<ApiResponse<MailFolderDto>> move(
            Authentication auth, @PathVariable Long id, @RequestBody(required = false) MailFolderMoveRequest req) {
        Long parentId = req == null ? null : req.getParentFolderId();
        return ResponseEntity.ok(ApiResponse.success("Folder moved",
                mailFolderService.moveFolder(principal(auth), id, parentId)));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Map<String, Object>>> delete(Authentication auth, @PathVariable Long id) {
        mailFolderService.deleteFolder(principal(auth), id);
        return ResponseEntity.ok(ApiResponse.success("Folder deleted", Map.of("ok", true)));
    }

    private MailPrincipal principal(Authentication auth) {
        return (MailPrincipal) auth.getPrincipal();
    }
}
