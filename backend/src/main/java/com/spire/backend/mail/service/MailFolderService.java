package com.spire.backend.mail.service;

import com.spire.backend.exception.ResourceNotFoundException;
import com.spire.backend.exception.UnauthorizedException;
import com.spire.backend.mail.dto.MailFolderDto;
import com.spire.backend.mail.entity.MailAccount;
import com.spire.backend.mail.entity.MailFolder;
import com.spire.backend.mail.entity.MailMailboxEntry.Folder;
import com.spire.backend.mail.repository.MailAccountRepository;
import com.spire.backend.mail.repository.MailFolderRepository;
import com.spire.backend.mail.repository.MailMailboxEntryRepository;
import com.spire.backend.mail.security.MailPrincipal;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Per-account folder tree (Phase 14). Five SYSTEM folders are seeded per
 * account (undeletable/unrenamable); CUSTOM folders nest arbitrarily under any
 * folder the account owns. Every operation re-loads the caller and verifies
 * folder.account == caller — folders never cross accounts. The flag-based
 * Starred view is unaffected (it is not a folder).
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class MailFolderService {

    /** System folders + their fixed order; display names default to title-case. */
    private static final List<Folder> SYSTEM_ORDER =
            List.of(Folder.INBOX, Folder.SENT, Folder.DRAFTS, Folder.ARCHIVE, Folder.TRASH);

    private final MailAccountRepository mailAccountRepository;
    private final MailFolderRepository mailFolderRepository;
    private final MailMailboxEntryRepository mailboxRepository;

    // ─── System folders ─────────────────────────────────────────────

    /** Idempotently ensure the five system folders exist for an account. */
    @Transactional
    public Map<String, MailFolder> ensureSystemFolders(MailAccount account) {
        Map<String, MailFolder> bySys = new HashMap<>();
        for (MailFolder f : mailFolderRepository.findByAccount_IdOrderBySortOrderAscNameAsc(account.getId())) {
            if (f.getSystemKey() != null) bySys.putIfAbsent(f.getSystemKey(), f);
        }
        for (int i = 0; i < SYSTEM_ORDER.size(); i++) {
            Folder key = SYSTEM_ORDER.get(i);
            if (!bySys.containsKey(key.name())) {
                MailFolder created = mailFolderRepository.save(MailFolder.builder()
                        .account(account)
                        .name(displayName(key))
                        .parent(null)
                        .kind(MailFolder.Kind.SYSTEM)
                        .systemKey(key.name())
                        .sortOrder(i)
                        .build());
                bySys.put(key.name(), created);
            }
        }
        return bySys;
    }

    /** The account's system folder for a key (creating the set if missing). */
    @Transactional
    public MailFolder systemFolder(MailAccount account, Folder key) {
        return mailFolderRepository.findByAccount_IdAndSystemKey(account.getId(), key.name())
                .orElseGet(() -> ensureSystemFolders(account).get(key.name()));
    }

    // ─── Resolution / ownership ─────────────────────────────────────

    /** Ownership-checked fetch (404 when not the caller's). */
    @Transactional(readOnly = true)
    public MailFolder requireOwnedFolder(MailAccount account, Long folderId) {
        return mailFolderRepository.findByIdAndAccount_Id(folderId, account.getId())
                .orElseThrow(() -> new ResourceNotFoundException("MailFolder", "id", folderId));
    }

    /** Resolve a folder reference that is EITHER a system key ("INBOX") or a
     *  numeric folder id — the contract the existing folder endpoints use. */
    @Transactional
    public MailFolder resolveByKeyOrId(MailAccount account, String s) {
        if (s == null || s.isBlank()) throw new IllegalArgumentException("Folder is required.");
        String t = s.trim();
        try {
            return systemFolder(account, Folder.valueOf(t.toUpperCase())); // system key
        } catch (IllegalArgumentException notKey) {
            // not a system key — try a numeric folder id
        }
        try {
            return requireOwnedFolder(account, Long.parseLong(t));
        } catch (NumberFormatException e) {
            throw new ResourceNotFoundException("MailFolder", "id", t);
        }
    }

    // ─── CRUD (caller-walled) ───────────────────────────────────────

    @Transactional
    public MailFolderDto createFolder(MailPrincipal principal, String name, Long parentFolderId) {
        MailAccount caller = loadCaller(principal);
        String nm = name == null ? "" : name.trim();
        if (nm.isEmpty()) throw new IllegalArgumentException("Folder name is required.");
        List<MailFolder> all = mailFolderRepository.findByAccount_IdOrderBySortOrderAscNameAsc(caller.getId());
        MailFolder parent = parentFolderId == null ? null : ownedFrom(all, parentFolderId);
        assertNoDuplicate(all, parent, nm, null);
        MailFolder folder = mailFolderRepository.save(MailFolder.builder()
                .account(caller).name(nm).parent(parent)
                .kind(MailFolder.Kind.CUSTOM).systemKey(null).sortOrder(0)
                .build());
        return toDto(folder, 0, 0);
    }

    @Transactional
    public MailFolderDto renameFolder(MailPrincipal principal, Long id, String name) {
        MailAccount caller = loadCaller(principal);
        String nm = name == null ? "" : name.trim();
        if (nm.isEmpty()) throw new IllegalArgumentException("Folder name is required.");
        List<MailFolder> all = mailFolderRepository.findByAccount_IdOrderBySortOrderAscNameAsc(caller.getId());
        MailFolder folder = ownedFrom(all, id);
        if (folder.isSystem()) throw new IllegalArgumentException("System folders can't be renamed.");
        assertNoDuplicate(all, folder.getParent(), nm, folder.getId());
        folder.setName(nm);
        mailFolderRepository.save(folder);
        return toDto(folder, 0, 0);
    }

    @Transactional
    public MailFolderDto moveFolder(MailPrincipal principal, Long id, Long newParentId) {
        MailAccount caller = loadCaller(principal);
        List<MailFolder> all = mailFolderRepository.findByAccount_IdOrderBySortOrderAscNameAsc(caller.getId());
        MailFolder folder = ownedFrom(all, id);
        if (folder.isSystem()) throw new IllegalArgumentException("System folders can't be moved.");
        MailFolder newParent = newParentId == null ? null : ownedFrom(all, newParentId);
        if (newParent != null) {
            if (newParent.getId().equals(folder.getId())) {
                throw new IllegalArgumentException("A folder can't be moved into itself.");
            }
            if (descendantIds(all, folder.getId()).contains(newParent.getId())) {
                throw new IllegalArgumentException("A folder can't be moved into its own descendant.");
            }
        }
        assertNoDuplicate(all, newParent, folder.getName(), folder.getId());
        folder.setParent(newParent);
        mailFolderRepository.save(folder);
        return toDto(folder, 0, 0);
    }

    @Transactional
    public void deleteFolder(MailPrincipal principal, Long id) {
        MailAccount caller = loadCaller(principal);
        List<MailFolder> all = mailFolderRepository.findByAccount_IdOrderBySortOrderAscNameAsc(caller.getId());
        MailFolder folder = ownedFrom(all, id);
        if (folder.isSystem()) throw new IllegalArgumentException("System folders can't be deleted.");

        Set<Long> ids = new LinkedHashSet<>();
        ids.add(folder.getId());
        ids.addAll(descendantIds(all, folder.getId()));

        // Move every message in the folder + its descendants to Trash (recoverable),
        // then delete the folder rows. Order is FK-safe: entries first (so no entry
        // references a deleted folder), then break internal parent links, then delete.
        MailFolder trash = systemFolder(caller, Folder.TRASH);
        mailboxRepository.moveEntriesToTrash(caller.getId(), ids, trash);
        mailFolderRepository.clearParentsByIds(caller.getId(), ids);
        mailFolderRepository.deleteByIds(caller.getId(), ids);
    }

    @Transactional
    public List<MailFolderDto> listFolders(MailPrincipal principal) {
        MailAccount caller = loadCaller(principal);
        ensureSystemFolders(caller);   // every caller always sees their system folders
        List<MailFolder> all = mailFolderRepository.findByAccount_IdOrderBySortOrderAscNameAsc(caller.getId());
        Map<Long, long[]> counts = countsByFolder(caller.getId());
        return all.stream().map(f -> {
            long[] c = counts.getOrDefault(f.getId(), new long[]{0, 0});
            return toDto(f, c[0], c[1]);
        }).toList();
    }

    /** Legacy unread map keyed by system enum name (drives the existing FolderRail). */
    @Transactional(readOnly = true)
    public Map<String, Long> systemUnreadCounts(MailAccount account) {
        Map<Long, long[]> counts = countsByFolder(account.getId());
        Map<String, Long> out = new java.util.LinkedHashMap<>();
        for (Folder key : SYSTEM_ORDER) out.put(key.name(), 0L);
        for (MailFolder f : mailFolderRepository.findByAccount_IdOrderBySortOrderAscNameAsc(account.getId())) {
            if (f.getSystemKey() != null) {
                out.put(f.getSystemKey(), counts.getOrDefault(f.getId(), new long[]{0, 0})[1]);
            }
        }
        return out;
    }

    // ─── Helpers ────────────────────────────────────────────────────

    private Map<Long, long[]> countsByFolder(Long accountId) {
        Map<Long, long[]> counts = new HashMap<>();
        for (Object[] row : mailboxRepository.countsByFolder(accountId)) {
            Long fid = (Long) row[0];
            long total = ((Number) row[1]).longValue();
            long unread = ((Number) row[2]).longValue();
            counts.put(fid, new long[]{total, unread});
        }
        return counts;
    }

    private MailFolder ownedFrom(List<MailFolder> all, Long id) {
        return all.stream().filter(f -> f.getId().equals(id)).findFirst()
                .orElseThrow(() -> new ResourceNotFoundException("MailFolder", "id", id));
    }

    /** Reject a sibling name clash (case-insensitive), excluding the folder itself. */
    private void assertNoDuplicate(List<MailFolder> all, MailFolder parent, String name, Long excludeId) {
        Long parentId = parent == null ? null : parent.getId();
        boolean dup = all.stream()
                .filter(f -> excludeId == null || !f.getId().equals(excludeId))
                .filter(f -> java.util.Objects.equals(parentIdOf(f), parentId))
                .anyMatch(f -> f.getName().equalsIgnoreCase(name));
        if (dup) throw new IllegalArgumentException("A folder with that name already exists here.");
    }

    /** All descendant ids of a folder (excludes the folder itself). */
    private Set<Long> descendantIds(List<MailFolder> all, Long rootId) {
        Map<Long, List<MailFolder>> byParent = new HashMap<>();
        for (MailFolder f : all) {
            byParent.computeIfAbsent(parentIdOf(f), k -> new ArrayList<>()).add(f);
        }
        Set<Long> out = new LinkedHashSet<>();
        Deque<Long> stack = new ArrayDeque<>();
        stack.push(rootId);
        while (!stack.isEmpty()) {
            Long cur = stack.pop();
            for (MailFolder child : byParent.getOrDefault(cur, List.of())) {
                if (out.add(child.getId())) stack.push(child.getId());
            }
        }
        return out;
    }

    private static Long parentIdOf(MailFolder f) {
        return f.getParent() == null ? null : f.getParent().getId();
    }

    private MailFolderDto toDto(MailFolder f, long total, long unread) {
        return MailFolderDto.builder()
                .id(f.getId()).name(f.getName())
                .parentId(parentIdOf(f))
                .kind(f.getKind().name()).systemKey(f.getSystemKey())
                .sortOrder(f.getSortOrder()).total(total).unread(unread)
                .build();
    }

    private static String displayName(Folder key) {
        String n = key.name();
        return n.charAt(0) + n.substring(1).toLowerCase();   // INBOX -> Inbox
    }

    private MailAccount loadCaller(MailPrincipal principal) {
        MailAccount caller = mailAccountRepository.findById(principal.accountId())
                .orElseThrow(() -> new UnauthorizedException("Session is no longer valid."));
        if (caller.getStatus() != MailAccount.Status.ACTIVE
                || Boolean.FALSE.equals(caller.getDomain().getIsActive())) {
            throw new UnauthorizedException("Session is no longer valid.");
        }
        return caller;
    }
}
