package com.spire.backend.mail.repository;

import com.spire.backend.mail.entity.MailSetupToken;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface MailSetupTokenRepository extends JpaRepository<MailSetupToken, Long> {

    Optional<MailSetupToken> findByTokenHashAndUsedAtIsNull(String tokenHash);
}
