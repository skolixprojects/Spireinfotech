-- Role consolidation 11→5. Run on Railway psql AFTER deploying the code that
-- seeds the 5 target roles. Reassign users, then drop drained role rows.
-- Preview first, then run inside BEGIN...COMMIT.

BEGIN;

-- 0. Sanity: confirm the 5 target roles exist (seeder must have run on deploy).
-- SELECT name, id FROM roles WHERE name IN ('STUDENT','INSTRUCTOR','ADMIN','ERM','ACCOUNTS') ORDER BY name;

-- 1. Preview how many users sit on each doomed role.
-- SELECT r.name, COUNT(u.id)
--   FROM roles r LEFT JOIN users u ON u.role_id = r.id
--  WHERE r.name IN ('PARTICIPANT','TRAINER','OPERATIONS_ADMIN','SYSTEM_ADMIN','FINANCE')
--  GROUP BY r.name;

-- 2. Reassign users to survivors.
UPDATE users SET role_id = (SELECT id FROM roles WHERE name='STUDENT')
 WHERE role_id = (SELECT id FROM roles WHERE name='PARTICIPANT');

UPDATE users SET role_id = (SELECT id FROM roles WHERE name='INSTRUCTOR')
 WHERE role_id = (SELECT id FROM roles WHERE name='TRAINER');

UPDATE users SET role_id = (SELECT id FROM roles WHERE name='ADMIN')
 WHERE role_id IN (SELECT id FROM roles WHERE name IN ('OPERATIONS_ADMIN','SYSTEM_ADMIN'));

UPDATE users SET role_id = (SELECT id FROM roles WHERE name='ACCOUNTS')
 WHERE role_id = (SELECT id FROM roles WHERE name='FINANCE');

-- 3. Drop the now-empty role rows.
DELETE FROM roles WHERE name IN ('PARTICIPANT','TRAINER','OPERATIONS_ADMIN','SYSTEM_ADMIN','FINANCE');

-- 4. Verify: exactly five roles remain.
-- SELECT name FROM roles ORDER BY name;

COMMIT;
