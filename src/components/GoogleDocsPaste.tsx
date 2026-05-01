import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { FileText, X, ClipboardPaste, Check, Eye, EyeOff } from "lucide-react";
import TurndownService from "turndown";

const turndown = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  emDelimiter: "*",
  strongDelimiter: "**",
  hr: "---",
});

turndown.addRule("strikethrough", {
  filter: (node) =>
    node.nodeName === "S" ||
    node.nodeName === "DEL" ||
    (node.nodeName === "SPAN" &&
      (node as HTMLElement).style?.textDecoration?.includes("line-through")),
  replacement: (content) => `~~${content}~~`,
});

turndown.addRule("googleDocsLineBreaks", {
  filter: "br",
  replacement: () => "\n",
});

turndown.addRule("underline", {
  filter: (node) =>
    node.nodeName === "U" ||
    (node.nodeName === "SPAN" &&
      (node as HTMLElement).style?.textDecoration?.includes("underline")),
  replacement: (content) => `<u>${content}</u>`,
});

turndown.addRule("googleDocsSpans", {
  filter: (node) => {
    if (node.nodeName !== "SPAN") return false;
    const el = node as HTMLElement;
    const isBold = el.style?.fontWeight === "700" || el.style?.fontWeight === "bold";
    const isItalic = el.style?.fontStyle === "italic";
    return isBold || isItalic;
  },
  replacement: (content, node) => {
    const el = node as HTMLElement;
    const isBold = el.style?.fontWeight === "700" || el.style?.fontWeight === "bold";
    const isItalic = el.style?.fontStyle === "italic";
    let result = content;
    if (isBold) result = `**${result}**`;
    if (isItalic) result = `*${result}*`;
    return result;
  },
});

turndown.addRule("tableCell", {
  filter: ["th", "td"],
  replacement: (content) => ` ${content.replace(/\n/g, " ").trim()} |`,
});

turndown.addRule("tableRow", {
  filter: "tr",
  replacement: (content, node) => {
    const row = `|${content}\n`;
    const parent = node.parentNode;
    const isFirstRow =
      parent &&
      (parent.nodeName === "THEAD" ||
        (parent.nodeName === "TBODY" && parent.firstChild === node) ||
        (parent.nodeName === "TABLE" && parent.querySelector("tr") === node));
    if (isFirstRow) {
      const cellCount = (node as HTMLElement).querySelectorAll("td, th").length;
      const separator = `|${Array(cellCount).fill(" --- ").join("|")}|\n`;
      return row + separator;
    }
    return row;
  },
});

turndown.addRule("table", {
  filter: "table",
  replacement: (content) => `\n${content}\n`,
});

function cleanMarkdown(md: string): string {
  let cleaned = md;
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  cleaned = cleaned.replace(/^[ \t]+$/gm, "");
  cleaned = cleaned.replace(/\*\*\*\*+/g, "**");
  cleaned = cleaned.replace(/\*\*\s*\*\*/g, "");
  cleaned = cleaned.replace(/\*\s*\*/g, "");
  cleaned = cleaned.replace(/\[([^\]]*)\]\(\)/g, "$1");
  cleaned = cleaned.trim();
  return cleaned;
}

interface GoogleDocsPasteProps {
  onInsert: (markdown: string) => void;
}

