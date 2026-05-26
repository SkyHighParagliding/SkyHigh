-- Add safetyOfficerType column to distinguish SSO vs SO
ALTER TABLE contacts ADD COLUMN "safetyOfficerType" TEXT DEFAULT NULL;

-- Index for filtering by type
CREATE INDEX idx_safety_officer_type ON contacts("safetyOfficerType") WHERE "isSafetyCommittee" = 1;
