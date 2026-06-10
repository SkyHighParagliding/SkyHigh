import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Save, Check } from "lucide-react";
import { ContentImageToolbar } from "@/components/ContentImageToolbar";
import { HeroImagePicker } from "@/components/HeroImagePicker";
import { MarkdownHelpLink } from "@/components/MarkdownHelpLink";
import { useAdminForm } from "@/hooks/useAdminForm";
import { UnsavedChangesModal } from "@/components/UnsavedChangesModal";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";
import { insertMarkdownAtCursor } from "@/hooks/useMarkdownInsert";
import { useSettings } from "@/contexts/SettingsContext";
import { useAuth } from "@/contexts/AuthContext";

export function AdminNewsEdit() {
  const { settings } = useSettings();
  const { token } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id || id === "new";
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { markDirty, blocker, justSaved, save } = useAdminForm({ successMessage: "News item saved" });

  const [formData, setFormData] = useState({
    title: "",
    content: "",
    date: new Date().toISOString().split('T')[0],
    author: "",
    heroImage: "",
  });

  const defaultAuthor = `${settings.clubName || 'SkyHigh'} Committee`;

  const { data: existingNews } = useQuery({
    queryKey: ['news', id],
    queryFn: () => api.get<Record<string, any>>(`/api/news/${id}`),
    enabled: !isNew && !!id,
  });

  useEffect(() => {
    if (existingNews) {
      setFormData({
        title: existingNews.title || "",
        content: existingNews.content || "",
        date: existingNews.date || new Date().toISOString().split('T')[0],
        author: existingNews.author || defaultAuthor,
        heroImage: existingNews.heroImage || "",
      });
    } else if (isNew) {
      setFormData(prev => ({ ...prev, author: defaultAuthor }));
    }
  }, [existingNews, isNew, defaultAuthor]);

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

  const saveNews = useCallback(() => save(async () => {
    const payload = {
      ...formData,
      id: isNew ? formData.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') : id,
    };

    const url = isNew ? '/api/news' : `/api/news/${id}`;
    const method = isNew ? 'POST' : 'PUT';

    if (method === 'POST') {
      await api.post(url, payload, token);
    } else {
      await api.put(url, payload, token);
    }
  }), [formData, isNew, id, save]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await saveNews();
      setTimeout(() => navigate("/admin/pages"), 1200);
    } catch {}
  };

  return (
    <div className="bg-background min-h-screen py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex gap-4 mb-6">
          <Link to="/admin/pages" className="inline-flex items-center text-sky hover:text-sky-light font-medium">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to News & Pages
          </Link>
          <span className="text-foreground-ghost">|</span>
          <Link to="/admin" className="inline-flex items-center text-muted-foreground hover:text-navy font-medium">
            Admin Dashboard
          </Link>
        </div>

        <Card className="shadow-lg border-t-4 border-t-navy">
          <CardHeader className="bg-card border-b pb-6">
            <CardTitle className="text-2xl text-navy">
              {isNew ? "Create News Item" : `Edit News: ${formData.title}`}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-8">
              <div className="flex justify-end">
                <Button
                  type="submit"
                  className={`px-8 transition-all duration-300 ${justSaved ? "bg-emerald-500 hover:bg-emerald-600 scale-105" : "bg-navy hover:bg-navy-light"} text-white`}
                >
                  {justSaved ? <><Check className="w-4 h-4 mr-2" /> Saved!</> : <><Save className="w-4 h-4 mr-2" /> Save News Item</>}
                </Button>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground-label mb-1">Title</label>
                    <input
                      type="text"
                      name="title"
                      value={formData.title}
                      onChange={handleChange}
                      className="w-full p-2 border border-border rounded-md focus:ring-sky focus:border-sky"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground-label mb-1">Date</label>
                    <input
                      type="date"
                      name="date"
                      value={formData.date}
                      onChange={handleChange}
                      className="w-full p-2 border border-border rounded-md focus:ring-sky focus:border-sky"
                      required
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-foreground-label mb-1">Author</label>
                  <input
                    type="text"
                    name="author"
                    value={formData.author}
                    onChange={handleChange}
                    className="w-full p-2 border border-border rounded-md focus:ring-sky focus:border-sky"
                    required
                  />
                </div>

                <HeroImagePicker
                  value={formData.heroImage}
                  onChange={(url) => { setFormData(prev => ({ ...prev, heroImage: url })); markDirty(); }}
                />

                <div>
                  <label className="block text-sm font-medium text-foreground-label mb-1">Content (Markdown supported)</label>
                  <ContentImageToolbar onInsertMarkdown={handleInsertMarkdown} />
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
                  {justSaved ? <><Check className="w-4 h-4 mr-2" /> Saved!</> : <><Save className="w-4 h-4 mr-2" /> Save News Item</>}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
      <UnsavedChangesModal blocker={blocker} onSave={saveNews} />
    </div>
  );
}
