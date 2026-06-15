package com.spire.backend.mail.repository;

import com.spire.backend.mail.entity.MailDomain;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface MailDomainRepository extends JpaRepository<MailDomain, Long> {

    Optional<MailDomain> findByDomain(String domain);
}
