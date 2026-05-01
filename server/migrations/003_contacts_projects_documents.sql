CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  organisation TEXT,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  notes TEXT,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'active',
  relatedSiteId TEXT,
  driveFolderId TEXT,
  driveFolderName TEXT,
  parksVic INTEGER DEFAULT 0,
  pvContactId TEXT,
  pvExpectations TEXT,
  worksRequired TEXT,
  contractorNotes TEXT,
  landownerNotes TEXT,
  stakeholderNotes TEXT,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS project_contacts (
  projectId TEXT NOT NULL,
  contactId TEXT NOT NULL,
  role TEXT,
  PRIMARY KEY (projectId, contactId)
);

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  driveFileId TEXT,
  name TEXT NOT NULL,
  mimeType TEXT,
  size INTEGER,
  category TEXT,
  driveFolderId TEXT,
  webViewLink TEXT,
  uploadedBy TEXT,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS project_documents (
  projectId TEXT NOT NULL,
  documentId TEXT NOT NULL,
  linked INTEGER DEFAULT 0,
  PRIMARY KEY (projectId, documentId)
);
