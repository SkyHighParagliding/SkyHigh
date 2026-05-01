import { useEffect, useState, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, FolderOpen, Upload, Search, Trash2, FileText, X, File, Image, FileSpreadsheet, Presentation, Film, Music, Archive, ExternalLink, CheckCircle2, AlertTriangle, Pencil, FolderPlus, ChevronRight, Folder, Loader2, Download, Move, Copy, MoreVertical } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { isValidFilename, isExemptCategory, generateCorrectedFilename, renameFile } from "@/lib/filenameValidation";
import { api } from "@/lib/apiClient";

interface Category {
  code: string;
  name: string;
  documentCount: number;
}

interface Document {
  id: string;
  driveFileId: string | null;
  name: string;
  mimeType: string;
  size: number;
  category: string;
  driveFolderId: string | null;
  webViewLink: string | null;
  uploadedBy: string;
  createdAt: string;
}

interface Subfolder {
  name: string;
  id: string;
  fileCount: number;
}

const CATEGORY_COLORS: Record<string, string> = {
  "01": "border-t-blue-600",
  "02": "border-t-emerald-600",
  "03": "border-t-amber-600",
  "04": "border-t-purple-600",
  "05": "border-t-red-600",
  "06": "border-t-cyan-600",
  "07": "border-t-pink-600",
  "08": "border-t-teal-600",
  "09": "border-t-indigo-600",
  "10": "border-t-slate-600",
};

function formatFileSize(bytes: number): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getMimeIcon(mimeType: string) {
  if (!mimeType) return <File className="w-4 h-4 text-foreground-faint" />;
  if (mimeType.startsWith("image/")) return <Image className="w-4 h-4 text-pink-500" />;
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel") || mimeType.includes("csv")) return <FileSpreadsheet className="w-4 h-4 text-emerald-600" />;
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint")) return <Presentation className="w-4 h-4 text-orange-500" />;
  if (mimeType.startsWith("video/")) return <Film className="w-4 h-4 text-purple-500" />;
  if (mimeType.startsWith("audio/")) return <Music className="w-4 h-4 text-sky" />;
  if (mimeType.includes("zip") || mimeType.includes("tar") || mimeType.includes("compressed")) return <Archive className="w-4 h-4 text-amber-600" />;
  if (mimeType.includes("pdf")) return <FileText className="w-4 h-4 text-red-500" />;
  return <File className="w-4 h-4 text-foreground-faint" />;
}

function getShortType(mimeType: string): string {
  if (!mimeType) return "File";
  if (mimeType.includes("pdf")) return "PDF";
  if (mimeType.includes("word") || mimeType.includes("document")) return "Word";
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) return "Excel";
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint")) return "Slides";
  if (mimeType.startsWith("image/")) return mimeType.split("/")[1]?.toUpperCase() || "Image";
  if (mimeType.startsWith("video/")) return "Video";
  if (mimeType.startsWith("audio/")) return "Audio";
  if (mimeType.includes("zip") || mimeType.includes("compressed")) return "Archive";
  if (mimeType.includes("text/")) return "Text";
  return "File";
}

