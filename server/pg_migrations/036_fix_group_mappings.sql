-- Migration 036: Fix tidyhq_group_mappings data for S.O. and S.S.O. groups
--
-- Root cause of the safetyOfficerType-never-set bug (diagnosed 2026-05-27):
--   - TidyHQ group names are "S.O." (210063) and "S.S.O." (210060) with dots
--   - Our mappings stored "SO." and "SSO" (wrong names, wrong flags)
--   - Webhook handler did: tidyhqGroupName.replace(/\.$/, "") → "S.O" (not "SO")
--   - That never matched "SO" or "SSO" in the isPosition branch
--   - safetyOfficerType was NEVER set via any code path
--
-- Fixes:
--   Group 210063: name "SO." → "S.O.", flag isPosition → safetyOfficerType:SO
--   Group 210060: name "SSO" → "S.S.O.", flag isPosition → safetyOfficerType:SSO
--   Group 143877: trim trailing space from "Safety Committee " → "Safety Committee"
--   Group 139632: upsert Skyhigh Committee mapping (needed for smart import)
--
-- Uses INSERT ... ON CONFLICT DO UPDATE so it works on both fresh and existing DBs.

-- Safety Officer (S.O.)
INSERT INTO tidyhq_group_mappings ("tidyhqGroupId", "tidyhqGroupName", "localRoleFlag")
VALUES ('210063', 'S.O.', 'safetyOfficerType:SO')
ON CONFLICT ("tidyhqGroupId", "localRoleFlag") DO UPDATE
  SET "tidyhqGroupName" = EXCLUDED."tidyhqGroupName";

-- Senior Safety Officer (S.S.O.)
INSERT INTO tidyhq_group_mappings ("tidyhqGroupId", "tidyhqGroupName", "localRoleFlag")
VALUES ('210060', 'S.S.O.', 'safetyOfficerType:SSO')
ON CONFLICT ("tidyhqGroupId", "localRoleFlag") DO UPDATE
  SET "tidyhqGroupName" = EXCLUDED."tidyhqGroupName";

-- Safety Committee (parent group — correct the trailing space)
INSERT INTO tidyhq_group_mappings ("tidyhqGroupId", "tidyhqGroupName", "localRoleFlag")
VALUES ('143877', 'Safety Committee', 'isSafetyCommittee')
ON CONFLICT ("tidyhqGroupId", "localRoleFlag") DO UPDATE
  SET "tidyhqGroupName" = EXCLUDED."tidyhqGroupName";

-- Skyhigh Committee (parent group)
INSERT INTO tidyhq_group_mappings ("tidyhqGroupId", "tidyhqGroupName", "localRoleFlag")
VALUES ('139632', 'Skyhigh Committee', 'isCommittee')
ON CONFLICT ("tidyhqGroupId", "localRoleFlag") DO UPDATE
  SET "tidyhqGroupName" = EXCLUDED."tidyhqGroupName";

-- Remove the old broken mappings for the SO/SSO groups (wrong flag: isPosition)
DELETE FROM tidyhq_group_mappings
WHERE "tidyhqGroupId" IN ('210063', '210060')
  AND "localRoleFlag" = 'isPosition';
