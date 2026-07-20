-- One-off backfill for the Phase 1C early-return bug.
-- Heals users who submitted acknowledgment / program-selection but whose
-- per-step flag was never flipped. Trusts "row exists in the step table"
-- as proof the user completed the step. Wrap in a transaction; run the
-- SELECTs first, sanity-check counts, then COMMIT.

BEGIN;

-- 1. Preview affected user counts (run first, sanity-check, then run the UPDATEs).
-- SELECT COUNT(*) AS stuck_ack
--   FROM users u
--  WHERE u.acknowledgment_complete IS NOT TRUE
--    AND EXISTS (SELECT 1 FROM acknowledgments a
--                 WHERE a.user_id = u.id
--                   AND a.acknowledgment_type = 'INTEREST_AND_ACCEPTANCE');
-- SELECT COUNT(*) AS stuck_program
--   FROM users u
--  WHERE u.program_selection_complete IS NOT TRUE
--    AND EXISTS (SELECT 1 FROM program_selections p WHERE p.user_id = u.id);

-- 2. Heal acknowledgment flag
UPDATE users u
   SET acknowledgment_complete = TRUE
 WHERE u.acknowledgment_complete IS NOT TRUE
   AND EXISTS (SELECT 1 FROM acknowledgments a
                WHERE a.user_id = u.id
                  AND a.acknowledgment_type = 'INTEREST_AND_ACCEPTANCE');

-- 3. Heal program-selection flag
UPDATE users u
   SET program_selection_complete = TRUE
 WHERE u.program_selection_complete IS NOT TRUE
   AND EXISTS (SELECT 1 FROM program_selections p WHERE p.user_id = u.id);

-- 4. Recompute pct, profile_complete, profile_completed_at so the
--    checklist bar, sidebar % badge, and enrollment gates align.
UPDATE users
   SET profile_completion_pct = (
       (CASE WHEN basic_info_complete        THEN 1 ELSE 0 END
      + CASE WHEN acknowledgment_complete    THEN 1 ELSE 0 END
      + CASE WHEN documents_complete         THEN 1 ELSE 0 END
      + CASE WHEN program_selection_complete THEN 1 ELSE 0 END
      + CASE WHEN agreement_complete         THEN 1 ELSE 0 END
      + CASE WHEN check_upload_complete      THEN 1 ELSE 0 END) * 100 / 6),
       profile_complete = (
           COALESCE(basic_info_complete,        FALSE)
       AND COALESCE(acknowledgment_complete,    FALSE)
       AND COALESCE(documents_complete,         FALSE)
       AND COALESCE(program_selection_complete, FALSE)
       AND COALESCE(agreement_complete,         FALSE)
       AND COALESCE(check_upload_complete,      FALSE)),
       profile_completed_at = CASE
           WHEN profile_completed_at IS NULL
            AND COALESCE(basic_info_complete,        FALSE)
            AND COALESCE(acknowledgment_complete,    FALSE)
            AND COALESCE(documents_complete,         FALSE)
            AND COALESCE(program_selection_complete, FALSE)
            AND COALESCE(agreement_complete,         FALSE)
            AND COALESCE(check_upload_complete,      FALSE)
           THEN NOW()
           ELSE profile_completed_at
       END;

-- 5. Verify
-- SELECT COUNT(*) AS profile_complete_true FROM users WHERE profile_complete IS TRUE;
-- SELECT COUNT(*) AS ack_true               FROM users WHERE acknowledgment_complete IS TRUE;

COMMIT;
