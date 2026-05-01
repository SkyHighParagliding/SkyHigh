/**
 * SkyHigh Paragliding Club — Google Drive Bridge API
 * 
 * This Apps Script connects the SkyHigh website to your Google Drive,
 * enabling the club filing system to browse, upload, search, and manage
 * documents directly from the admin dashboard. It also supports text
 * extraction from documents for AI-powered search.
 *
 * IMPORTANT: This script requires TWO setup steps:
 *   1. Enable the Drive Advanced Service: click + next to "Services" (left panel),
 *      find "Drive API", ensure the Identifier is "Drive", and click "Add".
 *      Either v2 or v3 will work — the script handles both automatically.
 *   2. Authorise extra permissions: In the function dropdown (top toolbar),
 *      select "_authoriseScopes" and click Run. Review and accept the
 *      permissions when prompted. This grants DocumentApp access needed
 *      for PDF text extraction. You only need to do this once.
 *
 * INSTALL INSTRUCTIONS:
 * 1. Go to https://script.google.com and create a new project
 * 2. Delete any code in the editor
 * 3. Paste this entire script
 * 4. Enable the Drive Advanced Service (see IMPORTANT note above)
 * 5. Click the disk icon to Save (or Ctrl+S)
 * 6. Click Deploy > New deployment
 * 7. Click the gear icon next to "Select type" and choose Web app
 * 8. Set "Execute as" to: Me
 * 9. Set "Who has access" to: Anyone
 * 10. Click Deploy and authorise when prompted
 * 11. Copy the Web app URL
 * 12. Paste it into the Connections & APIs page on the website
 *     under the Google Drive section (Apps Script URL field)
 *
 * AFTER DEPLOYING:
 * The website can now browse, search, and manage files in your Drive.
 * Documents uploaded through the website will appear in a folder 
 * structure created automatically in your Google Drive.
 *
 * UPDATING THE SCRIPT:
 * If you update this script, you must create a NEW deployment 
 * (Deploy > Manage deployments > Edit > New version) for changes 
 * to take effect. Update the URL on the website if it changes.
 */

var ROOT_FOLDER_NAME = "SkyHigh Club Documents";

var CATEGORY_FOLDERS = [
  "01_Governance & Manuals",
  "02_Committee Meetings",
  "03_Financial Records",
  "04_Membership & Contact",
  "05_Safety & Site Management",
  "06_Assets & Equipment",
  "07_Marketing & Photos",
  "08_Projects",
  "09_Public Reference",
  "10_Admin Reference"
];

var READABLE_MIMETYPES = [
  "application/pdf",
  "application/vnd.google-apps.document",
  "text/plain",
  "text/html",
  "text/csv",
  "application/vnd.google-apps.spreadsheet"
];

var MAX_TEXT_LENGTH = 500000;

