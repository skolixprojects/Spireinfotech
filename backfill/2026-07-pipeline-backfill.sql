-- Two-pipeline backfill. Existing users predate the pipeline fields; without
-- this they'd all be null-pipeline and get bounced to /how-did-you-hear on next
-- load, and lose/gain gating unexpectedly. Grandfather every existing user as
-- DIRECT (full access, no checklist). Run on Railway psql after deploy.
-- NOTE: if any genuine in-flight REFERENCE user exists (pre-launch: unlikely),
-- set their pipeline='REFERENCE', referral_status='APPROVED' by hand instead.

BEGIN;

-- Preview how many rows will be grandfathered.
-- SELECT COUNT(*) FROM users WHERE pipeline IS NULL;

UPDATE users
   SET pipeline = 'DIRECT',
       referral_source = COALESCE(referral_source, 'SOCIAL_MEDIA')
 WHERE pipeline IS NULL;

-- Verify: no null-pipeline users remain.
-- SELECT COUNT(*) FROM users WHERE pipeline IS NULL;

COMMIT;
