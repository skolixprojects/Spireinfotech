package com.spire.backend.mail.repository;

import com.spire.backend.mail.entity.MailMessage;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface MailMessageRepository extends JpaRepository<MailMessage, Long> {

    /** All messages in a conversation, oldest first (tie-break on id). */
    List<MailMessage> findByThreadIdOrderByCreatedAtAscIdAsc(Long threadId);
}
