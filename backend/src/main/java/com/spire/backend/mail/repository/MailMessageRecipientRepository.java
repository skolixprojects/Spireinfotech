package com.spire.backend.mail.repository;

import com.spire.backend.mail.entity.MailMessageRecipient;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;

public interface MailMessageRecipientRepository extends JpaRepository<MailMessageRecipient, Long> {

    List<MailMessageRecipient> findByMessage_Id(Long messageId);

    /** Batch-load recipients for a page of messages (avoids per-row N+1). */
    List<MailMessageRecipient> findByMessage_IdIn(Collection<Long> messageIds);

    void deleteByMessage_Id(Long messageId);

    /** Bulk-delete all recipient rows for a message (Phase 11 purge), executed
     *  immediately so ordering before the message delete is deterministic. */
    @Modifying
    @Query("delete from MailMessageRecipient r where r.message.id = :messageId")
    void purgeByMessageId(@Param("messageId") Long messageId);

    /** Bulk-delete recipient rows where an account is the recipient — used when
     *  deleting that mailbox (its recipient FK must go for surviving messages). */
    @Modifying
    @Query("delete from MailMessageRecipient r where r.recipient.id = :accountId")
    void deleteByRecipient_Id(@Param("accountId") Long accountId);
}
