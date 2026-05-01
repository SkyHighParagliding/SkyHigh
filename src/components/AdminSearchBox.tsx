import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Loader2, ExternalLink, X } from "lucide-react";
import LazyMarkdown from "@/components/LazyMarkdown";
import { VoiceMicButton } from "@/components/VoiceMicButton";
import { useAuth } from "@/contexts/AuthContext";

interface SearchResult {
  title: string;
  type: string;
  path: string;
  excerpt: string;
  relevance: string;
}

interface SearchResponse {
  summary: string;
  results: SearchResult[];
}

export function AdminSearchBox() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const [error, setError] = useState("");
  const [showPrompt, setShowPrompt] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [defaultPrompt, setDefaultPrompt] = useState("");
  const [promptSaveMsg, setPromptSaveMsg] = useState("");
  const [disclaimer, setDisclaimer] = useState("General information only. Consult SAFA/CASA docs and Site Rules.");
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const navigate = useNavigate();
  const { token } = useAuth();

  useEffect(() => {
    fetch("/api/search/admin/default-prompt")
      .then(r => r.json())
      .then(d => setDefaultPrompt(d.prompt || ""))
      .catch(() => {});

    fetch("/api/settings")
      .then(r => r.json())
      .then(d => {
        if (d.adminSearchPrompt) setPrompt(d.adminSearchPrompt);
        setDisclaimer(d.publicSearchDisclaimer ?? "General information only. Consult SAFA/CASA docs and Site Rules.");
      })
      .catch(() => {});

    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
    };
  }, []);

  const handleSearch = async () => {
    const q = query.trim();
    if (!q || q.length < 2) return;

    if (abortRef.current) {
      abortRef.current.abort();
    }

    setLoading(true);
    setError("");
    setResponse(null);
    setStreamingText("");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/search/admin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ query: q }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Search failed");
      }

      const contentType = res.headers.get("content-type") || "";

      if (contentType.includes("text/event-stream")) {
        const reader = res.body?.getReader();
        if (!reader) throw new Error("No stream available");
        const decoder = new TextDecoder();
        let buffer = "";
        let accumulated = "";
        let receivedResults = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6);
            try {
              const data = JSON.parse(jsonStr);
              if (data.token) {
                accumulated += data.token;
                setStreamingText(accumulated);
              } else if (data.results) {
                receivedResults = true;
                setResponse(data.results);
              } else if (data.error) {
                throw new Error(data.error);
              } else if (data.done) {
                if (!receivedResults) {
                  setStreamingText(accumulated);
                }
              }
            } catch (parseErr: any) {
              if (parseErr.message && !parseErr.message.includes("JSON")) throw parseErr;
            }
          }
        }
      } else {
        const data = await res.json();
        setResponse(data);
      }
    } catch (err: any) {
      if (err.name === "AbortError") return;
      setError(err.message || "Search failed");
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !loading) handleSearch();
  };

  const handleNavigate = (path: string) => {
    if (path.startsWith("http")) {
      window.open(path, "_blank");
    } else {
      navigate(path);
    }
  };

  const handleSavePrompt = async () => {
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ adminSearchPrompt: prompt }),
      });
      if (res.ok) {
        setPromptSaveMsg("Saved");
        setTimeout(() => setPromptSaveMsg(""), 2000);
      }
    } catch {}
  };

  const typeLabel = (type: string) => {
    const labels: Record<string, string> = {
      "admin-page": "Admin",
      "procedure": "Procedure",
      "site": "Site",
      "cms-page": "Page",
      "news": "News",
      "document": "Document",
    };
    return labels[type] || type;
  };

  const typeColor = (type: string) => {
    const colors: Record<string, string> = {
      "admin-page": "bg-sky/10 text-sky",
      "procedure": "bg-orange/10 text-orange",
      "site": "bg-emerald-50 text-emerald-600",
      "cms-page": "bg-violet-50 text-violet-600",
      "news": "bg-amber-50 text-amber-600",
      "document": "bg-indigo-50 text-indigo-600",
    };
    return colors[type] || "bg-muted text-foreground-secondary";
  };

  const displaySummary = response?.summary || streamingText;

  return (
    <div className="mb-6">
      <div className="bg-card rounded-xl border border-border-subtle shadow-sm overflow-hidden">
        <div className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-faint" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Search features, pages, sites, procedures, documents..."
                  className="w-full pl-10 pr-4 py-2.5 border border-border rounded-lg text-sm focus:ring-1 focus:ring-sky focus:border-sky"
                />
                {query && (
                  <button
                    onClick={() => { setQuery(""); setResponse(null); setError(""); setStreamingText(""); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground-faint hover:text-foreground-secondary"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <VoiceMicButton
                onTranscript={(text) => setQuery((prev) => (prev ? prev + " " + text : text))}
                disabled={loading}
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={loading || query.trim().length < 2}
              className="w-full sm:w-auto px-4 py-2.5 bg-navy text-white rounded-lg text-sm font-medium hover:bg-navy-light disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 whitespace-nowrap"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              Search
            </button>
          </div>

          <div className="mt-2">
            <button
              onClick={() => setShowPrompt(!showPrompt)}
              className="text-xs text-sky hover:underline"
            >
              {showPrompt ? "Hide Prompt" : "Edit Prompt"}
            </button>
            {showPrompt && (
              <div className="space-y-2 mt-2">
                <textarea
                  value={prompt || defaultPrompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={6}
                  className="w-full p-3 border border-border rounded-lg text-sm font-mono focus:ring-1 focus:ring-sky focus:border-sky"
                />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-emerald-600">{promptSaveMsg}</span>
                  <button
                    onClick={handleSavePrompt}
                    className="px-3 py-1 bg-sky text-white rounded text-xs font-medium hover:bg-sky-light"
                  >
                    Save as default
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="px-4 pb-4">
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
          </div>
        )}

        {(displaySummary || (loading && !streamingText)) && (
          <div className="border-t border-border-faint">
            <div className="px-4 py-3 bg-background">
              {displaySummary ? (
                <div className="text-sm text-foreground-label prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0.5 prose-strong:text-navy prose-em:text-sky prose-headings:text-navy prose-headings:text-sm prose-headings:mt-3 prose-headings:mb-1">
                  <LazyMarkdown>{displaySummary + (!loading || response ? (disclaimer ? "\n\n**" + disclaimer + "**" : "") : "")}</LazyMarkdown>
                  {loading && !response && <span className="inline-block w-1.5 h-4 bg-sky/60 ml-0.5 animate-pulse align-middle" />}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Searching...
                </div>
              )}
            </div>
            {response?.results && response.results.length > 0 && (
              <div className="divide-y divide-border-faint">
                <div className="px-4 py-2 bg-muted/50">
                  <span className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">Related Documents & Links</span>
                </div>
                {response.results.map((result, i) => (
                  <button
                    key={i}
                    onClick={() => handleNavigate(result.path)}
                    className="w-full px-4 py-3 text-left hover:bg-sky/5 transition-colors flex items-start gap-3 group"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${typeColor(result.type)}`}>
                          {typeLabel(result.type)}
                        </span>
                        <span className="text-sm font-medium text-navy group-hover:text-sky transition-colors truncate">
                          {result.title}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-1">{result.excerpt}</p>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-foreground-ghost group-hover:text-sky flex-shrink-0 mt-1" />
                  </button>
                ))}
              </div>
            )}
            {response?.results && response.results.length === 0 && (
              <div className="px-4 py-6 text-center text-sm text-foreground-faint">No results found</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
