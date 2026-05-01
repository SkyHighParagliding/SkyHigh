import React, { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Send, Bot, User, Loader2, X, MessageCircle } from "lucide-react";
import { VoiceMicButton } from "@/components/VoiceMicButton";

interface Message {
  role: "user" | "assistant";
  text: string;
  isCta?: boolean;
}

function isSafeUrl(url: string): boolean {
  return url.startsWith("/") || url.startsWith("http://") || url.startsWith("https://") || url.startsWith("#");
}

function renderInlineMarkdown(text: string) {
  const parts = text.split(/(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((part, i) => {
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      if (!isSafeUrl(linkMatch[2])) return <span key={i}>{linkMatch[1]}</span>;
      const linkText = linkMatch[1].replace(/\*\*/g, "");
      const isExternal = linkMatch[2].startsWith("http");
      return (
        <a
          key={i}
          href={linkMatch[2]}
          target={isExternal ? "_blank" : undefined}
          rel={isExternal ? "noopener noreferrer" : undefined}
          className="text-sky-300 underline hover:text-sky-200 transition-colors"
        >
          {linkText}
        </a>
      );
    }
    const boldMatch = part.match(/^\*\*([^*]+)\*\*$/);
    if (boldMatch) {
      const inner = boldMatch[1];
      const innerLinkMatch = inner.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (innerLinkMatch) {
        if (!isSafeUrl(innerLinkMatch[2])) return <strong key={i} className="font-semibold">{innerLinkMatch[1]}</strong>;
        const isExternal = innerLinkMatch[2].startsWith("http");
        return (
          <a
            key={i}
            href={innerLinkMatch[2]}
            target={isExternal ? "_blank" : undefined}
            rel={isExternal ? "noopener noreferrer" : undefined}
            className="text-sky-300 underline hover:text-sky-200 transition-colors"
          >
            {innerLinkMatch[1]}
          </a>
        );
      }
      return <strong key={i} className="font-semibold">{inner}</strong>;
    }
    const italicMatch = part.match(/^\*([^*]+)\*$/);
    if (italicMatch) {
      return <em key={i}>{italicMatch[1]}</em>;
    }
    return <span key={i}>{part}</span>;
  });
}

function renderMarkdown(text: string) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    const rightMatch = trimmed.match(/^->>(.+)<<-$/);
    if (rightMatch) {
      elements.push(<div key={`line-${i}`} style={{ textAlign: "right" }}>{renderInlineMarkdown(rightMatch[1].trim())}</div>);
      continue;
    }

    const centerMatch = trimmed.match(/^->(.+)<-$/);
    if (centerMatch) {
      elements.push(<div key={`line-${i}`} style={{ textAlign: "center" }}>{renderInlineMarkdown(centerMatch[1].trim())}</div>);
      continue;
    }

    const largeMatch = trimmed.match(/^\^\^\^(.+)\^\^\^$/);
    if (largeMatch) {
      elements.push(<span key={`line-${i}`} style={{ fontSize: "1.2rem", lineHeight: "1.5" }}>{renderInlineMarkdown(largeMatch[1].trim())}</span>);
      if (i < lines.length - 1) elements.push(<br key={`br-${i}`} />);
      continue;
    }

    const captionMatch = trimmed.match(/^::([^:]+)::$/);
    if (captionMatch) {
      elements.push(<div key={`line-${i}`} style={{ textAlign: "center", fontSize: "0.85rem", opacity: 0.7 }}>{captionMatch[1].trim()}</div>);
      continue;
    }

    if (i > 0) elements.push(<br key={`br-${i}`} />);
    elements.push(<span key={`line-${i}`}>{renderInlineMarkdown(line)}</span>);
  }

  return elements;
}

