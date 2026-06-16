package com.spire.backend.mail.config;

import com.spire.backend.mail.entity.MailAccount;
import com.spire.backend.mail.entity.MailFolder;
import com.spire.backend.mail.entity.MailMailboxEntry.Folder;
import com.spire.backend.mail.repository.MailAccountRepository;
import com.spire.backend.mail.repository.MailMailboxEntryRepository;
import com.spire.backend.mail.service.MailFolderService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;

/**
 * Phase 14 migration — DATA-ONLY and IDEMPOTENT. ddl-auto owns the schema
 * (creates mail_folders + the mailbox_entries.folder_id column); this runner
 * only seeds the five system folders per account and points each
 * mailbox_entry at the system folder matching its vestigial enum value.
 *
 * <p>No raw/ALTER DDL (so it can't reproduce the known fresh-Postgres seeder
 * crash). Safe to re-run on every boot — it only fills NULL folder_id rows and
 * creates missing system folders, so a second run changes nothing. Brand-new
 * accounts seeded after this run get their folders at create time / lazily.
 */
@Component
@Order(20)   // after MailAdminSeeder (@Order 10), so a freshly-seeded admin gets folders this boot
@RequiredArgsConstructor
@Slf4j
public class MailFolderBackfillRunner implements ApplicationRunner {

    private final MailAccountRepository mailAccountRepository;
    private final MailFolderService mailFolderService;
    private final MailMailboxEntryRepository mailboxRepository;

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        List<MailAccount> accounts = mailAccountRepository.findAll();
        int backfilled = 0;
        for (MailAccount account : accounts) {
            Map<String, MailFolder> sys = mailFolderService.ensureSystemFolders(account);
            for (Folder key : Folder.values()) {
                MailFolder folder = sys.get(key.name());
                if (folder != null) {
                    backfilled += mailboxRepository.backfillFolderId(account.getId(), key, folder);
                }
            }
        }
        log.info("Mail folder migration: ensured system folders for {} account(s); "
                + "backfilled folder_id on {} mailbox entr(ies).", accounts.size(), backfilled);
    }
}
