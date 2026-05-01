import { useState } from "react";
import { ImageIcon, X, Link2 } from "lucide-react";
import { useSettings } from "@/contexts/SettingsContext";

interface HeroImagePickerProps {
  value: string;
  onChange: (url: string) => void;
}

interface LibraryImage {
  src: string;
  label: string;
}

export function HeroImagePicker({ value, onChange }: HeroImagePickerProps) {
  const { settings } = useSettings();
  const [showPicker, setShowPicker] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [showUrlInput, setShowUrlInput] = useState(false);

  const getBannerImages = (): LibraryImage[] => {
    const images: LibraryImage[] = [];
    if (!settings.imageLibrary) return images;
    try {
      const lib = JSON.parse(settings.imageLibrary);
      for (const entry of lib) {
        const name = entry.name || "Untitled";
        if (entry.banner) images.push({ src: entry.banner, label: name });
        else if (entry.wide) images.push({ src: entry.wide, label: name });
      }
    } catch {}
    return images;
  };

  const bannerImages = getBannerImages();

  if (value) {
    return (
      <div className="space-y-2">
        <label className="block text-sm font-medium text-foreground-label">Banner Image</label>
        <div className="relative rounded-lg overflow-hidden border border-border" style={{ height: 120 }}>
          <img src={value} alt="Banner" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-navy/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={() => onChange("")}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/90 text-red-600 rounded-md text-xs font-medium hover:bg-white transition-colors"
            >
              <X className="w-3 h-3" /> Remove
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-foreground-label">Banner Image <span className="text-foreground-faint font-normal">(optional)</span></label>
      {!showPicker ? (
        <button
          type="button"
          onClick={() => setShowPicker(true)}
          className="flex items-center gap-2 px-3 py-2 text-xs border border-dashed border-border-subtle rounded-lg text-foreground-secondary hover:border-sky hover:text-sky transition-colors w-full justify-center"
        >
          <ImageIcon className="w-4 h-4" /> Add a banner image to the header
        </button>
      ) : (
        <div className="border border-border rounded-lg p-3 space-y-3 bg-muted/30">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-foreground-secondary">Choose banner image</span>
            <button type="button" onClick={() => { setShowPicker(false); setShowUrlInput(false); }} className="text-foreground-ghost hover:text-foreground-secondary">
              <X className="w-4 h-4" />
            </button>
          </div>

          {bannerImages.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {bannerImages.map((img, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => { onChange(img.src); setShowPicker(false); }}
                  className="group relative rounded-md overflow-hidden border border-border hover:border-sky transition-colors"
                  title={img.label}
                >
                  <div className="aspect-[16/5]">
                    <img src={img.src} alt={img.label} className="w-full h-full object-cover" />
                  </div>
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-1">
                    <span className="text-white text-[9px] leading-tight line-clamp-1">{img.label}</span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {bannerImages.length === 0 && !showUrlInput && (
            <p className="text-xs text-foreground-faint text-center py-2">No banner images in library yet. Upload images in the Image Library, or paste a URL below.</p>
          )}

          {!showUrlInput ? (
            <button
              type="button"
              onClick={() => setShowUrlInput(true)}
              className="flex items-center gap-1 text-xs text-sky hover:text-sky-700 transition-colors"
            >
              <Link2 className="w-3 h-3" /> Or paste a URL
            </button>
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://example.com/image.jpg"
                className="flex-1 px-2 py-1.5 text-xs border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky"
              />
              <button
                type="button"
                onClick={() => { if (urlInput.trim()) { onChange(urlInput.trim()); setShowPicker(false); setUrlInput(""); setShowUrlInput(false); } }}
                className="px-3 py-1.5 text-xs bg-sky text-white rounded-md hover:bg-sky-700 transition-colors"
              >
                Use
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
