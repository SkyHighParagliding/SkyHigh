import { useState, useRef, useEffect } from "react";

export function MarkdownHelpLink({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);
  const linkRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  return (
    <div className="relative inline-block">
      <button
        ref={linkRef}
        type="button"
        onClick={() => setOpen(!open)}
        className="text-[11px] text-sky hover:text-navy transition-colors"
      >
        {open ? "Hide formatting" : "Formatting help"}
      </button>
      {open && (
        <div
          ref={popupRef}
          className="absolute left-0 top-full mt-1 z-50 bg-white border border-border-subtle rounded-lg shadow-lg p-3 w-72"
        >
          <table className="w-full text-[11px] text-foreground-secondary leading-relaxed">
            <tbody>
              <tr><td colSpan={2} className="pt-1 pb-0.5 text-[10px] font-bold text-navy uppercase tracking-wider">Basics</td></tr>
              <tr><td className="pr-2 font-mono text-foreground py-0.5 whitespace-nowrap"># Heading</td><td className="py-0.5">Main heading</td></tr>
              <tr><td className="pr-2 font-mono text-foreground py-0.5 whitespace-nowrap">## Subheading</td><td className="py-0.5">Sub heading</td></tr>
              <tr><td className="pr-2 font-mono text-foreground py-0.5 whitespace-nowrap">**bold**</td><td className="py-0.5">Bold text</td></tr>
              <tr><td className="pr-2 font-mono text-foreground py-0.5 whitespace-nowrap">*italic*</td><td className="py-0.5">Italic text</td></tr>
              <tr><td className="pr-2 font-mono text-foreground py-0.5 whitespace-nowrap">[text](url)</td><td className="py-0.5">Link</td></tr>
              <tr><td className="pr-2 font-mono text-foreground py-0.5 whitespace-nowrap">![alt](url)</td><td className="py-0.5">Image</td></tr>
              <tr><td className="pr-2 font-mono text-foreground py-0.5 whitespace-nowrap">- item</td><td className="py-0.5">Bullet list</td></tr>
              <tr><td className="pr-2 font-mono text-foreground py-0.5 whitespace-nowrap">1. item</td><td className="py-0.5">Numbered list</td></tr>
              <tr><td className="pr-2 font-mono text-foreground py-0.5 whitespace-nowrap">&gt; quote</td><td className="py-0.5">Blockquote</td></tr>
              <tr><td className="pr-2 font-mono text-foreground py-0.5 whitespace-nowrap">---</td><td className="py-0.5">Horizontal line</td></tr>
              <tr><td className="pr-2 font-mono text-foreground py-0.5 whitespace-nowrap">{"text··↵"}</td><td className="py-0.5">New line (2 spaces + Enter)</td></tr>
              <tr><td colSpan={2} className="pt-2 pb-0.5 text-[10px] font-bold text-navy uppercase tracking-wider">Styling</td></tr>
              <tr><td className="pr-2 font-mono text-foreground py-0.5 whitespace-nowrap">{`->text<-`}</td><td className="py-0.5">Centre text</td></tr>
              <tr><td className="pr-2 font-mono text-foreground py-0.5 whitespace-nowrap">{`->>text<<-`}</td><td className="py-0.5">Right align</td></tr>
              <tr><td className="pr-2 font-mono text-foreground py-0.5 whitespace-nowrap">^^^text^^^</td><td className="py-0.5">Large text</td></tr>
              <tr><td className="pr-2 font-mono text-foreground py-0.5 whitespace-nowrap">::text::</td><td className="py-0.5">Photo caption</td></tr>
              <tr><td colSpan={2} className="pt-2 pb-0.5 text-[10px] font-bold text-navy uppercase tracking-wider">Callout Boxes</td></tr>
              <tr><td colSpan={2} className="py-1 text-[10px] text-foreground-faint">Put <span className="font-mono text-foreground">:::type</span> on its own line, then your text, then <span className="font-mono text-foreground">:::</span> on its own line to close:</td></tr>
              <tr><td colSpan={2} className="py-1">
                <div className="font-mono text-[10px] bg-muted/60 rounded p-1.5 leading-relaxed">
                  <span className="text-amber-600">:::highlight</span><br/>
                  Your text here<br/>
                  <span className="text-foreground-faint">:::</span>
                </div>
              </td></tr>
              <tr><td className="pr-2 font-mono text-foreground py-0.5 whitespace-nowrap">:::highlight</td><td className="py-0.5"><span className="inline-block w-2 h-2 rounded-sm bg-amber-100 border border-amber-300 mr-1 align-middle"></span>Yellow</td></tr>
              <tr><td className="pr-2 font-mono text-foreground py-0.5 whitespace-nowrap">:::info</td><td className="py-0.5"><span className="inline-block w-2 h-2 rounded-sm bg-blue-100 border border-blue-300 mr-1 align-middle"></span>Blue</td></tr>
              <tr><td className="pr-2 font-mono text-foreground py-0.5 whitespace-nowrap">:::warning</td><td className="py-0.5"><span className="inline-block w-2 h-2 rounded-sm bg-red-100 border border-red-300 mr-1 align-middle"></span>Red</td></tr>
              <tr><td colSpan={2} className="pt-2 pb-0.5 text-[10px] font-bold text-navy uppercase tracking-wider">Widgets</td></tr>
              <tr><td className="pr-2 font-mono py-0.5 whitespace-nowrap text-purple-600">{`{{schools}}`}</td><td className="py-0.5">Schools buttons</td></tr>
              <tr><td className="pr-2 font-mono py-0.5 whitespace-nowrap text-sky-600">{`{{telegram}}`}</td><td className="py-0.5">Telegram groups</td></tr>
              <tr><td className="pr-2 font-mono py-0.5 whitespace-nowrap text-emerald-600">{`{{committee}}`}</td><td className="py-0.5">Committee cards</td></tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
