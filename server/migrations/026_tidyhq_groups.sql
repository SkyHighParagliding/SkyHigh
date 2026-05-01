CREATE TABLE IF NOT EXISTS tidyhq_group_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tidyhqGroupId TEXT NOT NULL,
  tidyhqGroupName TEXT NOT NULL,
  localRoleFlag TEXT NOT NULL,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tidyhqGroupId, localRoleFlag)
);
CREATE TABLE IF NOT EXISTS tidyhq_webhook_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  eventType TEXT NOT NULL,
  tidyhqContactId TEXT,
  tidyhqGroupId TEXT,
  tidyhqGroupName TEXT,
  localContactId TEXT,
  localContactName TEXT,
  roleFlag TEXT,
  action TEXT,
  detail TEXT,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
);
