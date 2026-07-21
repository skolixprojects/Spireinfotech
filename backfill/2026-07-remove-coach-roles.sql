-- Remove COACH + TECHNICAL_ADVISOR role rows. Run on Railway psql after
-- the backend deploy. Preview counts first, then run inside BEGIN...COMMIT.

BEGIN;

-- 1. Preview any users still holding these roles (should be only seeded
--    test/prod coach accounts, no real users).
-- SELECT u.id, u.email, r.name
--   FROM users u JOIN roles r ON u.role_id = r.id
--  WHERE r.name IN ('COACH','TECHNICAL_ADVISOR');

-- 2. Delete those seeded coach accounts (they are non-functional after
--    role removal). Adjust if the preview shows a real user you want to
--    reassign instead.
DELETE FROM users
 WHERE role_id IN (SELECT id FROM roles WHERE name IN ('COACH','TECHNICAL_ADVISOR'));

-- 3. Drop the role rows.
DELETE FROM roles WHERE name IN ('COACH','TECHNICAL_ADVISOR');

-- 4. Verify
-- SELECT name FROM roles ORDER BY name;

COMMIT;
