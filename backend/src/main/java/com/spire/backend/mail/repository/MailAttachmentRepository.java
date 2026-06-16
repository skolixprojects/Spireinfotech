package com.spire.backend.mail.repository;

import com.spire.backend.mail.entity.MailAttachment;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface MailAttachmentRepository extends JpaRepository<MailAttachment, Long> {

    List<MailAttachment> findByMessage_Id(Long messageId);

    List<MailAttachment> findByMessage_IdIn(Collection<Long> messageIds);

    long countByMessage_Id(Long messageId);
}
