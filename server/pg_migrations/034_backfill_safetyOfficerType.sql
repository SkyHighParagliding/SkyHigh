-- Migration 034: Backfill safetyOfficerType from existing position field
--
-- Migration 033 just created the safetyOfficerType column, but every
-- existing safety committee contact has it as NULL. The TidyHQ webhook
-- populates this column on future group-add events, but won't backfill
-- existing data. So the Safety page cards all show generic "Safety Officer"
-- instead of "SSO" or "SO".
--
-- This migration parses the position field (which DOES have SO/SSO data
-- already from past TidyHQ syncs) using the same logic as the webhook:
--   1. If position contains "SSO" → safetyOfficerType = 'SSO'
--   2. Else if position contains "SO" → safetyOfficerType = 'SO'
--
-- The IS NULL guard on step 2 prevents overwriting SSO contacts (whose
-- position string also contains the substring "SO").

UPDATE contacts SET "safetyOfficerType" = 'SSO'
WHERE "isSafetyCommittee" = 1 AND position LIKE '%SSO%';

UPDATE contacts SET "safetyOfficerType" = 'SO'
WHERE "isSafetyCommittee" = 1
  AND position LIKE '%SO%'
  AND "safetyOfficerType" IS NULL;

