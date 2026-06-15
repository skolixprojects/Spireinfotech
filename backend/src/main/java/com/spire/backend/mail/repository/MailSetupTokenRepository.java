package com.spire.backend.mail.repository;

import com.spire.backend.mail.entity.MailSetupToken;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface MailSetupTokenRepository extends JpaRepository<MailSetupToken, Long> {

    Optional<MailSetupToken> findByTokenHashAndUsedAtIsNull(String tokenHash);

    // Used to invalidate any prior unused token of a given purpose before
    // issuing a fresh SETUP / RESET link for an account.
    List<MailSetupToken> findByAccount_IdAndPurposeAndUsedAtIsNull(
            Long accountId, MailSetupToken.Purpose purpose);
}
