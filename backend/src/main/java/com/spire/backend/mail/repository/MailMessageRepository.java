package com.spire.backend.mail.repository;

import com.spire.backend.mail.entity.MailMessage;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface MailMessageRepository extends JpaRepository<MailMessage, Long> {

    /** All messages in a conversation, oldest first (tie-break on id). */
    List<MailMessage> findByThreadIdOrderByCreatedAtAscIdAsc(Long threadId);

    /** All messages sent by an account — used to purge a deleted mailbox's
     *  outbound mail (the sender FK is NOT NULL, so the rows must go). */
    List<MailMessage> findBySender_Id(Long senderId);

    /** Pessimistic-write lock on the message row, so the permanent-delete
     *  reference-count-then-purge/tombstone is atomic per message — concurrent
     *  permanent-deletes of the same shared message can't both tombstone and
     *  strand an un-purgeable orphan. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select m from MailMessage m where m.id = :id")
    Optional<MailMessage> findByIdForUpdate(@Param("id") Long id);

    /** Null any reply's in_reply_to that points at a message about to be purged
     *  (the self-FK has no ON DELETE rule), so the delete can't FK-violate. */
    @Modifying
    @Query("update MailMessage m set m.inReplyTo = null where m.inReplyTo.id = :messageId")
    void clearInReplyTo(@Param("messageId") Long messageId);
}
