-- Per-site QR redirect config. One JSON blob holding, for each QR type
-- (info / checkin / xcmaps), a { url, enabled } entry. When enabled, the
-- matching QR-target page redirects the scanner to url instead of showing
-- its normal content — lets a printed QR be "parked" on another page until
-- the real destination is ready, with no reprint.
ALTER TABLE sites ADD COLUMN IF NOT EXISTS "qrRedirects" TEXT;
