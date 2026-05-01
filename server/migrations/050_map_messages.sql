CREATE TABLE IF NOT EXISTS map_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  senderPilotId TEXT NOT NULL,
  senderName TEXT NOT NULL,
  recipientPilotId TEXT NOT NULL,
  recipientName TEXT NOT NULL,
  message TEXT NOT NULL,
  thumbsUp INTEGER DEFAULT 0,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  deliveredAt DATETIME DEFAULT NULL
);
CREATE INDEX IF NOT EXISTS idx_map_messages_recipient ON map_messages (recipientPilotId, deliveredAt);
CREATE INDEX IF NOT EXISTS idx_map_messages_sender ON map_messages (senderPilotId);
CREATE INDEX IF NOT EXISTS idx_map_messages_created ON map_messages (createdAt);
