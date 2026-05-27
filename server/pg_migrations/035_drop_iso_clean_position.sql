-- Migration 035: Drop dead isSO/isSSO columns; clean SO/SSO fragments from position field
--
-- isSO and isSSO were added in migration 007 but never used in any route or query.
-- safetyOfficerType (migration 033) and isSafetyCommittee are the canonical columns.
--
-- The position field accumulated SO/SSO labels from early TidyHQ syncs (when the
-- webhook incorrectly concatenated group names into position). This migration
-- removes those fragments so position only contains actual role titles.

ALTER TABLE contacts DROP COLUMN IF EXISTS "isSO";
ALTER TABLE contacts DROP COLUMN IF EXISTS "isSSO";

-- Clean SO/SSO type fragments from position.
-- Process longer patterns first to avoid substring collision (S.S.O. contains S.O.).
-- After stripping, trim any orphaned leading/trailing commas and spaces.
WITH cleaned AS (
  SELECT id,
    NULLIF(
      TRIM(', ' FROM
        REPLACE(REPLACE(REPLACE(  -- SSO (no dots) — outermost
          REPLACE(REPLACE(          -- SO. (one dot, no leading S) — second
            REPLACE(REPLACE(REPLACE(  -- S.O. — third
              REPLACE(REPLACE(REPLACE(  -- S.S.O. — innermost (longest, must run first)
                position,
                'S.S.O., ', ''), ', S.S.O.', ''), 'S.S.O.', ''),
              'S.O., ', ''), ', S.O.', ''), 'S.O.', ''),
            'SO., ', ''), ', SO.', ''),
          'SSO, ', ''), ', SSO', ''), 'SSO', '')
      ),
      ''
    ) AS new_pos
  FROM contacts
  WHERE "isSafetyCommittee" = 1
    AND position IS NOT NULL
    AND (position LIKE '%S.O.%' OR position LIKE '%SSO%' OR position LIKE '%SO.%')
)
UPDATE contacts c
SET position = cl.new_pos
FROM cleaned cl
WHERE c.id = cl.id;
