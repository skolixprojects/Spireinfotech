package com.spire.backend.mail.repository;

import com.spire.backend.mail.entity.MailAccount;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface MailAccountRepository extends JpaRepository<MailAccount, Long> {

    Optional<MailAccount> findByLocalPartAndDomain_Id(String localPart, Long domainId);

    boolean existsByLocalPartAndDomain_Id(String localPart, Long domainId);
}
