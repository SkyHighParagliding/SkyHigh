-- Migration 038: Seed position group mappings for Skyhigh Committee roles
--
-- Adds the 5 TidyHQ sub-groups that carry named position titles (President,
-- Vice President, Secretary, Treasurer, PG2 Representative). These are walked
-- from each contact's embedded groups[] during Quick Import and used to set
-- the contacts.position field via the isPosition flag.
--
-- Uses INSERT ... ON CONFLICT DO NOTHING so re-running is safe.

INSERT INTO tidyhq_group_mappings ("tidyhqGroupId", "tidyhqGroupName", "localRoleFlag")
VALUES
  ('206381', 'President',          'isPosition'),
  ('206382', 'Vice President',     'isPosition'),
  ('206384', 'Secretary',          'isPosition'),
  ('206383', 'Treasurer',          'isPosition'),
  ('206385', 'PG2 Representative', 'isPosition')
ON CONFLICT ("tidyhqGroupId", "localRoleFlag") DO NOTHING;
