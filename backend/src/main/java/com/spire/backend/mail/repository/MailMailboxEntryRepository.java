package com.spire.backend.mail.repository;

import com.spire.backend.mail.entity.MailFolder;
import com.spire.backend.mail.entity.MailMailboxEntry;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface MailMailboxEntryRepository
        extends JpaRepository<MailMailboxEntry, Long>, JpaSpecificationExecutor<MailMailboxEntry> {

    /** Folder listing (Phase 14) — by folder_id, newest-first with a stable id tiebreaker. */
    Page<MailMailboxEntry> findByAccount_IdAndFolderRef_IdAndDeletedAtIsNullOrderByMessage_CreatedAtDescIdDesc(
            Long accountId, Long folderId, Pageable pageable);

    long countByAccount_IdAndFolderRef_IdAndIsReadFalseAndDeletedAtIsNull(Long accountId, Long folderId);

    // Cross-folder Starred view (Phase 8) — starred, non-tombstoned entries.
    // The entry id is a stable secondary sort key so paging can't duplicate/skip
    // rows whose messages share a createdAt timestamp.
    Page<MailMailboxEntry> findByAccount_IdAndIsStarredTrueAndDeletedAtIsNullOrderByMessage_CreatedAtDescIdDesc(
            Long accountId, Pageable pageable);

    long countByAccount_IdAndIsStarredTrueAndIsReadFalseAndDeletedAtIsNull(Long accountId);

    Optional<MailMailboxEntry> findByAccount_IdAndMessage_IdAndDeletedAtIsNull(Long accountId, Long messageId);

    /** All of an account's entries (live + tombstoned) — used to purge a
     *  deleted mailbox's mail views. */
    List<MailMailboxEntry> findByAccount_Id(Long accountId);

    /** Total entries (live + tombstoned) referencing a message — 0 means the
     *  message is orphaned and can be purged after an account delete. */
    long countByMessage_Id(Long messageId);

    /**
     * Pessimistic-write variant used by mutating draft operations (attachment
     * add/remove, draft update/send). Taking the row lock serializes an
     * attachment change against a concurrent send of the same draft, so an
     * attachment can never land on an already-delivered message.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<MailMailboxEntry> findWithLockByAccount_IdAndMessage_IdAndDeletedAtIsNull(Long accountId, Long messageId);

    List<MailMailboxEntry> findByAccount_IdAndMessage_ThreadIdAndDeletedAtIsNull(Long accountId, Long threadId);

    /** Live (non-tombstoned) entries still referencing a shared message — the
     *  reference count that gates the permanent-delete purge (Phase 11). */
    long countByMessage_IdAndDeletedAtIsNull(Long messageId);

    /** Purge ALL entries (live + tombstoned) for a message — used when the last
     *  participant permanently deletes it. Bulk DML, executed immediately. */
    @Modifying
    @Query("delete from MailMailboxEntry e where e.message.id = :messageId")
    void purgeByMessageId(@Param("messageId") Long messageId);

    /** Per-folder [folderId, total, unread] over the caller's non-tombstoned
     *  entries — drives the folder tree counts and the legacy unread map. */
    @Query("SELECT e.folderRef.id, COUNT(e), "
            + "SUM(CASE WHEN e.isRead = false THEN 1 ELSE 0 END) "
            + "FROM MailMailboxEntry e "
            + "WHERE e.account.id = :accountId AND e.deletedAt IS NULL AND e.folderRef IS NOT NULL "
            + "GROUP BY e.folderRef.id")
    List<Object[]> countsByFolder(@Param("accountId") Long accountId);

    // ─── Phase 14 migration / folder-delete (bulk DML) ───────────────

    /** Backfill: point un-migrated entries at the system folder matching their
     *  vestigial enum value. Idempotent (only touches null folderRef rows). */
    @Modifying
    @Query("UPDATE MailMailboxEntry e SET e.folderRef = :folder "
            + "WHERE e.account.id = :accountId AND e.folder = :enumValue AND e.folderRef IS NULL")
    int backfillFolderId(@Param("accountId") Long accountId,
                         @Param("enumValue") MailMailboxEntry.Folder enumValue,
                         @Param("folder") MailFolder folder);

    /** Recursive folder delete: move every entry in the given folders to the
     *  caller's Trash (recoverable). Account-scoped for safety. */
    @Modifying
    @Query("UPDATE MailMailboxEntry e SET e.folderRef = :trash "
            + "WHERE e.account.id = :accountId AND e.folderRef.id IN :folderIds")
    int moveEntriesToTrash(@Param("accountId") Long accountId,
                           @Param("folderIds") Collection<Long> folderIds,
                           @Param("trash") MailFolder trash);
}
