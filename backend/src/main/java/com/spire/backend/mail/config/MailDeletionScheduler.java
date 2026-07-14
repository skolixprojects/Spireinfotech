package com.spire.backend.mail.config;

import com.spire.backend.mail.service.MailAdminService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Daily sweep that hard-purges mailboxes whose 15-day deletion grace has
 * elapsed. Uses the app-wide scheduler (already enabled for the LMS jobs); the
 * heavy lifting + per-account transaction isolation lives in
 * {@code MailAccountPurgeService}. Best-effort: a failure is logged, never
 * thrown, so the scheduler keeps running.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class MailDeletionScheduler {

    private final MailAdminService mailAdminService;

    @Scheduled(cron = "0 15 3 * * *")   // 03:15 daily
    public void purgeDueMailboxes() {
        try {
            mailAdminService.purgeDueDeletions();
        } catch (Exception e) {
            log.warn("Scheduled mailbox deletion sweep failed: {}", e.toString());
        }
    }
}
