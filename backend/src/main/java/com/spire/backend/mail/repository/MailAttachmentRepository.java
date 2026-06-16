package com.spire.backend.mail.repository;

import com.spire.backend.mail.entity.MailAttachment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;

public interface MailAttachmentRepository extends JpaRepository<MailAttachment, Long> {

    List<MailAttachment> findByMessage_Id(Long messageId);

    List<MailAttachment> findByMessage_IdIn(Collection<Long> messageIds);

    long countByMessage_Id(Long messageId);

    /** Bulk-delete all attachment rows for a message (Phase 11 purge). Blobs are
     *  deleted separately and best-effort before this runs. */
    @Modifying
    @Query("delete from MailAttachment a where a.message.id = :messageId")
    void purgeByMessageId(@Param("messageId") Long messageId);
}