export function PublicSearchBox() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [error, setError] = useState("");
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [ctaMessage, setCtaMessage] = useState("");
  const [ctaFrequency, setCtaFrequency] = useState(0);
  const [disclaimer, setDisclaimer] = useState("General information only. Consult SAFA/CASA docs and Site Rules.");
  const [settings, setLocalSettings] = useState<{ clubName?: string }>({});
  const responseCountRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const pendingRequestRef = useRef<string | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then(r => r.json())
      .then(s => {
        setCtaMessage(s.publicSearchCtaMessage || "");
        setCtaFrequency(parseInt(s.publicSearchCtaFrequency || "0") || 0);
        setDisclaimer(s.publicSearchDisclaimer ?? "General information only. Consult SAFA/CASA docs and Site Rules.");
        setLocalSettings({ clubName: s.clubName || "SkyHigh" });
      })
      .catch(() => {});
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [messages, loading, streamingText]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
    if (isOpen) {
      const scrollY = window.scrollY;
      document.documentElement.style.overflow = "hidden";
      document.body.style.overflow = "hidden";
      document.body.style.overscrollBehavior = "contain";
      document.body.dataset.scrollLock = String(scrollY);
    } else {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
      document.body.style.overscrollBehavior = "";
      delete document.body.dataset.scrollLock;
    }
    return () => {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
      document.body.style.overscrollBehavior = "";
      delete document.body.dataset.scrollLock;
    };
  }, [isOpen]);

  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    const q = query.trim();
    if (!q || loading) return;

    if (pendingRequestRef.current === q) return;
    pendingRequestRef.current = q;

    if (abortRef.current) {
      abortRef.current.abort();
    }

    const userMsg: Message = { role: "user", text: q };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setQuery("");
    setLoading(true);
    setStreamingText("");
    setError("");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/search/public", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: q,
          history: updatedMessages.filter(m => !m.isCta).slice(-6),
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Something went wrong");
      }

      const contentType = res.headers.get("content-type") || "";

      if (contentType.includes("text/event-stream")) {
        const reader = res.body?.getReader();
        if (!reader) throw new Error("No stream available");
        const decoder = new TextDecoder();
        let accumulated = "";
        let finalText = "";
        let buffer = "";

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
              } else if (data.replace) {
                accumulated = data.replace;
                finalText = data.replace;
                setStreamingText(accumulated);
              } else if (data.done) {
                finalText = finalText || accumulated;
              } else if (data.error) {
                throw new Error(data.error);
              }
            } catch (parseErr: any) {
              if (parseErr.message && !parseErr.message.includes("JSON")) throw parseErr;
            }
          }
        }

        const answerText = (finalText || accumulated) + (disclaimer ? "\n\n**" + disclaimer + "**" : "");
        responseCountRef.current += 1;
        const newMessages: Message[] = [...updatedMessages, { role: "assistant", text: answerText }];

        if (ctaFrequency > 0 && ctaMessage && responseCountRef.current % ctaFrequency === 0) {
          newMessages.push({ role: "assistant", text: ctaMessage, isCta: true });
        }

        setMessages(newMessages);
        setStreamingText("");
      } else {
        const data = await res.json();
        let answerText = data.answer || "I couldn't find an answer to that.";
        if (data.followUp) {
          answerText += "\n\n" + data.followUp;
        }
        if (disclaimer) answerText += "\n\n**" + disclaimer + "**";

        responseCountRef.current += 1;
        const newMessages: Message[] = [...updatedMessages, { role: "assistant", text: answerText }];

        if (ctaFrequency > 0 && ctaMessage && responseCountRef.current % ctaFrequency === 0) {
          newMessages.push({ role: "assistant", text: ctaMessage, isCta: true });
        }

        setMessages(newMessages);
      }
    } catch (err: any) {
      if (err.name === "AbortError") return;
      setError(err.message || "Failed to get a response");
    } finally {
      setLoading(false);
      setStreamingText("");
      pendingRequestRef.current = null;
      abortRef.current = null;
    }
  }, [query, loading, messages, ctaFrequency, ctaMessage]);

  function handleClose() {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setIsOpen(false);
    setMessages([]);
    setError("");
    setQuery("");
    setStreamingText("");
    responseCountRef.current = 0;
    pendingRequestRef.current = null;
  }

  const chatPanel = isOpen ? createPortal(
    <div className="fixed inset-0 z-[9998] flex items-center justify-center p-3 sm:p-4 overflow-hidden">
      <div className="fixed inset-0 bg-black/60 sm:bg-black/40" onClick={handleClose} />
      <div
        className="relative z-[9999] flex flex-col w-full max-h-[70dvh] h-[70dvh] sm:h-auto sm:max-h-[min(600px,85vh)] sm:w-[min(640px,calc(100vw-32px))] rounded-2xl bg-navy/95 backdrop-blur-lg border border-white/15 shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-sky-300" />
            <span className="text-white/90 text-sm font-medium">{settings?.clubName || 'SkyHigh'} Smart Assistant</span>
          </div>
          <button
            onClick={handleClose}
            className="text-white/50 hover:text-white/80 transition-colors p-2 -mr-1"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div ref={messagesContainerRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3">
          {messages.length === 0 && !loading && (
            <div className="text-white/50 text-sm text-center py-4">
              Ask me about flying sites, ratings, wind conditions, or anything about the club!
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {msg.role === "assistant" && (
                <Bot className={`w-5 h-5 mt-1 flex-shrink-0 ${msg.isCta ? "text-amber-300" : "text-sky-300"}`} />
              )}
              <div
                className={`rounded-xl px-3 py-2 text-sm max-w-[85%] leading-relaxed ${
                  msg.role === "user"
                    ? "bg-sky-600/60 text-white"
                    : msg.isCta
                      ? "bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-400/30 text-white/90"
                      : "bg-white/10 text-white/90"
                }`}
              >
                {msg.role === "assistant" ? renderMarkdown(msg.text) : msg.text}
              </div>
              {msg.role === "user" && (
                <User className="w-5 h-5 text-white/50 mt-1 flex-shrink-0" />
              )}
            </div>
          ))}

          {loading && streamingText && (
            <div className="flex gap-2 justify-start">
              <Bot className="w-5 h-5 text-sky-300 mt-1 flex-shrink-0" />
              <div className="bg-white/10 rounded-xl px-3 py-2 text-sm text-white/90 max-w-[85%] leading-relaxed">
                {renderMarkdown(streamingText)}
              </div>
            </div>
          )}

          {loading && !streamingText && (
            <div className="flex gap-2 justify-start">
              <Bot className="w-5 h-5 text-sky-300 mt-1 flex-shrink-0" />
              <div className="bg-white/10 rounded-xl px-3 py-2 text-sm text-white/70 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Thinking...
              </div>
            </div>
          )}

          {error && (
            <div className="text-red-300 text-sm text-center py-1">{error}</div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-2.5 sm:py-3 border-t border-white/10 shrink-0 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. Can I fly Monument with a PG2?"
            className="flex-1 min-w-0 bg-white/10 text-white placeholder-white/40 text-base sm:text-sm rounded-full px-3 sm:px-4 py-2 border border-white/10 focus:border-sky-400/50 focus:ring-1 focus:ring-sky-400/30 focus:outline-none transition-all"
            disabled={loading}
          />
          <VoiceMicButton
            onTranscript={(text) => setQuery((prev) => (prev ? prev + " " + text : text))}
            variant="dark"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="shrink-0 p-2 rounded-full bg-sky-500/80 text-white hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <>
      <div className="mt-8 flex justify-center">
        <button
          ref={buttonRef}
          onClick={() => setIsOpen(!isOpen)}
          className={`group flex items-center gap-3 px-6 py-3 rounded-full backdrop-blur-md border border-white/20 transition-all duration-300 shadow-lg ${
            isOpen
              ? "bg-white/20 text-white"
              : "bg-white/10 text-white/90 hover:bg-white/20 hover:text-white"
          }`}
        >
          <MessageCircle className="w-5 h-5 text-sky-300 group-hover:text-sky-200" />
          <span className="text-base font-medium">Smart Search</span>
        </button>
      </div>
      {chatPanel}
    </>
  );
}
