package com.spire.backend.mail.repository;

import com.spire.backend.mail.entity.MailAuditLog;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MailAuditLogRepository extends JpaRepository<MailAuditLog, Long> {

    /** SUPER_ADMIN view — all actions, newest first. */
    Page<MailAuditLog> findAllByOrderByCreatedAtDesc(Pageable pageable);

    /** ADMIN view — only actions performed by admins in their own domain. */
    Page<MailAuditLog> findByActorAccount_Domain_IdOrderByCreatedAtDesc(Long domainId, Pageable pageable);
}
