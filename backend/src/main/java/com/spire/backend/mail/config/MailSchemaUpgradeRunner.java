package com.spire.backend.mail.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Idempotent, MySQL/MariaDB-only schema touch-ups the mail module needs that
 * {@code ddl-auto=update} won't apply on its own (it adds columns/tables but
 * never alters an existing column's type). Mirrors the LMS {@code DataSeeder}
 * pattern (boot-time guarded {@code ALTER}s). Runs before the mail seeder.
 */
@Component
@Order(5)
@RequiredArgsConstructor
@Slf4j
public class MailSchemaUpgradeRunner implements ApplicationRunner {

    private final JdbcTemplate jdbcTemplate;

    @Override
    public void run(ApplicationArguments args) {
        widenStatusColumn();
    }

    /**
     * {@code mail_accounts.status} was originally created as
     * {@code ENUM('ACTIVE','SUSPENDED')}; a legacy enum column can't hold the new
     * PENDING_DELETION value (insert fails with "Data truncated"). Convert it to
     * VARCHAR(20) so the entity's string-mapped status (and any future value)
     * fits. Idempotent — only runs while the column is still a narrow ENUM.
     */
    private void widenStatusColumn() {
        try {
            String type = jdbcTemplate.queryForObject(
                    "SELECT COLUMN_TYPE FROM information_schema.COLUMNS "
                            + "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'mail_accounts' "
                            + "AND COLUMN_NAME = 'status'",
                    String.class);
            if (type != null && type.toLowerCase().startsWith("enum")
                    && !type.toUpperCase().contains("PENDING_DELETION")) {
                jdbcTemplate.execute(
                        "ALTER TABLE mail_accounts MODIFY status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'");
                log.info("Mail schema: widened mail_accounts.status from a legacy ENUM to VARCHAR(20).");
            }
        } catch (Exception e) {
            // Non-fatal: on a non-MySQL DB or a permission hiccup, ddl-auto/entity
            // mapping still governs new installs; log and continue booting.
            log.warn("Mail schema status-column upgrade skipped: {}", e.toString());
        }
    }
}
