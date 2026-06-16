package com.spire.backend.mail.repository;

import com.spire.backend.mail.entity.MailRule;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface MailRuleRepository extends JpaRepository<MailRule, Long> {

    /** The caller's rules in evaluation order (priority asc, id asc). */
    List<MailRule> findByAccount_IdOrderByPriorityAscIdAsc(Long accountId);

    /** The caller's ENABLED rules in evaluation order — the engine's input. */
    List<MailRule> findByAccount_IdAndEnabledTrueOrderByPriorityAscIdAsc(Long accountId);

    /** Ownership-checked fetch — empty when the rule isn't the caller's. */
    Optional<MailRule> findByIdAndAccount_Id(Long id, Long accountId);
}
