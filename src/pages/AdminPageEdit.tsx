import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Save, Check, Paperclip, Upload, Trash2, Download, X, ChevronUp, ChevronDown } from "lucide-react";
import { ContentImageToolbar } from "@/components/ContentImageToolbar";
import { GoogleDocsPaste } from "@/components/GoogleDocsPaste";
import { HeroImagePicker } from "@/components/HeroImagePicker";
import { MarkdownHelpLink } from "@/components/MarkdownHelpLink";
import { useAdminForm } from "@/hooks/useAdminForm";
import { UnsavedChangesModal } from "@/components/UnsavedChangesModal";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";
import { insertMarkdownAtCursor } from "@/hooks/useMarkdownInsert";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface Attachment {
  id: string;
  pageSlug: string;
  originalFilename: string;
  fileSize: number;
  mimeType: string;
  downloadCount: number;
  uploadedAt?: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AdminPageEdit() {
  const { token } = useAuth();
  const { slug } = useParams();
  const navigate = useNavigate();
  const isNew = !slug;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { isDirty, markDirty, blocker, justSaved, save } = useAdminForm({ successMessage: "Page saved" });

  const [formData, setFormData] = useState({
    title: "",
    slug: "",
    content: "",
    heroImage: "",
  });

  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [flyoutOpen, setFlyoutOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [deleteAttId, setDeleteAttId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const qc = useQueryClient();

  const { data: existingPage } = useQuery({
    queryKey: ['pages', slug],
    queryFn: () => api.get<Record<string, any>>(`/api/pages/${slug}`),
    enabled: !isNew && !!slug,
  });

  const { data: fetchedAttachments } = useQuery({
    queryKey: ['pages', slug, 'attachments'],
    queryFn: () => api.get<Attachment[]>(`/api/pages/${slug}/attachments`),
    enabled: !isNew && !!slug,
  });

  useEffect(() => {
    if (existingPage) {
      setFormData({
        title: existingPage.title || "",
        slug: existingPage.slug || "",
        content: existingPage.content || "",
        heroImage: existingPage.heroImage || "",
      });
    }
  }, [existingPage]);

  useEffect(() => {
    if (fetchedAttachments) {
      setAttachments(fetchedAttachments);
    }
  }, [fetchedAttachments]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    markDirty();
  };

  const handleInsertMarkdown = (markdown: string) => {
    const newContent = insertMarkdownAtCursor(textareaRef, formData.content, markdown);
    setFormData(prev => ({ ...prev, content: newContent }));
    markDirty();
  };

  const savePage = useCallback(() => save(async () => {
    const payload = {
      ...formData,
      slug: isNew ? formData.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') : slug,
    };

    const url = isNew ? '/api/pages' : `/api/pages/${slug}`;
    const method = isNew ? 'POST' : 'PUT';

    if (method === 'POST') {
      await api.post(url, payload, token);
    } else {
      await api.put(url, payload, token);
    }
  }), [formData, isNew, slug, save]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await savePage();
      setTimeout(() => navigate("/admin/pages"), 1200);
    } catch {}
  };

  const uploadFile = async (file: File) => {
    const pageSlug = isNew ? formData.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') : slug;
    if (!pageSlug) return;

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/pages/${pageSlug}/attachments`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!res.ok) throw new Error("Upload failed");
      const att = await res.json();
      setAttachments(prev => [...prev, att]);
    } catch {
      toast.error("Failed to upload file");
    } finally {
      setUploading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      Array.from(files).forEach(uploadFile);
    }
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer.files;
    if (files) {
      Array.from(files).forEach(uploadFile);
    }
  };

  const confirmDeleteAttachment = async () => {
    if (!deleteAttId) return;
    const pageSlug = slug;
    try {
      await api.delete(`/api/pages/${pageSlug}/attachments/${deleteAttId}`, token);
      setAttachments(prev => prev.filter(a => a.id !== deleteAttId));
      setDeleteAttId(null);
    } catch {
      toast.error("Failed to delete attachment");
    }
  };

  return (
    <div className="bg-background min-h-screen py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex gap-4 mb-6">
          <Link to="/admin/pages" className="inline-flex items-center text-sky hover:text-sky-light font-medium">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Pages
          </Link>
          <span className="text-foreground-ghost">|</span>
          <Link to="/admin" className="inline-flex items-center text-muted-foreground hover:text-navy font-medium">
            Admin Dashboard
          </Link>
        </div>

        <Card className="shadow-lg border-t-4 border-t-navy">
          <CardHeader className="bg-card border-b pb-6">
            <CardTitle className="text-2xl text-navy">
              {isNew ? "Create New Page" : `Edit Page: ${formData.title}`}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-8">
              <div className="flex justify-end">
                <Button
                  type="submit"
                  className={`px-8 transition-all duration-300 ${justSaved ? "bg-emerald-500 hover:bg-emerald-600 scale-105" : "bg-navy hover:bg-navy-light"} text-white`}
                >
                  {justSaved ? <><Check className="w-4 h-4 mr-2" /> Saved!</> : <><Save className="w-4 h-4 mr-2" /> Save Page</>}
                </Button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground-label mb-1">Page Title</label>
                  <input
                    type="text"
                    name="title"
                    value={formData.title}
                    onChange={handleChange}
                    className="w-full p-2 border border-border rounded-md focus:ring-sky focus:border-sky"
                    required
                  />
                </div>
                
                {isNew && (
                  <div>
                    <label className="block text-sm font-medium text-foreground-label mb-1">Page Address (auto-generated if left blank)</label>
                    <input
                      type="text"
                      name="slug"
                      value={formData.slug}
                      onChange={handleChange}
                      placeholder="e.g. about-us"
                      className="w-full p-2 border border-border rounded-md focus:ring-sky focus:border-sky"
                    />
                  </div>
                )}

                <HeroImagePicker
                  value={formData.heroImage}
                  onChange={(url) => { setFormData(prev => ({ ...prev, heroImage: url })); markDirty(); }}
                />

                <div>
                  <label className="block text-sm font-medium text-foreground-label mb-1">Content (Markdown supported)</label>
                  <div className="flex items-center gap-2 mb-1">
                    <ContentImageToolbar onInsertMarkdown={handleInsertMarkdown} />
                    <GoogleDocsPaste onInsert={handleInsertMarkdown} />
                  </div>
                  <textarea
                    ref={textareaRef}
                    name="content"
                    value={formData.content}
                    onChange={handleChange}
                    rows={15}
                    className="w-full p-2 border border-border rounded-md focus:ring-sky focus:border-sky font-mono text-sm"
                    required
                  />
                  <div className="flex items-center gap-3 mt-1">
                    <MarkdownHelpLink />
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-6 border-t">
                <Button
                  type="submit"
                  className={`px-8 transition-all duration-300 ${justSaved ? "bg-emerald-500 hover:bg-emerald-600 scale-105" : "bg-navy hover:bg-navy-light"} text-white`}
                >
                  {justSaved ? <><Check className="w-4 h-4 mr-2" /> Saved!</> : <><Save className="w-4 h-4 mr-2" /> Save Page</>}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {!isNew && (
          <div className="mt-6">
            <button
              onClick={() => setFlyoutOpen(!flyoutOpen)}
              className="w-full flex items-center justify-between px-4 py-3 rounded-t-xl bg-navy text-white font-medium text-sm hover:bg-navy-light transition-colors"
            >
              <div className="flex items-center gap-2">
                <Paperclip className="w-4 h-4" />
                File Attachments ({attachments.length})
              </div>
              {flyoutOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
            {flyoutOpen && (
              <div className="bg-card border border-t-0 border-border rounded-b-xl shadow-lg">
                <div
                  className={`p-6 border-b border-border-faint transition-colors ${dragOver ? "bg-sky/10 border-sky" : ""}`}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                >
                  <div className="flex flex-col items-center gap-3 py-4">
                    <Upload className={`w-8 h-8 ${dragOver ? "text-sky" : "text-muted-foreground"}`} />
                    <p className="text-sm text-foreground-secondary">
                      {uploading ? "Uploading..." : "Drag & drop files here, or"}
                    </p>
                    {!uploading && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        Choose Files
                      </Button>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      className="hidden"
                      onChange={handleFileSelect}
                    />
                  </div>
                </div>

                {attachments.length > 0 && (
                  <div className="divide-y divide-border-faint">
                    {attachments.map((att) => (
                      <div key={att.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50">
                        <Paperclip className="w-4 h-4 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-navy truncate">{att.originalFilename}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatFileSize(att.fileSize)} · {att.downloadCount} downloads
                          </p>
                        </div>
                        <a
                          href={`/api/pages/${slug}/attachments/${att.id}/download`}
                          className="p-1.5 rounded hover:bg-muted text-sky"
                          title="Download"
                        >
                          <Download className="w-4 h-4" />
                        </a>
                        <button
                          onClick={() => setDeleteAttId(att.id)}
                          className="p-1.5 rounded hover:bg-red-50 text-red-500"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {attachments.length === 0 && (
                  <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                    No files attached to this page yet.
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      <UnsavedChangesModal blocker={blocker} onSave={savePage} />

      {deleteAttId && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-card p-6 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xl font-bold text-navy">Delete Attachment</h3>
              <button onClick={() => setDeleteAttId(null)} className="p-2 hover:bg-muted rounded-lg">
                <X className="w-5 h-5 text-foreground-faint" />
              </button>
            </div>
            <p className="text-foreground-secondary mb-6">Are you sure you want to delete this file? This cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setDeleteAttId(null)}>Cancel</Button>
              <Button className="bg-red-500 hover:bg-red-600 text-white" onClick={confirmDeleteAttachment}>Delete</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
