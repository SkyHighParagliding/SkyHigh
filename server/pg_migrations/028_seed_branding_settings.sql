-- Migration 028: Seed branding / white-label settings
--
-- Source: server/migrations/015_branding_template.ts (legacy SQLite-only migration)
-- These settings configure club branding and template selection.
-- Not ported to the active PG migration set; this fills that gap.

INSERT INTO settings (key, value) VALUES ('clubName', 'SkyHigh') ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) VALUES ('clubTagline', '') ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) VALUES ('clubPrimaryColor', '') ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) VALUES ('clubLogoOriginal', '') ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) VALUES ('clubLogoNav', '') ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) VALUES ('clubLogoFooter', '') ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) VALUES ('clubLogoFavicon', '') ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) VALUES ('clubLogoSplash', '') ON CONFLICT (key) DO NOTHING;
-- NOTE: activeTemplate and logoMode_* are no longer seeded here — the template
-- engine has been removed (see migration 045). The INSERT below is retained
-- for idempotency on existing databases that ran this migration before the
-- engine was stripped; migration 045 deletes the row on next apply.
INSERT INTO settings (key, value) VALUES ('activeTemplate', 'wonderful-white') ON CONFLICT (key) DO NOTHING;
