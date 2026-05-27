import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Link2, X, ImageIcon, ExternalLink, Tag, Copy, Check } from "lucide-react";
import { useSettings } from "@/contexts/SettingsContext";

interface LibraryImage {
  src: string;
  label: string;
  category: string;
}

interface ScreenshotEntry {
  id: string;
  name: string;
  category: string;
  imagePath: string;
  width: number;
  height: number;
  dateAdded: string;
}

interface ContentImageToolbarProps {
  onInsertMarkdown: (markdown: string) => void;
}

export function ContentImageToolbar({ onInsertMarkdown }: ContentImageToolbarProps) {
  const { settings } = useSettings();
  const [mode, setMode] = useState<"idle" | "url" | "library" | "screenshots">("idle");
  const [urlValue, setUrlValue] = useState("");
  const [altText, setAltText] = useState("");
  const [libraryTab, setLibraryTab] = useState<string>("hero");
  const [copiedTag, setCopiedTag] = useState<string | null>(null);

  const resetState = () => {
    setMode("idle");
    setUrlValue("");
    setAltText("");
  };

  const getLibraryImages = (): Record<string, LibraryImage[]> => {
    const result: Record<string, LibraryImage[]> = {
      hero: [],
      banner: [],
      "landscape-lg": [],
      "landscape-sm": [],
      portrait: [],
    };
    if (!settings.imageLibrary) return result;
    try {
      const lib = JSON.parse(settings.imageLibrary);
      for (const entry of lib) {
        const name = entry.name || "Untitled";
        if (entry.wide) result.hero.push({ src: entry.wide, label: name, category: "Hero" });
        if (entry.banner) result.banner.push({ src: entry.banner, label: name, category: "Banner" });
        if (entry.sliderLg) result["landscape-lg"].push({ src: entry.sliderLg, label: name, category: "Landscape Large" });
        if (entry.sliderSm) result["landscape-sm"].push({ src: entry.sliderSm, label: name, category: "Landscape Small" });
        if (entry.sliderPortrait) result.portrait.push({ src: entry.sliderPortrait, label: name, category: "Portrait" });
      }
    } catch {}
    return result;
  };

  const handleUrlInsert = () => {
    if (!urlValue.trim()) return;
    onInsertMarkdown(`![${altText || "image"}](${urlValue.trim()})`);
    resetState();
  };

  const handleLibrarySelect = (img: LibraryImage) => {
    onInsertMarkdown(`![${img.label}](${img.src})`);
    resetState();
  };

  const LIBRARY_TABS = [
    { key: "hero", label: "Hero", aspect: "aspect-video" },
    { key: "banner", label: "Banner", aspect: "aspect-[16/5]" },
    { key: "landscape-lg", label: "Landscape Lg", aspect: "aspect-[3/2]" },
    { key: "landscape-sm", label: "Landscape Sm", aspect: "aspect-[3/2]" },
    { key: "portrait", label: "Portrait", aspect: "aspect-[267/400]" },
  ];

  if (mode === "idle") {
    return (
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs text-foreground-faint mr-1">Insert image:</span>
        <button
          type="button"
          onClick={() => setMode("library")}
          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border border-border-subtle text-foreground-secondary hover:border-sky hover:text-sky transition-colors"
        >
          <ImageIcon className="w-3 h-3" /> Library
        </button>
        <button
          type="button"
          onClick={() => setMode("url")}
          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border border-border-subtle text-foreground-secondary hover:border-sky hover:text-sky transition-colors"
        >
          <Link2 className="w-3 h-3" /> Paste URL
        </button>
        <button
          type="button"
          onClick={() => setMode("screenshots")}
          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border border-border-subtle text-foreground-secondary hover:border-amber-500 hover:text-amber-600 transition-colors"
        >
          <Tag className="w-3 h-3" /> Screenshot Tags
        </button>
        <Link
          to="/admin/images"
          className="flex items-center gap-1 text-xs px-2.5 py-1.5 text-foreground-faint hover:text-sky transition-colors ml-auto"
        >
          <ExternalLink className="w-3 h-3" /> Upload/Create/Manage Images
        </Link>
      </div>
    );
  }

  if (mode === "library") {
    const libraryImages = getLibraryImages();
    const activeTab = (libraryImages[libraryTab] || []).length > 0 ? libraryTab : (LIBRARY_TABS.find(t => (libraryImages[t.key] || []).length > 0)?.key || libraryTab);
    const currentTab = LIBRARY_TABS.find(t => t.key === activeTab) || LIBRARY_TABS[0];
    const currentImages = libraryImages[currentTab.key] || [];
    const totalCount = Object.values(libraryImages).reduce((sum, arr) => sum + arr.length, 0);

    return (
      <div className="mb-2 border border-border-subtle rounded-lg p-4 bg-card space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium text-navy">Image Library</h4>
          <div className="flex items-center gap-3">
            <Link
              to="/admin/images"
              className="flex items-center gap-1 text-[10px] text-foreground-faint hover:text-sky transition-colors"
            >
              <ExternalLink className="w-3 h-3" /> Upload/Create/Manage Images
            </Link>
            <button type="button" onClick={resetState} className="text-foreground-faint hover:text-foreground-secondary">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {totalCount === 0 ? (
          <div className="text-center py-4">
            <p className="text-sm text-foreground-faint">No images in the library yet.</p>
            <Link to="/admin/images" className="text-xs text-sky hover:underline mt-1 inline-block">Go to Image Library to upload</Link>
          </div>
        ) : (
          <>
            <div className="flex gap-1 border-b border-border pb-1">
              {LIBRARY_TABS.map(tab => {
                const count = (libraryImages[tab.key] || []).length;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => count > 0 && setLibraryTab(tab.key)}
                    disabled={count === 0}
                    className={`text-xs px-2.5 py-1 rounded-t-md transition-colors ${activeTab === tab.key ? "bg-sky text-white" : count === 0 ? "text-foreground-faint/40 cursor-not-allowed" : "text-foreground-secondary hover:text-sky"}`}
                  >
                    {tab.label} ({count})
                  </button>
                );
              })}
            </div>

            {currentImages.length === 0 ? (
              <p className="text-sm text-foreground-faint text-center py-4">No images in this category.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2 max-h-72 overflow-y-auto pr-1">
                {currentImages.map((img) => (
                  <button
                    key={img.src}
                    type="button"
                    onClick={() => handleLibrarySelect(img)}
                    className="relative block w-full border border-border rounded-lg overflow-hidden bg-muted hover:ring-2 hover:ring-sky hover:border-sky transition-all group"
                  >
                    <div className="w-full h-20">
                      <img
                        src={img.src}
                        alt={img.label}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 py-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <p className="text-white text-[10px] font-medium truncate">{img.label}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
            <p className="text-[10px] text-foreground-faint text-center">Click an image to insert it into your content</p>
          </>
        )}
      </div>
    );
  }

  if (mode === "screenshots") {
    let screenshots: ScreenshotEntry[] = [];
    try { screenshots = settings.screenshotLibrary ? JSON.parse(settings.screenshotLibrary) : []; } catch {}

    const handleInsertTag = (ss: ScreenshotEntry) => {
      onInsertMarkdown(`{{screenshot:${ss.id}}}`);
      resetState();
    };

    const handleCopyTag = (ss: ScreenshotEntry) => {
      navigator.clipboard.writeText(`{{screenshot:${ss.id}}}`);
      setCopiedTag(ss.id);
      setTimeout(() => setCopiedTag(null), 2000);
    };

    return (
      <div className="mb-2 border border-amber-200 rounded-lg p-4 bg-amber-50/50 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium text-amber-800 flex items-center gap-1.5">
            <Tag className="w-4 h-4" /> Screenshot Tags
          </h4>
          <div className="flex items-center gap-3">
            <Link
              to="/admin/images"
              className="flex items-center gap-1 text-[10px] text-foreground-faint hover:text-amber-600 transition-colors"
            >
              <ExternalLink className="w-3 h-3" /> Manage Screenshots
            </Link>
            <button type="button" onClick={resetState} className="text-foreground-faint hover:text-foreground-secondary">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="bg-card border rounded-md p-2.5 text-[11px] text-foreground-secondary leading-relaxed">
          <p className="font-medium text-foreground text-xs mb-1">How to use</p>
          <p>Paste a <code className="bg-amber-100 px-1 rounded text-[10px]">{"{{screenshot:ID}}"}</code> tag into any markdown field. It will be replaced with the image when rendered.</p>
          <p className="mt-1 text-[10px] text-muted-foreground">Works in: procedure steps, admin manual pages, card descriptions, site guides.</p>
        </div>

        {screenshots.length === 0 ? (
          <div className="text-center py-4">
            <p className="text-sm text-foreground-faint">No screenshots yet.</p>
            <Link to="/admin/images" className="text-xs text-amber-600 hover:underline mt-1 inline-block">Go to Image Processing to add screenshots</Link>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-64 overflow-y-auto">
              {screenshots.map(ss => (
                <div key={ss.id} className="relative group rounded-md overflow-hidden border border-gray-200 hover:border-amber-400 transition-all bg-gray-100">
                  <button
                    type="button"
                    onClick={() => handleInsertTag(ss)}
                    className="w-full aspect-video"
                    title={`Insert {{screenshot:${ss.id}}}`}
                  >
                    <img src={ss.imagePath} alt={ss.name} className="w-full h-full object-cover" />
                  </button>
                  <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-1.5 py-1 flex items-center justify-between">
                    <p className="text-[9px] text-white truncate flex-1">{ss.name}</p>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleCopyTag(ss); }}
                      className="ml-1 text-white/70 hover:text-white"
                      title="Copy tag"
                    >
                      {copiedTag === ss.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-foreground-faint text-center">Click an image to insert its tag, or use the copy button</p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="mb-2 border border-border-subtle rounded-lg p-4 bg-card space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-navy">Insert Image from URL</h4>
        <button type="button" onClick={resetState} className="text-foreground-faint hover:text-foreground-secondary">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div>
        <label className="block text-xs text-muted-foreground mb-1">Alt text (optional)</label>
        <input
          type="text"
          value={altText}
          onChange={(e) => setAltText(e.target.value)}
          placeholder="Describe the image..."
          className="w-full p-2 text-sm border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky"
        />
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Image URL</label>
          <input
            type="text"
            value={urlValue}
            onChange={(e) => setUrlValue(e.target.value)}
            placeholder="https://example.com/image.jpg"
            className="w-full p-2 text-sm border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky"
          />
        </div>
        <div className="flex justify-end">
          <Button type="button" size="sm" onClick={handleUrlInsert} disabled={!urlValue.trim()} className="bg-sky text-white text-xs">
            Insert Image
          </Button>
        </div>
      </div>
    </div>
  );
}
