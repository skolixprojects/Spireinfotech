package com.spire.backend.mail.repository;

import com.spire.backend.mail.entity.MailAuditLog;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface MailAuditLogRepository extends JpaRepository<MailAuditLog, Long> {

    /** SUPER_ADMIN view — all actions, newest first. */
    Page<MailAuditLog> findAllByOrderByCreatedAtDesc(Pageable pageable);

    /** ADMIN view — only actions performed by admins in their own domain. */
    Page<MailAuditLog> findByActorAccount_Domain_IdOrderByCreatedAtDesc(Long domainId, Pageable pageable);

    /** Remove the actor-audit rows of an account being hard-deleted (the
     *  actor_account_id FK is NOT NULL, so they can't dangle). */
    @Modifying
    @Query("delete from MailAuditLog a where a.actorAccount.id = :accountId")
    void deleteByActorAccount_Id(@Param("accountId") Long accountId);
}