export function AdminDocuments() {
  const { token } = useAuth();
  const [connected, setConnected] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [folderPath, setFolderPath] = useState<string[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [subfolders, setSubfolders] = useState<Subfolder[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [loadingSubfolders, setLoadingSubfolders] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Document[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadCategory, setUploadCategory] = useState<string | null>(null);
  const [uploadSubfolder, setUploadSubfolder] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderError, setNewFolderError] = useState("");
  const [savingFolder, setSavingFolder] = useState(false);
  const [moveCopyModal, setMoveCopyModal] = useState<{ fileId: string; fileName: string; mode: "move" | "copy" } | null>(null);

  const currentPath = folderPath.join("/");
  const selectedSubfolder = folderPath.length > 0 ? currentPath : null;

  const fetchCategories = useCallback(() => {
    api.get<{ connected: boolean; categories: Category[] }>("/api/documents/categories", token)
      .then(data => {
        setConnected(data.connected);
        setCategories(data.categories || []);
      })
      .catch(() => {
        setConnected(false);
        setCategories([]);
      });
  }, [token]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchSubfolders = useCallback((code: string, path?: string) => {
    setLoadingSubfolders(true);
    const pathParam = path ? `?path=${encodeURIComponent(path)}` : "";
    fetch(`/api/documents/category/${code}/subfolders${pathParam}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => {
        if (!res.ok) throw new Error("Failed to load folders");
        return res.json();
      })
      .then(data => { setSubfolders(data); setFetchError(null); })
      .catch((err) => { setSubfolders([]); setFetchError(err.message || "Connection error. Check your internet and try again."); })
      .finally(() => setLoadingSubfolders(false));
  }, [token]);

  const fetchDocuments = useCallback((code: string, subfolder?: string | null) => {
    setLoadingDocs(true);
    const url = subfolder
      ? `/api/documents/category/${code}/subfolder/${encodeURIComponent(subfolder)}`
      : `/api/documents/category/${code}`;
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => {
        if (!res.ok) throw new Error("Failed to load files");
        return res.json();
      })
      .then(data => { setDocuments(data); setFetchError(null); })
      .catch((err) => { setDocuments([]); setFetchError(err.message || "Connection error. Check your internet and try again."); })
      .finally(() => setLoadingDocs(false));
  }, [token]);

  useEffect(() => {
    if (selectedCategory) {
      fetchSubfolders(selectedCategory, currentPath || undefined);
      fetchDocuments(selectedCategory, selectedSubfolder);
    }
  }, [selectedCategory, currentPath, selectedSubfolder, fetchDocuments, fetchSubfolders]);

  const handleCategorySelect = (code: string) => {
    if (selectedCategory === code && folderPath.length === 0) {
      setSelectedCategory(null);
      setFolderPath([]);
      setSubfolders([]);
      setDocuments([]);
    } else {
      setSelectedCategory(code);
      setFolderPath([]);
    }
  };

  const handleSubfolderSelect = (name: string) => {
    setFolderPath(prev => [...prev, name]);
  };

  const handleNavigateToDepth = (depth: number) => {
    if (depth < 0) {
      setFolderPath([]);
    } else {
      setFolderPath(prev => prev.slice(0, depth + 1));
    }
  };

  const handleSearch = useCallback(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    fetch(`/api/documents/search?q=${encodeURIComponent(searchQuery)}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.ok ? res.json() : [])
      .then(setSearchResults)
      .catch(() => setSearchResults([]))
      .finally(() => setSearching(false));
  }, [searchQuery, token]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.trim()) {
        handleSearch();
      } else {
        setSearchResults(null);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/documents/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setDeleteConfirm(null);
        if (selectedCategory) fetchDocuments(selectedCategory, selectedSubfolder);
        if (searchResults) handleSearch();
        fetchCategories();
        if (selectedCategory) fetchSubfolders(selectedCategory, currentPath || undefined);
      }
    } catch {}
  };

  const handleUploadComplete = () => {
    setShowUploadModal(false);
    setUploadCategory(null);
    setUploadSubfolder(null);
    if (selectedCategory) {
      fetchDocuments(selectedCategory, selectedSubfolder);
      fetchSubfolders(selectedCategory, currentPath || undefined);
    }
    fetchCategories();
  };

  const handleDownload = async (fileId: string, fileName: string) => {
    try {
      const res = await fetch(`/api/documents/download/${encodeURIComponent(fileId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {}
  };

  const handleMoveCopyComplete = () => {
    setMoveCopyModal(null);
    if (selectedCategory) {
      fetchDocuments(selectedCategory, selectedSubfolder);
      fetchSubfolders(selectedCategory, currentPath || undefined);
    }
    fetchCategories();
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim() || !selectedCategory) return;
    setSavingFolder(true);
    setNewFolderError("");
    try {
      const res = await fetch(`/api/documents/category/${selectedCategory}/subfolders`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: newFolderName.trim(), parentPath: currentPath || undefined }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create folder");
      }
      setNewFolderName("");
      setCreatingFolder(false);
      fetchSubfolders(selectedCategory, currentPath || undefined);
    } catch (err: any) {
      setNewFolderError(err.message || "Failed to create folder. Check your connection and try again.");
    } finally {
      setSavingFolder(false);
    }
  };

  const selectedCatName = categories.find(c => c.code === selectedCategory)?.name || "";
  const displayCatName = selectedCatName.replace(/^\d+_/, `${selectedCategory} — `);

  return (
    <div className="bg-background min-h-screen py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <Link to="/admin" className="inline-flex items-center text-sky hover:text-navy transition-colors mb-4">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to Dashboard
          </Link>
          <h1 className="text-3xl font-extrabold text-navy mb-2">Document Management</h1>
          <p className="text-muted-foreground">Club filing system aligned with the Procedures Manual folder structure.</p>
        </div>

        <div className={`mb-6 p-4 rounded-lg border ${connected ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${connected ? "bg-emerald-500" : "bg-amber-500"}`} />
            <span className={`text-sm font-medium ${connected ? "text-emerald-700" : "text-amber-700"}`}>
              {connected
                ? "Google Drive Connected"
                : <>Google Drive Not Connected — <Link to="/admin/connections#google-drive" className="underline font-semibold">set up in API Settings</Link> to enable file uploads</>}
            </span>
          </div>
        </div>

        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-faint" />
            <input
              type="text"
              placeholder="Search documents across all categories..."
              className="w-full pl-10 pr-4 py-2.5 border border-border rounded-lg focus:ring-1 focus:ring-sky focus:border-sky"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                onClick={() => { setSearchQuery(""); setSearchResults(null); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground-faint hover:text-foreground-secondary"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {searching && (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-sky mx-auto" />
          </div>
        )}

        {searchResults !== null && !searching && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-navy mb-3">
              Search Results ({searchResults.length})
            </h2>
            {searchResults.length === 0 ? (
              <p className="text-muted-foreground text-sm">No documents found matching "{searchQuery}"</p>
            ) : (
              <DocumentTable
                documents={searchResults}
                deleteConfirm={deleteConfirm}
                setDeleteConfirm={setDeleteConfirm}
                handleDelete={handleDelete}
                categories={categories}
                showCategory
                onMove={(id, name) => setMoveCopyModal({ fileId: id, fileName: name, mode: "move" })}
                onCopy={(id, name) => setMoveCopyModal({ fileId: id, fileName: name, mode: "copy" })}
                onDownload={handleDownload}
                connected={connected}
              />
            )}
          </div>
        )}

        {searchResults === null && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              {categories.map(cat => (
                <button
                  key={cat.code}
                  onClick={() => handleCategorySelect(cat.code)}
                  className="text-left w-full"
                >
                  <Card className={`h-full hover:shadow-lg transition-shadow border-t-4 ${CATEGORY_COLORS[cat.code] || "border-t-gray-400"} ${selectedCategory === cat.code ? "ring-2 ring-sky shadow-lg" : ""}`}>
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center text-navy text-sm">
                        <FolderOpen className="w-5 h-5 mr-2 text-sky flex-shrink-0" />
                        <span className="truncate">{cat.name.replace(/^\d+_/, `${cat.code} — `)}</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <span className="text-2xl font-bold text-navy">{cat.documentCount}</span>
                        <span className="text-xs text-muted-foreground">{cat.documentCount === 1 ? "document" : "documents"}</span>
                      </div>
                    </CardContent>
                  </Card>
                </button>
              ))}
            </div>

            {selectedCategory && (
              <div className="mb-8">
                {/* Breadcrumb */}
                <div className="flex items-center gap-1 text-sm text-muted-foreground mb-3 flex-wrap">
                  <button
                    onClick={() => { setSelectedCategory(null); setFolderPath([]); }}
                    className="text-sky hover:text-navy transition-colors"
                  >
                    Documents
                  </button>
                  <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />
                  {folderPath.length > 0 ? (
                    <>
                      <button
                        onClick={() => handleNavigateToDepth(-1)}
                        className="text-sky hover:text-navy transition-colors"
                      >
                        {displayCatName}
                      </button>
                      {folderPath.map((segment, i) => (
                        <span key={i} className="flex items-center gap-1">
                          <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />
                          {i < folderPath.length - 1 ? (
                            <button
                              onClick={() => handleNavigateToDepth(i)}
                              className="text-sky hover:text-navy transition-colors"
                            >
                              {segment}
                            </button>
                          ) : (
                            <span className="text-navy font-medium">{segment}</span>
                          )}
                        </span>
                      ))}
                    </>
                  ) : (
                    <span className="text-navy font-medium">{displayCatName}</span>
                  )}
                </div>

                <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
                  <h2 className="text-lg font-semibold text-navy">
                    {folderPath.length > 0 ? folderPath[folderPath.length - 1] : displayCatName}
                  </h2>
                  <div className="flex items-center gap-2 flex-wrap">
                    {connected && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => { setCreatingFolder(true); setNewFolderName(""); setNewFolderError(""); }}
                        className="flex items-center gap-1.5"
                      >
                        <FolderPlus className="w-4 h-4" />
                        <span className="hidden sm:inline">New Folder</span>
                      </Button>
                    )}
                    <Button
                      onClick={() => {
                        setUploadCategory(selectedCategory);
                        setUploadSubfolder(selectedSubfolder);
                        setShowUploadModal(true);
                      }}
                      className="flex items-center gap-2"
                      size="sm"
                    >
                      <Upload className="w-4 h-4" />
                      Upload
                    </Button>
                  </div>
                </div>

                {fetchError && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                      <span>{fetchError}</span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs flex-shrink-0"
                      onClick={() => {
                        setFetchError(null);
                        if (selectedCategory) {
                          fetchSubfolders(selectedCategory);
                          fetchDocuments(selectedCategory, selectedSubfolder);
                        }
                      }}
                    >
                      Retry
                    </Button>
                  </div>
                )}

                {/* Create folder inline form */}
                {creatingFolder && (
                  <Card className="mb-4">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3 flex-col sm:flex-row">
                        <div className="flex-1 w-full">
                          <label className="text-xs font-medium text-foreground-secondary mb-1 block">Folder name</label>
                          <input
                            type="text"
                            value={newFolderName}
                            onChange={(e) => setNewFolderName(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") handleCreateFolder(); }}
                            placeholder="e.g. Flinders Golf Club"
                            className="w-full p-2.5 border border-border rounded-md text-sm focus:ring-1 focus:ring-sky focus:border-sky"
                            autoFocus
                          />
                          {newFolderError && (
                            <p className="text-xs text-red-600 mt-1">{newFolderError}</p>
                          )}
                        </div>
                        <div className="flex gap-2 sm:mt-5">
                          <Button size="sm" onClick={handleCreateFolder} disabled={!newFolderName.trim() || savingFolder}>
                            {savingFolder ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create"}
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => setCreatingFolder(false)} disabled={savingFolder}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Subfolders grid */}
                {loadingSubfolders ? (
                  <div className="text-center py-4">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-sky mx-auto" />
                  </div>
                ) : subfolders.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 mb-5">
                    {subfolders.map(sf => (
                      <button
                        key={sf.id}
                        onClick={() => handleSubfolderSelect(sf.name)}
                        className="text-left group"
                      >
                        <Card className="hover:shadow-md transition-shadow hover:border-sky/50">
                          <CardContent className="p-3 flex items-center gap-2.5">
                            <Folder className="w-8 h-8 text-amber-500 flex-shrink-0 group-hover:text-amber-600 transition-colors" />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-navy truncate">{sf.name}</p>
                              <p className="text-xs text-muted-foreground">{sf.fileCount} {sf.fileCount === 1 ? "file" : "files"}</p>
                            </div>
                          </CardContent>
                        </Card>
                      </button>
                    ))}
                  </div>
                )}

                {/* Files list */}
                {loadingDocs ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-sky mx-auto" />
                  </div>
                ) : documents.length === 0 ? (
                  <Card>
                    <CardContent className="py-8 text-center text-muted-foreground">
                      {subfolders.length > 0
                        ? "No loose files here. Files are inside the folders above."
                        : "No documents here yet."}
                    </CardContent>
                  </Card>
                ) : (
                  <>
                    {subfolders.length > 0 && documents.length > 0 && (
                      <p className="text-xs text-muted-foreground mb-2">Files not in a subfolder:</p>
                    )}
                    <DocumentTable
                      documents={documents}
                      deleteConfirm={deleteConfirm}
                      setDeleteConfirm={setDeleteConfirm}
                      handleDelete={handleDelete}
                      categories={categories}
                      onMove={(id, name) => setMoveCopyModal({ fileId: id, fileName: name, mode: "move" })}
                      onCopy={(id, name) => setMoveCopyModal({ fileId: id, fileName: name, mode: "copy" })}
                      onDownload={handleDownload}
                      connected={connected}
                    />
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {showUploadModal && uploadCategory && (
        <UploadModal
          category={uploadCategory}
          categoryName={categories.find(c => c.code === uploadCategory)?.name || ""}
          connected={connected}
          token={token}
          onClose={() => { setShowUploadModal(false); setUploadCategory(null); setUploadSubfolder(null); }}
          onComplete={handleUploadComplete}
          initialSubfolder={uploadSubfolder}
          categoryCode={uploadCategory}
        />
      )}

      {moveCopyModal && (
        <MoveCopyModal
          fileId={moveCopyModal.fileId}
          fileName={moveCopyModal.fileName}
          mode={moveCopyModal.mode}
          categories={categories}
          token={token}
          onClose={() => setMoveCopyModal(null)}
          onComplete={handleMoveCopyComplete}
        />
      )}
    </div>
  );
}

function DocumentTable({
  documents,
  deleteConfirm,
  setDeleteConfirm,
  handleDelete,
  categories,
  showCategory = false,
  onMove,
  onCopy,
  onDownload,
  connected = false,
}: {
  documents: Document[];
  deleteConfirm: string | null;
  setDeleteConfirm: (id: string | null) => void;
  handleDelete: (id: string) => void;
  categories: Category[];
  showCategory?: boolean;
  onMove?: (id: string, name: string) => void;
  onCopy?: (id: string, name: string) => void;
  onDownload?: (id: string, name: string) => void;
  connected?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          {/* Desktop table */}
          <table className="w-full text-left border-collapse hidden sm:table">
            <thead>
              <tr className="bg-muted border-b border-border-subtle">
                <th className="p-3 font-semibold text-navy text-sm">Name</th>
                {showCategory && <th className="p-3 font-semibold text-navy text-sm">Category</th>}
                <th className="p-3 font-semibold text-navy text-sm">Type</th>
                <th className="p-3 font-semibold text-navy text-sm text-right">Size</th>
                <th className="p-3 font-semibold text-navy text-sm text-right">Date</th>
                <th className="p-3 font-semibold text-navy text-sm text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {documents.map(doc => (
                <tr key={doc.id} className="border-b border-border-faint hover:bg-background">
                  <td className="p-3 text-sm">
                    <div className="flex items-center gap-2">
                      {getMimeIcon(doc.mimeType)}
                      {doc.webViewLink ? (
                        <a
                          href={doc.webViewLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sky hover:text-navy font-medium flex items-center gap-1"
                        >
                          {doc.name}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="font-medium text-navy">{doc.name}</span>
                      )}
                    </div>
                  </td>
                  {showCategory && (
                    <td className="p-3 text-sm text-muted-foreground">
                      {categories.find(c => c.code === doc.category)?.name.replace(/^\d+_/, `${doc.category} — `) || doc.category}
                    </td>
                  )}
                  <td className="p-3 text-sm text-muted-foreground">{getShortType(doc.mimeType)}</td>
                  <td className="p-3 text-sm text-muted-foreground text-right">{formatFileSize(doc.size)}</td>
                  <td className="p-3 text-sm text-muted-foreground text-right">
                    {new Date(doc.createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                  </td>
                  <td className="p-3 text-right">
                    <FileActions
                      doc={doc}
                      deleteConfirm={deleteConfirm}
                      setDeleteConfirm={setDeleteConfirm}
                      handleDelete={handleDelete}
                      onMove={onMove}
                      onCopy={onCopy}
                      onDownload={onDownload}
                      connected={connected}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Mobile card list */}
          <div className="sm:hidden divide-y divide-border-faint">
            {documents.map(doc => (
              <div key={doc.id} className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0 flex-1">
                    {getMimeIcon(doc.mimeType)}
                    <div className="min-w-0 flex-1">
                      {doc.webViewLink ? (
                        <a
                          href={doc.webViewLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sky hover:text-navy font-medium text-sm flex items-center gap-1"
                        >
                          <span className="truncate">{doc.name}</span>
                          <ExternalLink className="w-3 h-3 flex-shrink-0" />
                        </a>
                      ) : (
                        <span className="font-medium text-navy text-sm truncate block">{doc.name}</span>
                      )}
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <span>{getShortType(doc.mimeType)}</span>
                        <span>{formatFileSize(doc.size)}</span>
                        <span>{new Date(doc.createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}</span>
                      </div>
                    </div>
                  </div>
                  <FileActions
                    doc={doc}
                    deleteConfirm={deleteConfirm}
                    setDeleteConfirm={setDeleteConfirm}
                    handleDelete={handleDelete}
                    onMove={onMove}
                    onCopy={onCopy}
                    onDownload={onDownload}
                    connected={connected}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FileActions({
  doc,
  deleteConfirm,
  setDeleteConfirm,
  handleDelete,
  onMove,
  onCopy,
  onDownload,
  connected,
}: {
  doc: Document;
  deleteConfirm: string | null;
  setDeleteConfirm: (id: string | null) => void;
  handleDelete: (id: string) => void;
  onMove?: (id: string, name: string) => void;
  onCopy?: (id: string, name: string) => void;
  onDownload?: (id: string, name: string) => void;
  connected?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    const escHandler = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", escHandler);
    return () => { document.removeEventListener("mousedown", handler); document.removeEventListener("keydown", escHandler); };
  }, [open]);

  if (deleteConfirm === doc.id) {
    return (
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span className="text-xs text-red-600">Delete?</span>
        <button onClick={() => handleDelete(doc.id)} className="text-xs text-white bg-red-500 hover:bg-red-600 px-2 py-1 rounded">Yes</button>
        <button onClick={() => setDeleteConfirm(null)} className="text-xs text-muted-foreground hover:text-foreground-label px-2 py-1 rounded border">No</button>
      </div>
    );
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className="text-foreground-faint hover:text-navy transition-colors flex-shrink-0 p-1 rounded hover:bg-muted"
        title="File actions"
      >
        <MoreVertical className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-border z-50 py-1 min-w-[160px]">
          {connected && onDownload && (
            <button
              onClick={() => { onDownload(doc.id, doc.name); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-sm text-foreground-label hover:bg-muted flex items-center gap-2"
            >
              <Download className="w-3.5 h-3.5" /> Download
            </button>
          )}
          {connected && onMove && (
            <button
              onClick={() => { onMove(doc.id, doc.name); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-sm text-foreground-label hover:bg-muted flex items-center gap-2"
            >
              <Move className="w-3.5 h-3.5" /> Move to…
            </button>
          )}
          {connected && onCopy && (
            <button
              onClick={() => { onCopy(doc.id, doc.name); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-sm text-foreground-label hover:bg-muted flex items-center gap-2"
            >
              <Copy className="w-3.5 h-3.5" /> Copy to…
            </button>
          )}
          <div className="border-t border-border-faint my-1" />
          <button
            onClick={() => { setDeleteConfirm(doc.id); setOpen(false); }}
            className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
        </div>
      )}
    </div>
  );
}

function MoveCopyModal({
  fileId,
  fileName,
  mode,
  categories,
  token,
  onClose,
  onComplete,
}: {
  fileId: string;
  fileName: string;
  mode: "move" | "copy";
  categories: Category[];
  token: string;
  onClose: () => void;
  onComplete: () => void;
}) {
  const [destCategory, setDestCategory] = useState<string | null>(null);
  const [destPath, setDestPath] = useState<string[]>([]);
  const [subfolders, setSubfolders] = useState<Subfolder[]>([]);
  const [loadingSubs, setLoadingSubs] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const destPathStr = destPath.join("/");

  useEffect(() => {
    if (!destCategory) { setSubfolders([]); return; }
    setLoadingSubs(true);
    const pathParam = destPathStr ? `?path=${encodeURIComponent(destPathStr)}` : "";
    fetch(`/api/documents/category/${destCategory}/subfolders${pathParam}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.ok ? res.json() : [])
      .then(setSubfolders)
      .catch(() => setSubfolders([]))
      .finally(() => setLoadingSubs(false));
  }, [destCategory, destPathStr, token]);

  const handleSelectCategory = (code: string) => {
    setDestCategory(code);
    setDestPath([]);
  };

  const handleEnterFolder = (name: string) => {
    setDestPath(prev => [...prev, name]);
  };

  const handleNavigateUp = (depth: number) => {
    if (depth < 0) {
      setDestPath([]);
    } else {
      setDestPath(prev => prev.slice(0, depth + 1));
    }
  };

  const handleSubmit = async () => {
    if (!destCategory) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/documents/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ fileId, destCategory, destSubfolder: destPathStr || undefined }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `${mode === "move" ? "Move" : "Copy"} failed`);
      }
      setSuccess(true);
      setTimeout(() => onComplete(), 1200);
    } catch (err: any) {
      setError(err.message || `Failed to ${mode} file`);
    } finally {
      setSaving(false);
    }
  };

  const actionLabel = mode === "move" ? "Move" : "Copy";
  const destCatName = categories.find(c => c.code === destCategory)?.name.replace(/^\d+_/, `${destCategory} — `) || "";

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-navy flex items-center gap-2">
              {mode === "move" ? <Move className="w-5 h-5 text-sky" /> : <Copy className="w-5 h-5 text-sky" />}
              {actionLabel} File
            </h3>
            <button onClick={onClose} className="text-foreground-faint hover:text-navy">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="mb-4 p-3 bg-muted rounded-lg">
            <p className="text-sm text-muted-foreground">File</p>
            <p className="text-sm font-medium text-navy truncate">{fileName}</p>
          </div>

          {success ? (
            <div className="flex items-center gap-2 text-emerald-600 p-4">
              <CheckCircle2 className="w-5 h-5" />
              <span className="text-sm font-medium">File {mode === "move" ? "moved" : "copied"} successfully!</span>
            </div>
          ) : (
            <>
              {!destCategory ? (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-navy mb-2">Pick a category</label>
                  <div className="grid grid-cols-1 gap-1.5 max-h-56 overflow-auto border border-border rounded-lg p-2">
                    {categories.map(cat => (
                      <button
                        key={cat.code}
                        onClick={() => handleSelectCategory(cat.code)}
                        className="text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 hover:bg-muted text-foreground-label"
                      >
                        <FolderOpen className="w-4 h-4 flex-shrink-0 text-amber-500" />
                        <span className="truncate">{cat.name.replace(/^\d+_/, `${cat.code} — `)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  <div className="mb-3">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap mb-2">
                      <button onClick={() => { setDestCategory(null); setDestPath([]); }} className="text-sky hover:text-navy">All Categories</button>
                      <ChevronRight className="w-3 h-3" />
                      {destPath.length > 0 ? (
                        <>
                          <button onClick={() => handleNavigateUp(-1)} className="text-sky hover:text-navy">{destCatName}</button>
                          {destPath.map((seg, i) => (
                            <span key={i} className="flex items-center gap-1">
                              <ChevronRight className="w-3 h-3" />
                              {i < destPath.length - 1 ? (
                                <button onClick={() => handleNavigateUp(i)} className="text-sky hover:text-navy">{seg}</button>
                              ) : (
                                <span className="font-medium text-navy">{seg}</span>
                              )}
                            </span>
                          ))}
                        </>
                      ) : (
                        <span className="font-medium text-navy">{destCatName}</span>
                      )}
                    </div>
                  </div>

                  {loadingSubs ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground p-2 mb-3">
                      <Loader2 className="w-4 h-4 animate-spin" /> Loading folders…
                    </div>
                  ) : subfolders.length > 0 ? (
                    <div className="border border-border rounded-lg p-2 mb-3 max-h-40 overflow-auto">
                      {subfolders.map(sf => (
                        <button
                          key={sf.id}
                          onClick={() => handleEnterFolder(sf.name)}
                          className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-muted flex items-center gap-2 text-foreground-label"
                        >
                          <Folder className="w-4 h-4 text-amber-500 flex-shrink-0" />
                          <span className="truncate flex-1">{sf.name}</span>
                          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground mb-3">No subfolders here.</p>
                  )}
                </>
              )}

              {error && (
                <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {error}
                </div>
              )}

              <div className="flex gap-3">
                <Button variant="outline" onClick={onClose} className="flex-1" disabled={saving}>Cancel</Button>
                <Button
                  onClick={handleSubmit}
                  disabled={!destCategory || saving}
                  className="flex-1 bg-sky hover:bg-sky/90 text-white"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  {saving ? `${actionLabel === "Move" ? "Moving" : "Copying"}…` : `${actionLabel} Here`}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function UploadModal({
  category,
  categoryName,
  connected,
  token,
  onClose,
  onComplete,
  initialSubfolder,
  categoryCode,
}: {
  category: string;
  categoryName: string;
  connected: boolean;
  token: string | null;
  onClose: () => void;
  onComplete: () => void;
  initialSubfolder: string | null;
  categoryCode: string;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [correctedName, setCorrectedName] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [editName, setEditName] = useState("");
  const [nameApproved, setNameApproved] = useState(false);
  const [photoDescription, setPhotoDescription] = useState("");
  const [subfolder, setSubfolder] = useState<string>(initialSubfolder || "");
  const [availableSubfolders, setAvailableSubfolders] = useState<string[]>([]);
  const [loadingSubs, setLoadingSubs] = useState(true);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newSubfolderName, setNewSubfolderName] = useState("");
  const [creatingSub, setCreatingSub] = useState(false);
  const [siteNames, setSiteNames] = useState<string[]>([]);

  const isPhotoCategory = category === "07";
  const today = new Date().toISOString().split("T")[0].replace(/-/g, "-");
  const exempt = isExemptCategory(category);
  const filenameValid = selectedFile ? isValidFilename(selectedFile.name) : false;

  useEffect(() => {
    fetch(`/api/documents/category/${categoryCode}/subfolders`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.ok ? res.json() : [])
      .then((subs: Subfolder[]) => setAvailableSubfolders(subs.map(s => s.name)))
      .catch(() => setAvailableSubfolders([]))
      .finally(() => setLoadingSubs(false));

    if (isPhotoCategory) {
      api.get<string[]>("/api/documents/sites/names", token)
        .then(setSiteNames)
        .catch(() => setSiteNames([]));
    }
  }, [categoryCode, token, isPhotoCategory]);

  const onFileSelected = (file: File) => {
    setSelectedFile(file);
    setNameApproved(false);
    setEditingName(false);
    setEditName("");
    setPhotoDescription("");
    if (!exempt && !isPhotoCategory && !isValidFilename(file.name)) {
      setCorrectedName(generateCorrectedFilename(file.name));
    } else {
      setCorrectedName("");
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) onFileSelected(file);
  };

  const sanitizeDescription = (desc: string): string => {
    return desc.trim().replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_-]/g, "");
  };

  const buildPhotoFilename = (file: File, description: string): string => {
    const ext = file.name.includes(".") ? file.name.substring(file.name.lastIndexOf(".")) : "";
    const sanitized = sanitizeDescription(description);
    return `${today}_${sanitized || "Photo"}${ext}`;
  };

  const isPhotoDescriptionValid = !isPhotoCategory || (photoDescription.trim().length > 0 && sanitizeDescription(photoDescription).length >= 2);

  const handleCreateSubfolder = async () => {
    if (!newSubfolderName.trim()) return;
    setCreatingSub(true);
    try {
      const res = await fetch(`/api/documents/category/${categoryCode}/subfolders`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: newSubfolderName.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed");
      }
      const created = newSubfolderName.trim();
      setSubfolder(created);
      const refreshRes = await fetch(`/api/documents/category/${categoryCode}/subfolders`, { headers: { Authorization: `Bearer ${token}` } });
      if (refreshRes.ok) {
        const subs: Subfolder[] = await refreshRes.json();
        setAvailableSubfolders(subs.map(s => s.name));
      } else {
        setAvailableSubfolders(prev => prev.includes(created) ? prev : [...prev, created].sort());
      }
      setNewSubfolderName("");
      setShowNewFolder(false);
    } catch (err: any) {
      setError(err.message || "Failed to create folder. Check your connection.");
    } finally {
      setCreatingSub(false);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !token) return;
    if (!isPhotoDescriptionValid) return;
    setUploading(true);
    setError(null);
    try {
      let fileToUpload = selectedFile;
      if (isPhotoCategory && photoDescription.trim()) {
        const newName = buildPhotoFilename(selectedFile, photoDescription);
        fileToUpload = renameFile(selectedFile, newName);
      } else if (!exempt && !filenameValid && nameApproved && correctedName) {
        fileToUpload = renameFile(selectedFile, correctedName);
      }
      const formData = new FormData();
      formData.append("file", fileToUpload);
      formData.append("category", category);
      if (subfolder) formData.append("subfolder", subfolder);
      const res = await fetch("/api/documents/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Upload failed");
      }
      onComplete();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const canUpload = selectedFile && (exempt || filenameValid || nameApproved);

  const suggestionsForFolder = isPhotoCategory
    ? siteNames.filter(s => !availableSubfolders.includes(s))
    : [];

  return (
    <div className="fixed inset-0 z-[10001] flex items-end sm:items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-card rounded-t-xl sm:rounded-lg shadow-xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-card z-10 rounded-t-xl sm:rounded-t-lg">
          <h3 className="text-lg font-semibold text-navy">
            Upload to {categoryName.replace(/^\d+_/, `${category} — `)}
          </h3>
          <button onClick={onClose} className="text-foreground-faint hover:text-foreground-secondary p-1">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4">
          {!connected ? (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-center">
              <p className="text-amber-700 font-medium">Google Drive Not Connected</p>
              <p className="text-amber-600 text-sm mt-1">Connect Google Drive in admin settings to enable file uploads.</p>
            </div>
          ) : (
            <>
              {/* Subfolder picker */}
              <div className="mb-4">
                <label className="text-xs font-medium text-foreground-secondary mb-1 block">
                  Upload to folder <span className="text-muted-foreground font-normal">(optional)</span>
                </label>
                {loadingSubs ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading folders...
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <select
                        value={subfolder}
                        onChange={(e) => {
                          if (e.target.value === "__new__") {
                            setShowNewFolder(true);
                          } else {
                            setSubfolder(e.target.value);
                            setShowNewFolder(false);
                          }
                        }}
                        className="flex-1 p-2.5 border border-border rounded-md text-sm focus:ring-1 focus:ring-sky focus:border-sky bg-card"
                      >
                        <option value="">Root of category (no subfolder)</option>
                        {availableSubfolders.map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                        <option value="__new__">+ Create new folder...</option>
                      </select>
                    </div>
                    {showNewFolder && (
                      <div className="mt-2 p-3 border border-border rounded-lg bg-muted/30">
                        <div className="flex items-end gap-2">
                          <div className="flex-1">
                            <input
                              type="text"
                              value={newSubfolderName}
                              onChange={(e) => setNewSubfolderName(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") handleCreateSubfolder(); }}
                              placeholder="New folder name"
                              className="w-full p-2 border border-border rounded-md text-sm focus:ring-1 focus:ring-sky focus:border-sky"
                              autoFocus
                              list={isPhotoCategory ? "site-suggestions" : undefined}
                            />
                            {isPhotoCategory && suggestionsForFolder.length > 0 && (
                              <datalist id="site-suggestions">
                                {suggestionsForFolder.map(s => (
                                  <option key={s} value={s} />
                                ))}
                              </datalist>
                            )}
                          </div>
                          <Button
                            size="sm"
                            onClick={handleCreateSubfolder}
                            disabled={!newSubfolderName.trim() || creatingSub}
                          >
                            {creatingSub ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create"}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => { setShowNewFolder(false); setSubfolder(""); }}
                          >
                            Cancel
                          </Button>
                        </div>
                        {isPhotoCategory && suggestionsForFolder.length > 0 && (
                          <p className="text-[10px] text-muted-foreground mt-1.5">Start typing — site names will be suggested</p>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>

              {subfolder && (
                <div className="mb-3 flex items-center gap-1.5 text-xs text-foreground-secondary bg-sky/5 border border-sky/20 rounded-md px-2.5 py-1.5">
                  <Folder className="w-3.5 h-3.5 text-amber-500" />
                  Uploading to: <span className="font-medium text-navy">{subfolder}</span>
                </div>
              )}

              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                  dragOver ? "border-sky bg-sky/5" : "border-border"
                }`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
              >
                {selectedFile ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-center gap-2">
                      {getMimeIcon(selectedFile.type)}
                      <span className="font-medium text-navy text-sm break-all">{selectedFile.name}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{formatFileSize(selectedFile.size)}</p>
                    <button
                      onClick={() => { setSelectedFile(null); setCorrectedName(""); setNameApproved(false); setEditingName(false); }}
                      className="text-xs text-sky hover:text-navy"
                    >
                      Choose different file
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <Upload className="w-8 h-8 text-foreground-faint mx-auto" />
                    <p className="text-foreground-secondary text-sm">Drag and drop a file here, or</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Choose File
                    </Button>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onFileSelected(file);
                  }}
                />
              </div>

              {isPhotoCategory && selectedFile && (
                <div className="mt-3 space-y-1">
                  <label className="text-xs font-medium text-foreground-secondary">
                    Photo Description <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={photoDescription}
                    onChange={(e) => setPhotoDescription(e.target.value)}
                    placeholder="e.g. Mystic Launch, John D, Club BBQ"
                    className="w-full p-2 border border-border rounded-md text-sm focus:ring-1 focus:ring-sky focus:border-sky"
                  />
                  <p className="text-[10px] text-foreground-faint">
                    Filename will be: <span className="font-mono text-foreground-secondary">{photoDescription.trim() ? buildPhotoFilename(selectedFile, photoDescription) : `${today}_Your_Description.ext`}</span>
                  </p>
                </div>
              )}

              {selectedFile && !isPhotoCategory && exempt && (
                <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700 flex items-start gap-2">
                  <FileText className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>This category contains legal/regulatory documents — standard naming rules do not apply. The original filename will be kept.</span>
                </div>
              )}

              {selectedFile && !isPhotoCategory && !exempt && filenameValid && (
                <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <span>Name OK — follows the YYYY-MM-DD_Name convention</span>
                </div>
              )}

              {selectedFile && !isPhotoCategory && !exempt && !filenameValid && !nameApproved && (
                <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm space-y-3">
                  <div className="flex items-start gap-2 text-amber-700">
                    <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span>Filename doesn't follow the YYYY-MM-DD_Name convention</span>
                  </div>
                  <div className="text-xs space-y-1">
                    <p className="text-amber-600">Original: <span className="font-mono break-all">{selectedFile.name}</span></p>
                    <p className="text-amber-800 font-medium">
                      Suggested: {editingName ? (
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && editName.trim()) {
                              const sanitized = isValidFilename(editName.trim()) ? editName.trim() : generateCorrectedFilename(editName.trim());
                              setCorrectedName(sanitized);
                              setEditingName(false);
                            }
                          }}
                          className="inline-block font-mono px-1.5 py-0.5 border border-amber-300 rounded text-sm bg-card w-full mt-1"
                          autoFocus
                        />
                      ) : (
                        <span className="font-mono break-all">{correctedName}</span>
                      )}
                    </p>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => { setNameApproved(true); }}
                    >
                      Use suggested name
                    </Button>
                    {!editingName ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs h-7"
                        onClick={() => { setEditName(correctedName); setEditingName(true); }}
                      >
                        <Pencil className="w-3 h-3 mr-1" />
                        Edit
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs h-7"
                        onClick={() => {
                          if (editName.trim()) {
                            const sanitized = isValidFilename(editName.trim()) ? editName.trim() : generateCorrectedFilename(editName.trim());
                            setCorrectedName(sanitized);
                          }
                          setEditingName(false);
                        }}
                      >
                        Confirm edit
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => { setCorrectedName(""); setNameApproved(true); }}
                    >
                      Keep original
                    </Button>
                  </div>
                </div>
              )}

              {selectedFile && !isPhotoCategory && !exempt && !filenameValid && nameApproved && correctedName && (
                <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <span>Will upload as: <span className="font-mono font-medium break-all">{correctedName}</span></span>
                </div>
              )}

              {!selectedFile && !isPhotoCategory && !exempt && (
                <p className="text-xs text-muted-foreground mt-3">
                  Files should follow the naming convention: <span className="font-mono text-foreground-secondary">YYYY-MM-DD_Document_Name</span>
                </p>
              )}

              {error && (
                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {error}
                </div>
              )}
            </>
          )}
        </div>
        {connected && (
          <div className="flex justify-end gap-3 p-4 border-t sticky bottom-0 bg-card">
            <Button variant="outline" onClick={onClose} disabled={uploading}>
              Cancel
            </Button>
            <Button onClick={handleUpload} disabled={uploading || (isPhotoCategory ? (!selectedFile || !isPhotoDescriptionValid) : (!canUpload))}>

              {uploading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Uploading...
                </span>
              ) : "Upload"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
