package com.spire.backend.mail.repository;

import com.spire.backend.mail.entity.MailMailboxEntry;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface MailMailboxEntryRepository
        extends JpaRepository<MailMailboxEntry, Long>, JpaSpecificationExecutor<MailMailboxEntry> {

    Page<MailMailboxEntry> findByAccount_IdAndFolderAndDeletedAtIsNullOrderByMessage_CreatedAtDesc(
            Long accountId, MailMailboxEntry.Folder folder, Pageable pageable);

    // Cross-folder Starred view (Phase 8) — starred, non-tombstoned entries.
    // The entry id is a stable secondary sort key so paging can't duplicate/skip
    // rows whose messages share a createdAt timestamp.
    Page<MailMailboxEntry> findByAccount_IdAndIsStarredTrueAndDeletedAtIsNullOrderByMessage_CreatedAtDescIdDesc(
            Long accountId, Pageable pageable);

    long countByAccount_IdAndIsStarredTrueAndIsReadFalseAndDeletedAtIsNull(Long accountId);

    Optional<MailMailboxEntry> findByAccount_IdAndMessage_IdAndDeletedAtIsNull(Long accountId, Long messageId);

    /**
     * Pessimistic-write variant used by mutating draft operations (attachment
     * add/remove, draft update/send). Taking the row lock serializes an
     * attachment change against a concurrent send of the same draft, so an
     * attachment can never land on an already-delivered message.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<MailMailboxEntry> findWithLockByAccount_IdAndMessage_IdAndDeletedAtIsNull(Long accountId, Long messageId);

    List<MailMailboxEntry> findByAccount_IdAndMessage_ThreadIdAndDeletedAtIsNull(Long accountId, Long threadId);

    long countByAccount_IdAndFolderAndIsReadFalseAndDeletedAtIsNull(
            Long accountId, MailMailboxEntry.Folder folder);

    /** Unread counts grouped by folder for the caller (excludes tombstones). */
    @Query("SELECT e.folder, COUNT(e) FROM MailMailboxEntry e "
            + "WHERE e.account.id = :accountId AND e.isRead = false AND e.deletedAt IS NULL "
            + "GROUP BY e.folder")
    List<Object[]> countUnreadByFolder(@Param("accountId") Long accountId);
}
