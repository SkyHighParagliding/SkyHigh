-- Migration 045: Remove multi-template settings
--
-- The template engine has been removed; SkyHigh is permanently on the
-- Wonderful White single-club design. The activeTemplate and per-template
-- logoMode_* settings are no longer read or written by any code.

DELETE FROM settings WHERE key = 'activeTemplate' OR key LIKE 'logoMode\_%' ESCAPE '\';