function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : "status";
    var q = (e && e.parameter && e.parameter.q) ? e.parameter.q : "";
    var folder = (e && e.parameter && e.parameter.folder) ? e.parameter.folder : "";
    var fileId = (e && e.parameter && e.parameter.fileId) ? e.parameter.fileId : "";

    if (action === "status") {
      return jsonResponse({ success: true, connected: true, message: "Drive bridge is active" });
    }

    if (action === "setup") {
      return setupFolders();
    }

    if (action === "list") {
      var subfolder = (e && e.parameter && e.parameter.subfolder) ? e.parameter.subfolder : "";
      return listFiles(folder, subfolder);
    }

    if (action === "listSubfolders") {
      var subfolder = (e && e.parameter && e.parameter.subfolder) ? e.parameter.subfolder : "";
      return listSubfolders(folder, subfolder);
    }

    if (action === "createSubfolder") {
      var subfolderName = (e && e.parameter && e.parameter.name) ? e.parameter.name : "";
      var parentPath = (e && e.parameter && e.parameter.parentPath) ? e.parameter.parentPath : "";
      return createSubfolderInCategory(folder, subfolderName, parentPath);
    }

    if (action === "search") {
      return searchFiles(q);
    }

    if (action === "categories") {
      return listCategories();
    }

    if (action === "readFile") {
      return readFileContent(fileId);
    }

    if (action === "indexAll") {
      return indexAllDocuments();
    }

    if (action === "listProjectFiles") {
      var projectName = (e && e.parameter && e.parameter.project) ? e.parameter.project : "";
      return listProjectFiles(projectName);
    }

    if (action === "createProjectFolder") {
      var projectName = (e && e.parameter && e.parameter.project) ? e.parameter.project : "";
      return createProjectFolder(projectName);
    }

    if (action === "downloadFile") {
      var fileId = (e && e.parameter && e.parameter.fileId) ? e.parameter.fileId : "";
      return downloadFileAction(fileId);
    }

    return jsonResponse({ success: true, connected: true, actions: ["status", "setup", "list", "search", "categories", "readFile", "indexAll", "listProjectFiles", "createProjectFolder", "listSubfolders", "createSubfolder", "moveFile", "copyFile", "downloadFile"] });

  } catch (err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

function doPost(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : "";

    if (action === "upload") {
      var folder = (e && e.parameter && e.parameter.folder) ? e.parameter.folder : "";
      var subfolder = (e && e.parameter && e.parameter.subfolder) ? e.parameter.subfolder : "";
      var fileName = (e && e.parameter && e.parameter.name) ? e.parameter.name : "Untitled";
      var mimeType = (e && e.parameter && e.parameter.mimeType) ? e.parameter.mimeType : "application/octet-stream";

      var blob = Utilities.newBlob(
        Utilities.base64Decode(e.postData.contents),
        mimeType,
        fileName
      );

      var targetFolder = getOrCreateCategoryFolder(folder);
      if (!targetFolder) {
        return jsonResponse({ success: false, error: "Could not find or create folder: " + folder });
      }

      if (subfolder) {
        var subFolders = targetFolder.getFoldersByName(subfolder);
        if (subFolders.hasNext()) {
          targetFolder = subFolders.next();
        } else {
          targetFolder = targetFolder.createFolder(subfolder);
        }
      }

      var file = targetFolder.createFile(blob);
      return jsonResponse({
        success: true,
        file: {
          id: file.getId(),
          name: file.getName(),
          mimeType: file.getMimeType(),
          size: file.getSize(),
          url: file.getUrl(),
          dateCreated: file.getDateCreated().toISOString()
        }
      });
    }

    if (action === "delete") {
      var fileId = (e && e.parameter && e.parameter.fileId) ? e.parameter.fileId : "";
      if (!fileId) return jsonResponse({ success: false, error: "No fileId provided" });

      var file = DriveApp.getFileById(fileId);
      file.setTrashed(true);
      return jsonResponse({ success: true, message: "File moved to trash" });
    }

    if (action === "moveFile") {
      var fileId = (e && e.parameter && e.parameter.fileId) ? e.parameter.fileId : "";
      var destFolder = (e && e.parameter && e.parameter.folder) ? e.parameter.folder : "";
      var destSubfolder = (e && e.parameter && e.parameter.subfolder) ? e.parameter.subfolder : "";
      return moveFileAction(fileId, destFolder, destSubfolder);
    }

    if (action === "copyFile") {
      var fileId = (e && e.parameter && e.parameter.fileId) ? e.parameter.fileId : "";
      var destFolder = (e && e.parameter && e.parameter.folder) ? e.parameter.folder : "";
      var destSubfolder = (e && e.parameter && e.parameter.subfolder) ? e.parameter.subfolder : "";
      return copyFileAction(fileId, destFolder, destSubfolder);
    }

    return doGet(e);

  } catch (err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

function setupFolders() {
  var root = getOrCreateRootFolder();
  var created = [];
  var year = new Date().getFullYear().toString();

  var rootImportantName = "1 Important DO NOT CHANGE FOLDER STRUCTURE";
  if (!root.getFoldersByName(rootImportantName).hasNext()) {
    root.createFolder(rootImportantName);
    created.push(rootImportantName);
  }

  for (var i = 0; i < CATEGORY_FOLDERS.length; i++) {
    var name = CATEGORY_FOLDERS[i];
    var existing = root.getFoldersByName(name);
    var folder;
    if (!existing.hasNext()) {
      folder = root.createFolder(name);
      created.push(name);
    } else {
      folder = existing.next();
    }

    if (name === "02_Committee Meetings") {
      var subName = year + "_Meetings";
      if (!folder.getFoldersByName(subName).hasNext()) {
        folder.createFolder(subName);
        created.push(name + "/" + subName);
      }
    }

    if (name === "03_Financial Records") {
      var receiptsName = "Receipts_" + year;
      if (!folder.getFoldersByName(receiptsName).hasNext()) {
        folder.createFolder(receiptsName);
        created.push(name + "/" + receiptsName);
      }
    }

    if (name === "08_Projects") {
      var completedName = "Completed";
      if (!folder.getFoldersByName(completedName).hasNext()) {
        folder.createFolder(completedName);
        created.push(name + "/" + completedName);
      }
    }

    if (name === "09_Public Reference" || name === "10_Admin Reference") {
      var importantName = "1 Important DO NOT CHANGE FOLDER STRUCTURE";
      if (!folder.getFoldersByName(importantName).hasNext()) {
        folder.createFolder(importantName);
        created.push(name + "/" + importantName);
      }
    }
  }

  return jsonResponse({
    success: true,
    rootFolderId: root.getId(),
    rootFolderUrl: root.getUrl(),
    created: created,
    message: created.length > 0
      ? "Created " + created.length + " folder(s) and sub-folder(s)"
      : "All folders already exist"
  });
}

function listCategories() {
  var root = getOrCreateRootFolder();
  var categories = [];

  for (var i = 0; i < CATEGORY_FOLDERS.length; i++) {
    var name = CATEGORY_FOLDERS[i];
    var folders = root.getFoldersByName(name);
    var count = 0;
    var folderId = "";

    if (folders.hasNext()) {
      var f = folders.next();
      folderId = f.getId();
      count = f.getFiles().hasNext() ? countFiles(f) : 0;
    }

    categories.push({
      code: name.substring(0, 2),
      name: name,
      folderId: folderId,
      fileCount: count
    });
  }

  return jsonResponse({ success: true, categories: categories });
}

function navigateToFolder(startFolder, path) {
  if (!path) return startFolder;
  var parts = path.split("/");
  var current = startFolder;
  for (var i = 0; i < parts.length; i++) {
    var part = parts[i].trim();
    if (!part) continue;
    var children = current.getFoldersByName(part);
    if (!children.hasNext()) return null;
    current = children.next();
  }
  return current;
}

function listFiles(folderName, subfolderPath) {
  var root = getOrCreateRootFolder();
  var folders = root.getFoldersByName(folderName);

  if (!folders.hasNext()) {
    return jsonResponse({ success: true, files: [], subfolders: [] });
  }

  var folder = folders.next();

  if (subfolderPath) {
    folder = navigateToFolder(folder, subfolderPath);
    if (!folder) {
      return jsonResponse({ success: true, files: [], subfolders: [] });
    }
  }

  var files = folder.getFiles();
  var results = [];

  while (files.hasNext()) {
    var file = files.next();
    results.push({
      id: file.getId(),
      name: file.getName(),
      mimeType: file.getMimeType(),
      size: file.getSize(),
      url: file.getUrl(),
      dateCreated: file.getDateCreated().toISOString(),
      lastUpdated: file.getLastUpdated().toISOString()
    });
  }

  results.sort(function(a, b) {
    return new Date(b.dateCreated) - new Date(a.dateCreated);
  });

  var subfolderList = [];
  var subIter = folder.getFolders();
  while (subIter.hasNext()) {
    var sf = subIter.next();
    subfolderList.push({
      name: sf.getName(),
      id: sf.getId(),
      fileCount: countFiles(sf)
    });
  }
  subfolderList.sort(function(a, b) {
    return a.name.localeCompare(b.name);
  });

  return jsonResponse({ success: true, files: results, subfolders: subfolderList });
}

function listSubfolders(folderName, subfolderPath) {
  if (!folderName) return jsonResponse({ success: false, error: "No folder name provided" });
  var root = getOrCreateRootFolder();
  var folders = root.getFoldersByName(folderName);
  if (!folders.hasNext()) {
    return jsonResponse({ success: true, subfolders: [] });
  }
  var folder = folders.next();
  if (subfolderPath) {
    folder = navigateToFolder(folder, subfolderPath);
    if (!folder) return jsonResponse({ success: true, subfolders: [] });
  }
  var subIter = folder.getFolders();
  var results = [];
  while (subIter.hasNext()) {
    var sf = subIter.next();
    results.push({
      name: sf.getName(),
      id: sf.getId(),
      fileCount: countFiles(sf)
    });
  }
  results.sort(function(a, b) {
    return a.name.localeCompare(b.name);
  });
  return jsonResponse({ success: true, subfolders: results });
}

function createSubfolderInCategory(folderName, subfolderName, parentPath) {
  if (!folderName) return jsonResponse({ success: false, error: "No folder name provided" });
  if (!subfolderName) return jsonResponse({ success: false, error: "No subfolder name provided" });

  var root = getOrCreateRootFolder();
  var folders = root.getFoldersByName(folderName);
  if (!folders.hasNext()) {
    return jsonResponse({ success: false, error: "Category folder not found: " + folderName });
  }
  var folder = folders.next();
  if (parentPath) {
    folder = navigateToFolder(folder, parentPath);
    if (!folder) return jsonResponse({ success: false, error: "Parent folder not found: " + parentPath });
  }
  var existing = folder.getFoldersByName(subfolderName);
  if (existing.hasNext()) {
    var ef = existing.next();
    return jsonResponse({ success: true, created: false, subfolder: { name: ef.getName(), id: ef.getId() }, message: "Folder already exists" });
  }
  var newFolder = folder.createFolder(subfolderName);
  return jsonResponse({ success: true, created: true, subfolder: { name: newFolder.getName(), id: newFolder.getId() }, message: "Folder created" });
}

function getDestinationFolder(categoryFolderName, subfolderPath) {
  var root = getOrCreateRootFolder();
  var catFolders = root.getFoldersByName(categoryFolderName);
  if (!catFolders.hasNext()) return null;
  var catFolder = catFolders.next();
  if (!subfolderPath) return catFolder;
  var dest = navigateToFolder(catFolder, subfolderPath);
  if (dest) return dest;
  var parts = subfolderPath.split("/");
  var current = catFolder;
  for (var i = 0; i < parts.length; i++) {
    var part = parts[i].trim();
    if (!part) continue;
    var children = current.getFoldersByName(part);
    if (children.hasNext()) {
      current = children.next();
    } else {
      current = current.createFolder(part);
    }
  }
  return current;
}

function moveFileAction(fileId, destFolderName, destSubfolder) {
  if (!fileId) return jsonResponse({ success: false, error: "No fileId provided" });
  if (!destFolderName) return jsonResponse({ success: false, error: "No destination folder provided" });

  var destFolder = getDestinationFolder(destFolderName, destSubfolder);
  if (!destFolder) return jsonResponse({ success: false, error: "Destination folder not found: " + destFolderName });

  var file = DriveApp.getFileById(fileId);
  var parents = file.getParents();
  while (parents.hasNext()) {
    parents.next().removeFile(file);
  }
  destFolder.addFile(file);

  return jsonResponse({
    success: true,
    message: "File moved successfully",
    file: { id: file.getId(), name: file.getName(), url: file.getUrl() }
  });
}

function copyFileAction(fileId, destFolderName, destSubfolder) {
  if (!fileId) return jsonResponse({ success: false, error: "No fileId provided" });
  if (!destFolderName) return jsonResponse({ success: false, error: "No destination folder provided" });

  var destFolder = getDestinationFolder(destFolderName, destSubfolder);
  if (!destFolder) return jsonResponse({ success: false, error: "Destination folder not found: " + destFolderName });

  var file = DriveApp.getFileById(fileId);
  var copy = file.makeCopy(file.getName(), destFolder);

  return jsonResponse({
    success: true,
    message: "File copied successfully",
    file: { id: copy.getId(), name: copy.getName(), url: copy.getUrl(), size: copy.getSize(), mimeType: copy.getMimeType(), dateCreated: copy.getDateCreated().toISOString() }
  });
}

function downloadFileAction(fileId) {
  if (!fileId) return jsonResponse({ success: false, error: "No fileId provided" });

  var file = DriveApp.getFileById(fileId);
  var blob = file.getBlob();
  var base64 = Utilities.base64Encode(blob.getBytes());

  return jsonResponse({
    success: true,
    file: { id: file.getId(), name: file.getName(), mimeType: file.getMimeType(), size: file.getSize() },
    data: base64
  });
}

function searchFiles(query) {
  if (!query) return jsonResponse({ success: true, files: [] });

  var root = getOrCreateRootFolder();
  var results = [];
  var q = query.toLowerCase();

  for (var i = 0; i < CATEGORY_FOLDERS.length; i++) {
    var folders = root.getFoldersByName(CATEGORY_FOLDERS[i]);
    if (!folders.hasNext()) continue;

    var folder = folders.next();
    var files = folder.getFiles();

    while (files.hasNext()) {
      var file = files.next();
      if (file.getName().toLowerCase().indexOf(q) > -1) {
        results.push({
          id: file.getId(),
          name: file.getName(),
          mimeType: file.getMimeType(),
          size: file.getSize(),
          url: file.getUrl(),
          category: CATEGORY_FOLDERS[i],
          dateCreated: file.getDateCreated().toISOString()
        });
      }
    }
  }

  return jsonResponse({ success: true, query: query, count: results.length, files: results });
}

function readFileContent(fileId) {
  if (!fileId) return jsonResponse({ success: false, error: "No fileId provided" });

  try {
    var file = DriveApp.getFileById(fileId);
    var mimeType = file.getMimeType();
    var name = file.getName();
    var text = "";

    if (mimeType === "application/vnd.google-apps.document") {
      var doc = DocumentApp.openById(fileId);
      text = doc.getBody().getText();
    }
    else if (mimeType === "application/vnd.google-apps.spreadsheet") {
      var ss = SpreadsheetApp.openById(fileId);
      var sheets = ss.getSheets();
      var parts = [];
      for (var s = 0; s < sheets.length; s++) {
        var sheet = sheets[s];
        var data = sheet.getDataRange().getValues();
        parts.push("--- Sheet: " + sheet.getName() + " ---");
        for (var r = 0; r < data.length; r++) {
          parts.push(data[r].join(" | "));
        }
      }
      text = parts.join("\n");
    }
    else if (mimeType === "text/plain" || mimeType === "text/html" || mimeType === "text/csv") {
      text = file.getBlob().getDataAsString();
      if (mimeType === "text/html") {
        text = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      }
    }
    else if (mimeType === "application/pdf") {
      text = extractTextFromPdf(fileId, name);
    }
    else {
      return jsonResponse({
        success: true,
        fileId: fileId,
        name: name,
        mimeType: mimeType,
        text: "",
        readable: false,
        message: "File type not supported for text extraction: " + mimeType
      });
    }

    if (text.length > MAX_TEXT_LENGTH) {
      text = text.substring(0, MAX_TEXT_LENGTH) + "\n\n[Truncated — document exceeds " + MAX_TEXT_LENGTH + " characters]";
    }

    return jsonResponse({
      success: true,
      fileId: fileId,
      name: name,
      mimeType: mimeType,
      text: text,
      readable: true,
      charCount: text.length
    });
  } catch (err) {
    return jsonResponse({ success: false, fileId: fileId, error: "Failed to read file: " + err.message });
  }
}

function extractTextFromPdf(fileId, fileName) {
  if (typeof Drive === "undefined" || !Drive.Files) {
    return "[PDF text extraction unavailable: The Drive Advanced Service is not enabled. In the Apps Script editor, click the + next to 'Services' in the left sidebar, select 'Drive API', make sure the Identifier field says 'Drive', and click 'Add'. Either v2 or v3 will work. Then re-deploy the script.]";
  }

  try {
    var blob = DriveApp.getFileById(fileId).getBlob();
    var convertedId = null;

    if (Drive.Files.create) {
      var createdFile = Drive.Files.create(
        { name: fileName + " _temp_ocr_", mimeType: "application/vnd.google-apps.document" },
        blob,
        { fields: "id" }
      );
      convertedId = createdFile.id;
    }
    else if (Drive.Files.insert) {
      var insertedFile = Drive.Files.insert(
        { title: fileName + " _temp_ocr_", mimeType: "application/vnd.google-apps.document" },
        blob,
        { convert: true, ocr: true }
      );
      convertedId = insertedFile.id;
    }

    if (!convertedId) {
      return "[PDF text extraction failed: Drive Advanced Service is loaded but neither Files.create (v3) nor Files.insert (v2) is available. Check the Identifier is set to 'Drive'.]";
    }

    var doc = DocumentApp.openById(convertedId);
    var text = doc.getBody().getText();

    DriveApp.getFileById(convertedId).setTrashed(true);
    return text;
  } catch (err) {
    return "[PDF text extraction failed: " + err.message + "]";
  }
}

function indexAllDocuments() {
  var root = getOrCreateRootFolder();
  var allDocs = [];

  for (var i = 0; i < CATEGORY_FOLDERS.length; i++) {
    var folders = root.getFoldersByName(CATEGORY_FOLDERS[i]);
    if (!folders.hasNext()) continue;

    var folder = folders.next();
    indexFolder(folder, CATEGORY_FOLDERS[i], allDocs);
  }

  return jsonResponse({
    success: true,
    count: allDocs.length,
    documents: allDocs
  });
}

var INDEX_MAX_DEPTH = 5;
var INDEX_MAX_FILES = 500;

function indexFolder(folder, categoryName, allDocs, depth) {
  if (typeof depth === "undefined") depth = 0;
  if (depth > INDEX_MAX_DEPTH || allDocs.length >= INDEX_MAX_FILES) return;

  var files = folder.getFiles();
  while (files.hasNext() && allDocs.length < INDEX_MAX_FILES) {
    var file = files.next();
    var mimeType = file.getMimeType();
    var isReadable = false;
    for (var j = 0; j < READABLE_MIMETYPES.length; j++) {
      if (mimeType === READABLE_MIMETYPES[j]) { isReadable = true; break; }
    }

    var text = "";
    if (isReadable) {
      try {
        var readResult = JSON.parse(readFileContent(file.getId()).getContent());
        if (readResult.success && readResult.text) {
          text = readResult.text;
        }
      } catch (err) {
        text = "[Error reading: " + err.message + "]";
      }
    }

    allDocs.push({
      id: file.getId(),
      name: file.getName(),
      mimeType: mimeType,
      size: file.getSize(),
      url: file.getUrl(),
      category: categoryName,
      dateCreated: file.getDateCreated().toISOString(),
      lastUpdated: file.getLastUpdated().toISOString(),
      text: text,
      readable: isReadable
    });
  }

  if (depth < INDEX_MAX_DEPTH && allDocs.length < INDEX_MAX_FILES) {
    var subFolders = folder.getFolders();
    while (subFolders.hasNext() && allDocs.length < INDEX_MAX_FILES) {
      indexFolder(subFolders.next(), categoryName, allDocs, depth + 1);
    }
  }
}

function getOrCreateRootFolder() {
  var folders = DriveApp.getFoldersByName(ROOT_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(ROOT_FOLDER_NAME);
}

function getOrCreateCategoryFolder(name) {
  var root = getOrCreateRootFolder();
  var folders = root.getFoldersByName(name);
  if (folders.hasNext()) return folders.next();

  for (var i = 0; i < CATEGORY_FOLDERS.length; i++) {
    if (CATEGORY_FOLDERS[i] === name || CATEGORY_FOLDERS[i].substring(0, 2) === name) {
      var f = root.createFolder(CATEGORY_FOLDERS[i]);
      return f;
    }
  }
  return null;
}

function listProjectFiles(projectName) {
  if (!projectName) return jsonResponse({ success: false, error: "Project name is required" });

  var root = getOrCreateRootFolder();
  var projectsFolder = null;
  var folders = root.getFoldersByName("08_Projects");
  if (folders.hasNext()) {
    projectsFolder = folders.next();
  } else {
    return jsonResponse({ success: true, files: [] });
  }

  var subFolders = projectsFolder.getFoldersByName(projectName);
  if (!subFolders.hasNext()) {
    return jsonResponse({ success: true, files: [] });
  }

  var projectFolder = subFolders.next();
  var files = projectFolder.getFiles();
  var results = [];

  while (files.hasNext()) {
    var file = files.next();
    results.push({
      id: file.getId(),
      name: file.getName(),
      mimeType: file.getMimeType(),
      size: file.getSize(),
      url: file.getUrl(),
      dateCreated: file.getDateCreated().toISOString(),
      lastUpdated: file.getLastUpdated().toISOString()
    });
  }

  results.sort(function(a, b) {
    return new Date(b.dateCreated) - new Date(a.dateCreated);
  });

  return jsonResponse({ success: true, files: results, folderName: projectName });
}

function createProjectFolder(projectName) {
  if (!projectName) return jsonResponse({ success: false, error: "Project name is required" });

  var root = getOrCreateRootFolder();
  var projectsFolder = null;
  var folders = root.getFoldersByName("08_Projects");
  if (folders.hasNext()) {
    projectsFolder = folders.next();
  } else {
    projectsFolder = root.createFolder("08_Projects");
  }

  var existing = projectsFolder.getFoldersByName(projectName);
  if (existing.hasNext()) {
    var folder = existing.next();
    return jsonResponse({ success: true, folderId: folder.getId(), folderName: projectName, created: false });
  }

  var newFolder = projectsFolder.createFolder(projectName);
  return jsonResponse({ success: true, folderId: newFolder.getId(), folderName: projectName, created: true });
}

function countFiles(folder) {
  var files = folder.getFiles();
  var count = 0;
  while (files.hasNext()) { files.next(); count++; }
  return count;
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Run this function ONCE manually (Run > _authoriseScopes) to grant
 * the DocumentApp and UrlFetchApp permissions needed for PDF text extraction.
 * After running, create a new deployment for the permissions to take effect.
 */
function _authoriseScopes() {
  var tempDoc = DocumentApp.create("_scope_auth_test_");
  var id = tempDoc.getId();
  tempDoc.saveAndClose();
  DriveApp.getFileById(id).setTrashed(true);
  Logger.log("Scopes authorised successfully. You can now deploy the script.");
}
