package com.spire.backend.mail.repository;

import com.spire.backend.mail.entity.MailMessageRecipient;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface MailMessageRecipientRepository extends JpaRepository<MailMessageRecipient, Long> {

    List<MailMessageRecipient> findByMessage_Id(Long messageId);

    /** Batch-load recipients for a page of messages (avoids per-row N+1). */
    List<MailMessageRecipient> findByMessage_IdIn(Collection<Long> messageIds);

    void deleteByMessage_Id(Long messageId);
}
