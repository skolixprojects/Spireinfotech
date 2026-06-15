package com.spire.backend.mail.repository;

import com.spire.backend.mail.entity.MailMailboxEntry;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface MailMailboxEntryRepository
        extends JpaRepository<MailMailboxEntry, Long>, JpaSpecificationExecutor<MailMailboxEntry> {

    Page<MailMailboxEntry> findByAccount_IdAndFolderAndDeletedAtIsNullOrderByMessage_CreatedAtDesc(
            Long accountId, MailMailboxEntry.Folder folder, Pageable pageable);

    Optional<MailMailboxEntry> findByAccount_IdAndMessage_IdAndDeletedAtIsNull(Long accountId, Long messageId);

    List<MailMailboxEntry> findByAccount_IdAndMessage_ThreadIdAndDeletedAtIsNull(Long accountId, Long threadId);

    long countByAccount_IdAndFolderAndIsReadFalseAndDeletedAtIsNull(
            Long accountId, MailMailboxEntry.Folder folder);

    /** Unread counts grouped by folder for the caller (excludes tombstones). */
    @Query("SELECT e.folder, COUNT(e) FROM MailMailboxEntry e "
            + "WHERE e.account.id = :accountId AND e.isRead = false AND e.deletedAt IS NULL "
            + "GROUP BY e.folder")
    List<Object[]> countUnreadByFolder(@Param("accountId") Long accountId);
}
