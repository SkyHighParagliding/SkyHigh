CREATE TABLE IF NOT EXISTS safety_sections (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  sortOrder INTEGER NOT NULL DEFAULT 0,
  sectionType TEXT NOT NULL DEFAULT 'custom',
  enabled INTEGER NOT NULL DEFAULT 1,
  linkUrl TEXT,
  linkLabel TEXT,
  lastUpdated DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO safety_sections (id, title, content, sortOrder, sectionType, enabled) VALUES
('emergency', 'Emergency Procedures', '### In Case of an Accident:

1. **Ensure your own safety first.**
2. **Assess the injured pilot.** Do not move them unless they are in immediate danger.
3. **Call 000** immediately for emergency services.
4. **Provide exact location details** (use coordinates if possible).
5. **Contact a Club Safety Officer** as soon as practical.

### Incident Reporting

All incidents, accidents, and near-misses must be reported to SAFA and the Club Committee within 24 hours.

[Submit Incident Report Form →](https://safa.asn.au/safety/reporting-an-accident/)', 1, 'emergency', 1),

('rules', 'General Club Rules', '1. **SAFA Membership** — All pilots flying at club sites must be current financial members of the Sports Aviation Federation of Australia (SAFA).
2. **Club Membership** — Visiting pilots must join as temporary members. Local pilots must hold full annual club membership.
3. **Mandatory Check-in** — All pilots must use the online check-in system before launching at any club site. Failure to do so may result in disciplinary action.
4. **Helmets & Reserves** — Approved helmets must be worn at all times while connected to a glider. A recently repacked reserve parachute is mandatory for all flights.', 3, 'rules', 1);
