import { useRef, useState } from "react";
import { CircleHelp, GripVertical, X } from "lucide-react";

type Box = { x: number; y: number; w: number; h: number };

/**
 * "Help" button + a floating help window. Drag the title bar to move it and the
 * bottom-right corner to resize — pointer events, because iPad Safari ignores
 * CSS `resize` on non-textarea elements.
 */
export function HelpButton({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen((o) => !o)} className="h-14 px-5 rounded-xl bg-sky-700 text-white text-lg font-semibold flex items-center gap-2">
        <CircleHelp className="w-6 h-6" /> Help
      </button>
      {open && <HelpWindow title={title} onClose={() => setOpen(false)}>{children}</HelpWindow>}
    </>
  );
}

function HelpWindow({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const [box, setBox] = useState<Box>(() => {
    const w = Math.min(560, window.innerWidth - 32);
    const h = Math.min(640, window.innerHeight - 120);
    return { x: window.innerWidth - w - 16, y: 96, w, h };
  });
  const drag = useRef<{ mode: "move" | "size"; px: number; py: number; start: Box } | null>(null);

  const begin = (mode: "move" | "size") => (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { mode, px: e.clientX, py: e.clientY, start: box };
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.px;
    const dy = e.clientY - d.py;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (d.mode === "move") {
      // Keep the whole window (and its resize corner) on screen.
      setBox({ ...d.start, x: Math.min(Math.max(0, d.start.x + dx), Math.max(0, vw - d.start.w)), y: Math.min(Math.max(0, d.start.y + dy), Math.max(0, vh - d.start.h)) });
    } else {
      setBox({ ...d.start, w: Math.min(Math.max(300, d.start.w + dx), vw - d.start.x), h: Math.min(Math.max(220, d.start.h + dy), vh - d.start.y) });
    }
  };
  const end = () => (drag.current = null);

  return (
    <div role="dialog" aria-label={title} className="fixed z-50 flex flex-col bg-white rounded-2xl shadow-2xl border-2 border-sky-700 overflow-hidden" style={{ left: box.x, top: box.y, width: box.w, height: box.h }}>
      <div onPointerDown={begin("move")} onPointerMove={move} onPointerUp={end} onPointerCancel={end} className="flex items-center gap-2 px-4 h-14 bg-sky-700 text-white cursor-move touch-none select-none">
        <GripVertical className="w-5 h-5 opacity-70" />
        <h2 className="flex-1 text-xl font-bold truncate">{title}</h2>
        <button type="button" aria-label="Close help" onPointerDown={(e) => e.stopPropagation()} onClick={onClose} className="p-2 -mr-2"><X className="w-7 h-7" /></button>
      </div>
      <div className="flex-1 overflow-auto p-4 text-lg leading-relaxed space-y-3 [&_h3]:text-xl [&_h3]:font-bold [&_h3]:mt-4 [&_h3]:text-sky-900 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6">
        {children}
      </div>
      <div onPointerDown={begin("size")} onPointerMove={move} onPointerUp={end} onPointerCancel={end} aria-label="Resize help" className="absolute right-0 bottom-0 w-10 h-10 cursor-nwse-resize touch-none flex items-end justify-end p-1">
        <svg viewBox="0 0 16 16" className="w-6 h-6 text-sky-700"><path d="M15 5L5 15M15 10L10 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
      </div>
    </div>
  );
}
