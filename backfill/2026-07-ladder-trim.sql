-- PHASE 5B ladder-trim backfill. Migrates the 10 users off removed statuses.
-- *** RUN THIS BEFORE DEPLOYING THE PHASE 5B CODE. *** Reverse of usual order:
-- current_status is a plain string; post-deploy Status.valueOf silently maps any
-- leftover removed value to DRAFT_STARTED, stranding upper-lifecycle users. Run
-- this first so no row holds a removed value when the new code goes live.
-- Known live distribution (61 users): DASHBOARD_ENABLED 51 (untouched),
-- ID_EMAIL_SENT 6, EMAIL_VERIFICATION_PENDING 2, CHECK_COPY_UPLOADED 1, PROGRAM_SELECTED 1.

BEGIN;

-- Preview the two mid-agreement rows explicitly (the only non-obvious ones):
-- expect profile_complete = false for both → they map to DRAFT_STARTED.
-- SELECT email, current_status, profile_complete
--   FROM users WHERE current_status IN ('CHECK_COPY_UPLOADED','PROGRAM_SELECTED');

-- 1. Mid-onboarding rows on any removed status → DRAFT_STARTED.
UPDATE users
   SET current_status = 'DRAFT_STARTED'
 WHERE current_status IN (
     'BASIC_INFO_SUBMITTED','EMAIL_VERIFICATION_PENDING','EMAIL_VERIFIED',
     'PARTICIPANT_ID_CREATED','ID_EMAIL_SENT','ACKNOWLEDGMENT_ACCEPTED',
     'DOCUMENTS_SUBMITTED','PROGRAM_SELECTED','AGREEMENT_SENT',
     'AGREEMENT_COMPLETED','CHECK_COPY_UPLOADED','SIGNED_AGREEMENT_SENT_TO_ERM',
     'COACHES_ASSIGNED')
   AND profile_complete IS NOT TRUE;

-- 2. Any profile-complete row historically stuck on a removed status → DASHBOARD_ENABLED
--    (preserves upper-lifecycle access). Expected 0 rows given the distribution,
--    but included for safety in case the flag was set out of band.
UPDATE users
   SET current_status = 'DASHBOARD_ENABLED'
 WHERE current_status IN (
     'BASIC_INFO_SUBMITTED','EMAIL_VERIFICATION_PENDING','EMAIL_VERIFIED',
     'PARTICIPANT_ID_CREATED','ID_EMAIL_SENT','ACKNOWLEDGMENT_ACCEPTED',
     'DOCUMENTS_SUBMITTED','PROGRAM_SELECTED','AGREEMENT_SENT',
     'AGREEMENT_COMPLETED','CHECK_COPY_UPLOADED','SIGNED_AGREEMENT_SENT_TO_ERM',
     'COACHES_ASSIGNED')
   AND profile_complete IS TRUE;

-- workflow_states audit rows keep their historical from/to strings — never
-- enum-parsed, leave as-is.

-- Verify: only survivor values remain (expect DASHBOARD_ENABLED + DRAFT_STARTED).
-- SELECT current_status, COUNT(*) FROM users GROUP BY current_status ORDER BY 2 DESC;

COMMIT;
