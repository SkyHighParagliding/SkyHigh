-- QR Links (TASK-043): general redirectable QR codes for banners, posters and
-- projects. A printed QR encodes the fixed address /go/<slug>; where that
-- address leads is set in Admin → QR Links and can change any time without a
-- reprint. Switched off (or unknown) links go to the home page. The per-site
-- QR redirects (sites."qrRedirects", migration 047) are separate and unchanged.
CREATE TABLE IF NOT EXISTS qr_links (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  destination TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  note TEXT NOT NULL DEFAULT '',
  scans INTEGER NOT NULL DEFAULT 0,
  "lastScanAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The two ends of the gazebo banner (NTVO 2026 at Mystic).
INSERT INTO qr_links (slug, title, destination, note) VALUES
  ('banner-left', 'Gazebo banner - left end', '/', 'Club website landing page'),
  ('banner-right', 'Gazebo banner - right end', '/sites/mystic', 'Site page for the event we are at (NTVO 2026: Mystic)')
ON CONFLICT (slug) DO NOTHING;