export function GoogleDocsPaste({ onInsert }: GoogleDocsPasteProps) {
  const [open, setOpen] = useState(false);
  const [markdown, setMarkdown] = useState("");
  const [preview, setPreview] = useState(false);
  const [pasted, setPasted] = useState(false);
  const pasteAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && pasteAreaRef.current) {
      setTimeout(() => pasteAreaRef.current?.focus(), 100);
    }
  }, [open]);

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const html = e.clipboardData.getData("text/html");
    const plainText = e.clipboardData.getData("text/plain");

    if (html && html.trim()) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      const body = doc.body;
      if (body) {
        body.querySelectorAll("style, script, meta, link").forEach((el) => el.remove());
        body.querySelectorAll("[style]").forEach((el) => {
          const htmlEl = el as HTMLElement;
          const keepStyles = ["font-weight", "font-style", "text-decoration"];
          const newStyle = keepStyles
            .map((prop) => {
              const val = htmlEl.style.getPropertyValue(prop);
              return val ? `${prop}: ${val}` : "";
            })
            .filter(Boolean)
            .join("; ");
          if (newStyle) {
            htmlEl.setAttribute("style", newStyle);
          } else {
            htmlEl.removeAttribute("style");
          }
        });
      }

      const converted = turndown.turndown(body?.innerHTML || html);
      const cleaned = cleanMarkdown(converted);
      setMarkdown(cleaned);
      setPasted(true);
    } else if (plainText) {
      setMarkdown(plainText);
      setPasted(true);
    }
  };

  const handleInsert = () => {
    if (markdown.trim()) {
      onInsert(markdown);
      setOpen(false);
      setMarkdown("");
      setPasted(false);
      setPreview(false);
    }
  };

  const handleClose = () => {
    setOpen(false);
    setMarkdown("");
    setPasted(false);
    setPreview(false);
  };

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-1.5 text-xs h-8"
        title="Paste from Google Docs"
      >
        <FileText className="w-3.5 h-3.5" />
        Paste Doc
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-sky" />
            <h3 className="font-semibold text-lg">Paste from Google Docs</h3>
          </div>
          <button type="button" onClick={handleClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6 space-y-4">
          {!pasted ? (
            <div className="border-2 border-dashed border-sky/40 rounded-xl p-12 text-center focus-within:border-sky focus-within:ring-2 focus-within:ring-sky/20 transition-colors relative">
              <div className="pointer-events-none">
                <ClipboardPaste className="w-12 h-12 text-sky/50 mx-auto mb-4" />
                <p className="text-lg font-medium text-foreground mb-2">
                  Paste your Google Doc content here
                </p>
                <p className="text-sm text-muted-foreground">
                  Copy text from Google Docs (Ctrl+C / Cmd+C) then click here and paste (Ctrl+V / Cmd+V).
                  <br />Formatting like headings, bold, lists, links, and tables will be preserved.
                </p>
              </div>
              <div
                ref={pasteAreaRef}
                contentEditable
                suppressContentEditableWarning
                onPaste={handlePaste}
                onInput={(e) => { (e.target as HTMLElement).textContent = ""; }}
                className="absolute inset-0 opacity-0 cursor-text"
                role="textbox"
                aria-label="Paste area for Google Docs content"
              />
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-emerald-600">
                  <Check className="w-4 h-4" />
                  Content converted to markdown
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setPreview(!preview)}
                    className="gap-1.5 text-xs"
                  >
                    {preview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    {preview ? "Edit" : "Preview"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => { setMarkdown(""); setPasted(false); setPreview(false); }}
                    className="gap-1.5 text-xs text-muted-foreground"
                  >
                    <X className="w-3.5 h-3.5" />
                    Clear
                  </Button>
                </div>
              </div>
              {preview ? (
                <div className="border rounded-lg p-4 bg-muted/30 prose prose-sm max-w-none overflow-auto max-h-[40vh]">
                  <pre className="whitespace-pre-wrap text-sm font-mono">{markdown}</pre>
                </div>
              ) : (
                <textarea
                  value={markdown}
                  onChange={(e) => setMarkdown(e.target.value)}
                  rows={16}
                  className="w-full px-4 py-3 border border-border rounded-lg font-mono text-sm bg-background resize-y focus:ring-2 focus:ring-sky/30 focus:border-sky"
                  placeholder="Converted markdown will appear here..."
                />
              )}
              <p className="text-xs text-muted-foreground">
                You can edit the markdown above before inserting. Remove any parts you don't need.
              </p>
            </>
          )}
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t">
          <Button type="button" variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleInsert}
            disabled={!markdown.trim()}
            className="bg-navy hover:bg-navy-light text-white"
          >
            <ClipboardPaste className="w-4 h-4 mr-2" />
            Insert Markdown
          </Button>
        </div>
      </div>
    </div>
  );
}
