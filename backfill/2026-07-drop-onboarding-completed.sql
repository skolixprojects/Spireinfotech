-- Phase 6A: drop the dead onboarding_completed column (legacy LMS wizard write
-- path; wizard deleted in Phase 5C, endpoint removed in 6A, no live reader).
-- Run on Railway psql after deploy. Safe: nullable column, no gate reads it.
BEGIN;
ALTER TABLE users DROP COLUMN IF EXISTS onboarding_completed;
COMMIT;
