package com.spire.backend.mail.service;

import com.spire.backend.mail.entity.MailAccount;
import com.spire.backend.mail.entity.MailFolder;
import com.spire.backend.mail.repository.MailAccountRepository;
import com.spire.backend.mail.repository.MailAuditLogRepository;
import com.spire.backend.mail.repository.MailFolderRepository;
import com.spire.backend.mail.repository.MailRuleRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Hard-deletes a mailbox and ALL of its mail data, FK-safe. Separate from
 * {@code MailAdminService} so each account purge runs in its OWN
 * {@code REQUIRES_NEW} transaction — one account failing never rolls back the
 * rest of a batch.
 *
 * <p>Deletion order (each step clears a foreign key that would otherwise block
 * the account row delete):
 * <ol>
 *   <li>the account's actor-audit rows ({@code actor_account_id} is NOT NULL);</li>
 *   <li>its mail — messages it SENT are fully purged (the {@code sender_account_id}
 *       FK is NOT NULL; this also removes recipients' copies + attachments +
 *       blobs), its received entries are removed and any orphaned message purged,
 *       and its recipient rows on surviving messages are deleted;</li>
 *   <li>its inbox rules;</li>
 *   <li>its folders (self-parent links broken first);</li>
 *   <li>the account row itself.</li>
 * </ol>
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class MailAccountPurgeService {

    private final MailAccountRepository mailAccountRepository;
    private final MailAuditLogRepository mailAuditLogRepository;
    private final MailRuleRepository mailRuleRepository;
    private final MailFolderRepository mailFolderRepository;
    private final MailMessageService mailMessageService;

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void purge(Long accountId) {
        MailAccount account = mailAccountRepository.findById(accountId).orElse(null);
        if (account == null) return;
        mailAuditLogRepository.deleteByActorAccount_Id(accountId);
        mailMessageService.purgeAccountMailData(accountId);
        mailRuleRepository.deleteByAccount_Id(accountId);
        List<MailFolder> folders = mailFolderRepository.findByAccount_IdOrderBySortOrderAscNameAsc(accountId);
        if (!folders.isEmpty()) {
            Set<Long> folderIds = folders.stream().map(MailFolder::getId)
                    .collect(Collectors.toCollection(LinkedHashSet::new));
            mailFolderRepository.clearParentsByIds(accountId, folderIds);
            mailFolderRepository.deleteByIds(accountId, folderIds);
        }
        mailAccountRepository.delete(account);
        log.info("Hard-purged mailbox account {}", accountId);
    }
}
