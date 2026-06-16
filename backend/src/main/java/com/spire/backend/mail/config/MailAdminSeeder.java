package com.spire.backend.mail.config;

import com.spire.backend.mail.entity.MailAccount;
import com.spire.backend.mail.entity.MailDomain;
import com.spire.backend.mail.repository.MailAccountRepository;
import com.spire.backend.mail.repository.MailDomainRepository;
import com.spire.backend.mail.service.MailAuthService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Env-guarded bootstrap of the first mail SUPER_ADMIN. The first admin
 * can't be created from the console (there's no admin yet), so it's
 * seeded from environment variables — but ONLY when {@code SEED_MAIL_ADMIN}
 * is explicitly {@code true} and a password is supplied.
 *
 * <p>Idempotent: the domain is upserted and the account is created only
 * if {@code (localPart, domainId)} doesn't already exist. The account is
 * forced into {@code mustChangePassword=true} so the bootstrap password
 * is rotated on first login. After the first successful boot, set
 * {@code SEED_MAIL_ADMIN=false}.
 *
 * <p>Mirrors the existing {@code DataSeeder} pattern (a startup runner)
 * but is fully self-contained in the mail package.
 */
@Component
@Order(10)   // before MailFolderBackfillRunner (@Order 20)
@RequiredArgsConstructor
@Slf4j
public class MailAdminSeeder implements ApplicationRunner {

    @Value("${mail.seed-admin:false}")
    private boolean seedAdmin;

    @Value("${mail.admin-email:}")
    private String adminEmail;

    @Value("${mail.admin-password:}")
    private String adminPassword;

    @Value("${mail.admin-entity:}")
    private String adminEntity;

    private final MailDomainRepository mailDomainRepository;
    private final MailAccountRepository mailAccountRepository;
    private final PasswordEncoder passwordEncoder;

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (!seedAdmin) {
            return;
        }
        if (adminEmail == null || adminEmail.isBlank()
                || adminPassword == null || adminPassword.isBlank()) {
            log.warn("SEED_MAIL_ADMIN is true but MAIL_ADMIN_EMAIL / MAIL_ADMIN_PASSWORD "
                    + "is blank — skipping mail admin seed.");
            return;
        }

        String[] parts;
        try {
            parts = MailAuthService.splitEmail(adminEmail);
        } catch (IllegalArgumentException e) {
            log.warn("MAIL_ADMIN_EMAIL '{}' is not a valid address — skipping mail admin seed.", adminEmail);
            return;
        }
        String localPart = parts[0];
        String domainStr = parts[1];

        // Upsert the domain. entityName defaults to the domain itself
        // when MAIL_ADMIN_ENTITY isn't set.
        MailDomain domain = mailDomainRepository.findByDomain(domainStr)
                .orElseGet(() -> {
                    MailDomain created = mailDomainRepository.save(MailDomain.builder()
                            .domain(domainStr)
                            .entityName((adminEntity != null && !adminEntity.isBlank()) ? adminEntity : domainStr)
                            .isActive(true)
                            .build());
                    log.info("Seeded mail domain '{}' (entity '{}')", created.getDomain(), created.getEntityName());
                    return created;
                });

        if (mailAccountRepository.existsByLocalPartAndDomain_Id(localPart, domain.getId())) {
            log.info("Mail SUPER_ADMIN {}@{} already exists — skipping seed.", localPart, domainStr);
            return;
        }

        MailAccount admin = mailAccountRepository.save(MailAccount.builder()
                .localPart(localPart)
                .domain(domain)
                .passwordHash(passwordEncoder.encode(adminPassword))
                .displayName("Mail Administrator")
                .role(MailAccount.Role.SUPER_ADMIN)
                .status(MailAccount.Status.ACTIVE)
                .mustChangePassword(true)
                .build());
        log.info("Seeded bootstrap mail SUPER_ADMIN {}@{} (id={}, mustChangePassword=true). "
                + "Set SEED_MAIL_ADMIN=false after first login.",
                localPart, domainStr, admin.getId());
    }
}
