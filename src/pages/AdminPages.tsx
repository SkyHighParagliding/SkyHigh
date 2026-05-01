import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Edit, Trash2, ArrowLeft, X, FileText, Newspaper } from "lucide-react";
import { usePages, useNews, useDeletePageMutation, useNewsMutation } from "@/hooks/api";

type Tab = "pages" | "news";

export function AdminPages() {
  const [tab, setTab] = useState<Tab>("pages");
  const { data: pages = [] } = usePages();
  const { data: news = [] } = useNews();
  const deletePageMutation = useDeletePageMutation();
  const { remove: removeNewsMutation } = useNewsMutation();
  const [pageToDelete, setPageToDelete] = useState<string | null>(null);
  const [newsToDelete, setNewsToDelete] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const navigate = useNavigate();

  const confirmDeletePage = async () => {
    if (!pageToDelete) return;
    setDeleteError("");
    try {
      await deletePageMutation.mutateAsync(pageToDelete);
      setPageToDelete(null);
    } catch (e: unknown) {
      setDeleteError(e instanceof Error ? e.message : "Failed to delete page");
    }
  };

  const confirmDeleteNews = async () => {
    if (!newsToDelete) return;
    setDeleteError("");
    try {
      await removeNewsMutation.mutateAsync(newsToDelete);
      setNewsToDelete(null);
    } catch (e: unknown) {
      setDeleteError(e instanceof Error ? e.message : "Failed to delete news item");
    }
  };

  return (
    <div className="bg-background min-h-screen py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Link to="/admin" className="inline-flex items-center text-sky hover:text-sky-light mb-6 font-medium">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Dashboard
        </Link>

        <div className="mb-8">
          <h1 className="text-3xl font-extrabold text-navy mb-2">News, Events & Dynamic Pages</h1>
          <p className="text-foreground-secondary">Manage all content pages and news articles.</p>
        </div>

        <div className="flex gap-1 mb-6 border-b border-border-subtle">
          <button
            onClick={() => setTab("pages")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === "pages"
                ? "border-navy text-navy"
                : "border-transparent text-muted-foreground hover:text-foreground-label hover:border-border"
            }`}
          >
            <FileText className="w-4 h-4" /> Dynamic Pages
          </button>
          <button
            onClick={() => setTab("news")}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === "news"
                ? "border-navy text-navy"
                : "border-transparent text-muted-foreground hover:text-foreground-label hover:border-border"
            }`}
          >
            <Newspaper className="w-4 h-4" /> News & Events
          </button>
        </div>

        {tab === "pages" && (
          <>
            <div className="flex justify-end mb-4">
              <Button onClick={() => navigate('/admin/pages/new')} className="bg-navy hover:bg-navy-light text-white">
                <Plus className="w-4 h-4 mr-2" /> Add New Page
              </Button>
            </div>
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-muted border-b border-border-subtle">
                        <th className="p-4 font-semibold text-navy">Title</th>
                        <th className="p-4 font-semibold text-navy">Page Address</th>
                        <th className="p-4 font-semibold text-navy">Last Updated</th>
                        <th className="p-4 font-semibold text-navy text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pages.map((page) => (
                        <tr key={page.slug} className="border-b border-border-faint hover:bg-background">
                          <td className="p-4 font-medium text-navy">{page.title}</td>
                          <td className="p-4 text-foreground-secondary">/{page.slug}</td>
                          <td className="p-4 text-muted-foreground text-sm">
                            {new Date(page.lastUpdated).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </td>
                          <td className="p-4 text-right space-x-2">
                            <Button variant="outline" size="sm" onClick={() => navigate(`/admin/pages/${page.slug}/edit`)}>
                              <Edit className="w-4 h-4 mr-1" /> Edit
                            </Button>
                            <Button variant="outline" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => { setDeleteError(""); setPageToDelete(page.slug); }}>
                              <Trash2 className="w-4 h-4 mr-1" /> Delete
                            </Button>
                          </td>
                        </tr>
                      ))}
                      {pages.length === 0 && (
                        <tr>
                          <td colSpan={4} className="p-8 text-center text-muted-foreground">
                            No pages found. Click "Add New Page" to create one.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {tab === "news" && (
          <>
            <div className="flex justify-end mb-4">
              <Button onClick={() => navigate('/admin/news/new')} className="bg-navy hover:bg-navy-light text-white">
                <Plus className="w-4 h-4 mr-2" /> Add News Item
              </Button>
            </div>
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-muted border-b border-border-subtle">
                        <th className="p-4 font-semibold text-navy">Title</th>
                        <th className="p-4 font-semibold text-navy">Date</th>
                        <th className="p-4 font-semibold text-navy">Author</th>
                        <th className="p-4 font-semibold text-navy text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {news.map((item) => (
                        <tr key={item.id} className="border-b border-border-faint hover:bg-background">
                          <td className="p-4 font-medium text-navy">{item.title}</td>
                          <td className="p-4 text-foreground-secondary">{new Date(item.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                          <td className="p-4 text-foreground-secondary">{item.author}</td>
                          <td className="p-4 text-right space-x-2">
                            <Button variant="outline" size="sm" onClick={() => navigate(`/admin/news/${item.id}/edit`)}>
                              <Edit className="w-4 h-4 mr-1" /> Edit
                            </Button>
                            <Button variant="outline" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => { setDeleteError(""); setNewsToDelete(item.id); }}>
                              <Trash2 className="w-4 h-4 mr-1" /> Delete
                            </Button>
                          </td>
                        </tr>
                      ))}
                      {news.length === 0 && (
                        <tr>
                          <td colSpan={4} className="p-8 text-center text-muted-foreground">
                            No news items found. Click "Add News Item" to create one.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {pageToDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-card p-6 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xl font-bold text-navy">Confirm Deletion</h3>
              <button onClick={() => setPageToDelete(null)} className="p-2 hover:bg-muted rounded-lg">
                <X className="w-5 h-5 text-foreground-faint" />
              </button>
            </div>
            <p className="text-foreground-secondary mb-6">Are you sure you want to delete this page? This action cannot be undone.</p>
            {deleteError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{deleteError}</div>
            )}
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setPageToDelete(null)}>Cancel</Button>
              <Button className="bg-red-500 hover:bg-red-600 text-white" onClick={confirmDeletePage}>Delete Page</Button>
            </div>
          </div>
        </div>
      )}

      {newsToDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-card p-6 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xl font-bold text-navy">Confirm Deletion</h3>
              <button onClick={() => setNewsToDelete(null)} className="p-2 hover:bg-muted rounded-lg">
                <X className="w-5 h-5 text-foreground-faint" />
              </button>
            </div>
            <p className="text-foreground-secondary mb-6">Are you sure you want to delete this news item? This action cannot be undone.</p>
            {deleteError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{deleteError}</div>
            )}
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setNewsToDelete(null)}>Cancel</Button>
              <Button className="bg-red-500 hover:bg-red-600 text-white" onClick={confirmDeleteNews}>Delete News Item</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
