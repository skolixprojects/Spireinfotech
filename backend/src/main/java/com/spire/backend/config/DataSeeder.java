package com.spire.backend.config;

import com.spire.backend.entity.Role;
import com.spire.backend.entity.User;
import com.spire.backend.repository.RoleRepository;
import com.spire.backend.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Minimal LMS seeder: three canonical roles (STUDENT, INSTRUCTOR,
 * ADMIN) and one bootstrap admin user. Gated by SEEDER_ENABLED so
 * a fresh DB can boot cleanly first (Hibernate ddl-auto=update
 * creates the schema), then a redeploy with the flag on populates
 * the seed. Idempotent: skips whatever already exists.
 */
@Slf4j
@Component
@ConditionalOnProperty(name = "seeder.enabled", havingValue = "true", matchIfMissing = false)
@RequiredArgsConstructor
public class DataSeeder implements CommandLineRunner {

    private final RoleRepository roleRepository;
    private final UserRepository userRepository;
    private final BCryptPasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    @Override
    @Transactional
    public void run(String... args) {
        Role studentRole = roleRepository.findByName("STUDENT")
                .orElseGet(() -> roleRepository.save(Role.builder().name("STUDENT").build()));
        Role instructorRole = roleRepository.findByName("INSTRUCTOR")
                .orElseGet(() -> roleRepository.save(Role.builder().name("INSTRUCTOR").build()));
        Role adminRole = roleRepository.findByName("ADMIN")
                .orElseGet(() -> roleRepository.save(Role.builder().name("ADMIN").build()));

        log.info("Roles ready: STUDENT({}), INSTRUCTOR({}), ADMIN({})",
                studentRole.getId(), instructorRole.getId(), adminRole.getId());

        if (!userRepository.existsByEmail("admin@example.com")) {
            userRepository.save(User.builder()
                    .email("admin@example.com")
                    .passwordHash(passwordEncoder.encode("Admin@123"))
                    .fullName("Platform Admin")
                    .role(adminRole)
                    .isActive(true)
                    .emailVerified(true)
                    .build());
            log.info("Seeded platform admin: admin@example.com / Admin@123");
        } else {
            log.info("Platform admin already exists — skipping seed.");
        }
    }
}
