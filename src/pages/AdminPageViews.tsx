import { useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { BarChart3, Eye, RotateCcw, ArrowLeft } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";
import { toast } from "sonner";

interface PageView { path: string; views: number; lastViewed: string; }

export function AdminPageViews() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const { data: pageViews = [] } = useQuery<PageView[]>({
    queryKey: ['admin', 'pageviews'],
    queryFn: async () => {
      const response = await api.get<{ data: PageView[] }>('/api/pageviews', token);
      return response.data;
    },
    enabled: !!token,
  });
  const [pvResetMsg, setPvResetMsg] = useState<{type: "success"|"error", text: string}|null>(null);

  return (
    <div className="bg-background min-h-screen py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <Link to="/admin" className="inline-flex items-center text-sky hover:text-navy transition-colors mb-4">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to Dashboard
          </Link>
          <h1 className="text-3xl font-extrabold text-navy mb-2">Page View Analytics</h1>
          <p className="text-muted-foreground">Track how many times each page has been viewed.</p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center text-navy">
                  <BarChart3 className="w-5 h-5 mr-2 text-sky" />
                  Page Views
                </CardTitle>
                <CardDescription>
                  Total views: <strong>{pageViews.reduce((sum, p) => sum + p.views, 0).toLocaleString()}</strong>
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  setPvResetMsg(null);
                  try {
                    await api.post('/api/pageviews/reset-all', {}, token);
                    qc.invalidateQueries({ queryKey: ['admin', 'pageviews'] });
                    setPvResetMsg({ type: "success", text: "All counters reset to zero." });
                    toast.success("Page view counters reset");
                  } catch (e: unknown) {
                    setPvResetMsg({ type: "error", text: e instanceof Error ? e.message : "Failed to reset" });
                  }
                }}
                className="text-red-500 hover:text-red-700 hover:bg-red-50"
              >
                <RotateCcw className="w-4 h-4 mr-2" /> Reset All
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {pvResetMsg && (
              <div className={`mb-4 p-3 rounded-lg text-sm ${pvResetMsg.type === "success" ? "bg-emerald-50 border border-emerald-200 text-emerald-700" : "bg-red-50 border border-red-200 text-red-700"}`}>
                {pvResetMsg.text}
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-muted border-b border-border-subtle">
                    <th className="p-3 font-semibold text-navy text-sm">Page</th>
                    <th className="p-3 font-semibold text-navy text-sm text-right">Views</th>
                    <th className="p-3 font-semibold text-navy text-sm text-right">Last Viewed</th>
                    <th className="p-3 font-semibold text-navy text-sm text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageViews.map((pv) => (
                    <tr key={pv.path} className="border-b border-border-faint hover:bg-background">
                      <td className="p-3 text-sm">
                        <div className="flex items-center gap-2">
                          <Eye className="w-3 h-3 text-foreground-faint flex-shrink-0" />
                          <span className={`font-medium ${pv.path.startsWith('/admin') ? 'text-orange' : 'text-navy'}`}>
                            {pv.path}
                          </span>
                          {pv.path.startsWith('/admin') && (
                            <span className="text-[10px] bg-orange/10 text-orange px-1.5 py-0.5 rounded font-medium">admin</span>
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-sm text-right font-bold text-navy">{pv.views.toLocaleString()}</td>
                      <td className="p-3 text-sm text-right text-muted-foreground">
                        {new Date(pv.lastViewed).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={async () => {
                            try {
                              await api.post(`/api/pageviews/reset/${encodeURIComponent(pv.path)}`, {}, token);
                              qc.invalidateQueries({ queryKey: ['admin', 'pageviews'] });
                            } catch (e) {}
                          }}
                          className="text-xs text-foreground-faint hover:text-red-500 transition-colors"
                          title="Reset this counter"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {pageViews.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-muted-foreground">No page views recorded yet. Views will appear as users visit the site.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
