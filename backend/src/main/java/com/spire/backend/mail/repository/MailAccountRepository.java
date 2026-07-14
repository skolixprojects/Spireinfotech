package com.spire.backend.mail.repository;

import com.spire.backend.mail.entity.MailAccount;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface MailAccountRepository
        extends JpaRepository<MailAccount, Long>, JpaSpecificationExecutor<MailAccount> {

    Optional<MailAccount> findByLocalPartAndDomain_Id(String localPart, Long domainId);

    boolean existsByLocalPartAndDomain_Id(String localPart, Long domainId);

    /** Mailboxes whose deletion grace has elapsed — the scheduled hard-purge set. */
    List<MailAccount> findByStatusAndDeleteAfterLessThanEqual(MailAccount.Status status, LocalDateTime cutoff);

    /**
     * Pessimistically lock all ACTIVE super-admin account rows. Every
     * lockout guard (suspend, demote, domain-disable) calls this first
     * and then counts the "usable" subset (those in an active domain),
     * so two concurrent guard transactions serialize on these rows and
     * can never together drop the system below one usable super admin
     * (TOCTOU-safe). Single-table FOR UPDATE — portable to MySQL/MariaDB
     * and PostgreSQL.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT a FROM MailAccount a WHERE a.role = :role AND a.status = :status")
    List<MailAccount> lockActiveSuperAdmins(
            @Param("role") MailAccount.Role role, @Param("status") MailAccount.Status status);
}
