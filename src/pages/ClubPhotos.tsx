import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useSettings } from "@/contexts/SettingsContext";
import { Camera, X, Upload, Loader2, CheckCircle, AlertCircle, Maximize } from "lucide-react";
import { api } from "@/lib/apiClient";

interface ImageEntry {
  wide?: string;
  banner?: string;
  sliderLg?: string;
  sliderSm?: string;
  sliderPortrait?: string;
}

type TileSize = "large" | "tall" | "wide" | "medium" | "small";

interface GridTile {
  src: string;
  size: TileSize;
  colSpan: number;
  rowSpan: number;
  entryIndex: number;
}

function seededRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const ASPECT_MAP: Record<string, number> = {
  wide: 900 / 506,
  banner: 900 / 281,
  sliderLg: 600 / 400,
  sliderSm: 450 / 300,
  sliderPortrait: 267 / 400,
};

const PREFERRED_FIELDS: (keyof ImageEntry)[] = ["wide", "sliderLg", "sliderPortrait", "sliderSm", "banner"];

const BEST_RES_ORDER: (keyof ImageEntry)[] = ["wide", "banner", "sliderLg", "sliderSm", "sliderPortrait"];

function pickSize(aspect: number, rng: () => number): TileSize {
  const r = rng();
  if (aspect > 2.5) return "wide";
  if (aspect < 0.8) return "tall";
  if (r < 0.12) return "large";
  if (r < 0.35) return "wide";
  if (r < 0.55) return "tall";
  if (r < 0.78) return "medium";
  return "small";
}

const SIZE_SPANS: Record<TileSize, { col: number; row: number }> = {
  large:  { col: 2, row: 2 },
  tall:   { col: 1, row: 2 },
  wide:   { col: 2, row: 1 },
  medium: { col: 1, row: 1 },
  small:  { col: 1, row: 1 },
};

function buildGridTiles(library: ImageEntry[]): GridTile[] {
  const rng = seededRng(42);
  const tiles: GridTile[] = [];
  const usedSrcs = new Set<string>();

  for (let idx = 0; idx < library.length; idx++) {
    const entry = library[idx];
    for (const field of PREFERRED_FIELDS) {
      const src = entry[field];
      if (src && !usedSrcs.has(src)) {
        usedSrcs.add(src);
        const aspect = ASPECT_MAP[field] || 1.5;
        const size = pickSize(aspect, rng);
        const spans = SIZE_SPANS[size];
        tiles.push({ src, size, colSpan: spans.col, rowSpan: spans.row, entryIndex: idx });
      }
    }
  }

  const shuffled = [...tiles];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled;
}

const COLS = 12;
const ROW_H = 180;
const GAP = 6;

interface PlacedTile extends GridTile {
  gridCol: number;
  gridRow: number;
}

function placeOnGrid(tiles: GridTile[], numCols: number): { placed: PlacedTile[]; totalRows: number } {
  const grid: boolean[][] = [];

  function ensureRows(r: number) {
    while (grid.length <= r) {
      grid.push(new Array(numCols).fill(false));
    }
  }

  function canPlace(col: number, row: number, cSpan: number, rSpan: number): boolean {
    if (col + cSpan > numCols) return false;
    ensureRows(row + rSpan - 1);
    for (let r = row; r < row + rSpan; r++) {
      for (let c = col; c < col + cSpan; c++) {
        if (grid[r][c]) return false;
      }
    }
    return true;
  }

  function markPlaced(col: number, row: number, cSpan: number, rSpan: number) {
    ensureRows(row + rSpan - 1);
    for (let r = row; r < row + rSpan; r++) {
      for (let c = col; c < col + cSpan; c++) {
        grid[r][c] = true;
      }
    }
  }

  const placed: PlacedTile[] = [];

  for (const tile of tiles) {
    let didPlace = false;
    const cSpan = Math.min(tile.colSpan, numCols);
    const rSpan = tile.rowSpan;

    for (let row = 0; !didPlace; row++) {
      ensureRows(row);
      for (let col = 0; col <= numCols - cSpan; col++) {
        if (canPlace(col, row, cSpan, rSpan)) {
          markPlaced(col, row, cSpan, rSpan);
          placed.push({ ...tile, colSpan: cSpan, rowSpan: rSpan, gridCol: col + 1, gridRow: row + 1 });
          didPlace = true;
          break;
        }
      }
    }
  }

  return { placed, totalRows: grid.length };
}

function getBestSrc(entry: ImageEntry): string {
  for (const field of BEST_RES_ORDER) {
    if (entry[field]) return entry[field]!;
  }
  return "";
}

export function ClubPhotos() {
  const { settings, loading } = useSettings();
  const [gridCols, setGridCols] = useState(COLS);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ success: boolean; message: string } | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [photographerName, setPhotographerName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [lightboxFullscreen, setLightboxFullscreen] = useState(false);
  const lightboxRef = useRef<HTMLDivElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setSelectedFiles(prev => {
      const updated = [...prev, ...files].slice(0, 10);
      previewUrls.forEach(u => URL.revokeObjectURL(u));
      setPreviewUrls(updated.map(f => URL.createObjectURL(f)));
      return updated;
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (index: number) => {
    if (previewUrls[index]) URL.revokeObjectURL(previewUrls[index]);
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    setPreviewUrls(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (selectedFiles.length === 0) return;
    setSubmitting(true);
    setSubmitResult(null);
    try {
      const formData = new FormData();
      for (const file of selectedFiles) {
        formData.append("images", file);
      }
      if (photographerName.trim()) {
        formData.append("photographerCredit", photographerName.trim());
      }
      const data = await api.post<{ submissions?: Array<{ status: string }> }>("/api/submissions", formData);
      const quarantined = data.submissions?.filter((s: any) => s.status === "quarantined").length || 0;
      const pending = data.submissions?.filter((s: any) => s.status === "pending").length || 0;
      let message = `${pending} image${pending !== 1 ? "s" : ""} submitted successfully!`;
      if (quarantined > 0) message += ` ${quarantined} image${quarantined !== 1 ? "s were" : " was"} flagged and will be reviewed separately.`;
      setSubmitResult({ success: true, message });
      previewUrls.forEach(u => URL.revokeObjectURL(u));
      setPreviewUrls([]);
      setSelectedFiles([]);
    } catch (e: any) {
      setSubmitResult({ success: false, message: e.message || "Failed to upload images" });
    }
    setSubmitting(false);
  };

  const closeModal = () => {
    setShowSubmitModal(false);
    previewUrls.forEach(u => URL.revokeObjectURL(u));
    setPreviewUrls([]);
    setSelectedFiles([]);
    setSubmitResult(null);
    setPhotographerName("");
  };

  const library = useMemo<ImageEntry[]>(() => {
    if (!settings.imageLibrary) return [];
    try {
      return JSON.parse(settings.imageLibrary);
    } catch {
      return [];
    }
  }, [settings.imageLibrary]);

  const reversedLibrary = useMemo(() => [...library].reverse(), [library]);
  const tiles = useMemo(() => buildGridTiles(reversedLibrary), [reversedLibrary]);

  const updateCols = useCallback(() => {
    const w = window.innerWidth;
    if (w < 480) setGridCols(3);
    else if (w < 640) setGridCols(4);
    else if (w < 1024) setGridCols(6);
    else if (w < 1536) setGridCols(8);
    else setGridCols(10);
  }, []);

  useEffect(() => {
    updateCols();
    window.addEventListener("resize", updateCols);
    return () => window.removeEventListener("resize", updateCols);
  }, [updateCols]);

  const { placed } = useMemo(() => placeOnGrid(tiles, gridCols), [tiles, gridCols]);

  const openLightbox = (tile: PlacedTile) => {
    const entry = reversedLibrary[tile.entryIndex];
    if (!entry) return;
    const best = getBestSrc(entry);
    if (best) {
      setLightboxSrc(best);
      setLightboxFullscreen(false);
    }
  };

  const closeLightbox = () => {
    if (lightboxFullscreen && document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    setLightboxSrc(null);
    setLightboxFullscreen(false);
  };

  const toggleFullscreen = async () => {
    if (!lightboxRef.current) return;
    try {
      if (!document.fullscreenElement) {
        await lightboxRef.current.requestFullscreen();
        setLightboxFullscreen(true);
      } else {
        await document.exitFullscreen();
        setLightboxFullscreen(false);
      }
    } catch {}
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        setLightboxFullscreen(false);
      }
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (!lightboxSrc) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLightbox();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [lightboxSrc]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky" />
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-background">
      <div className="pt-8 pb-12 px-1">
        <h1 className="text-3xl font-bold text-foreground text-center mb-8">
          SkyHigh Image Wall
        </h1>
        <div className="text-center mb-6">
          <button
            onClick={() => setShowSubmitModal(true)}
            className="inline-flex items-center gap-2 text-sky hover:text-sky-light transition-colors text-sm font-medium"
          >
            <Camera className="w-4 h-4" />
            Want to see your images here?
          </button>
        </div>
        {tiles.length === 0 && (
          <div className="flex items-center justify-center min-h-[200px] text-foreground-secondary text-sm">
            No photos available yet. Be the first to submit!
          </div>
        )}
        <div
          className="w-full"
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
            gridAutoRows: ROW_H,
            gap: GAP,
          }}
        >
          {placed.map((tile, i) => (
            <div
              key={i}
              className="overflow-hidden rounded-md cursor-pointer group"
              style={{
                gridColumn: `${tile.gridCol} / span ${tile.colSpan}`,
                gridRow: `${tile.gridRow} / span ${tile.rowSpan}`,
              }}
              onClick={() => openLightbox(tile)}
            >
              <img
                src={tile.src}
                alt=""
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                loading="lazy"
              />
            </div>
          ))}
        </div>
      </div>

      {lightboxSrc && (
        <div
          ref={lightboxRef}
          className="fixed inset-0 z-[60] flex items-center justify-center"
          onClick={(e) => { if (e.target === e.currentTarget) closeLightbox(); }}
          style={{ backgroundColor: "rgba(0,0,0,0.15)" }}
        >
          <div
            className="absolute inset-0"
            style={{
              backdropFilter: "blur(24px) saturate(1.2)",
              WebkitBackdropFilter: "blur(24px) saturate(1.2)",
              backgroundColor: "rgba(0,0,0,0.5)",
            }}
            onClick={closeLightbox}
          />

          <button
            onClick={closeLightbox}
            className="absolute top-4 right-4 z-[65] w-10 h-10 bg-black/50 hover:bg-black/70 rounded-full flex items-center justify-center text-white transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>

          <button
            onClick={toggleFullscreen}
            className="absolute bottom-4 right-4 z-[65] w-10 h-10 bg-black/50 hover:bg-black/70 rounded-full flex items-center justify-center text-white transition-colors"
            aria-label="Toggle fullscreen"
          >
            <Maximize className="w-5 h-5" />
          </button>

          <div className="relative z-[55] max-w-[92vw] max-h-[90vh] flex items-center justify-center">
            <img
              src={lightboxSrc}
              alt=""
              className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
              style={{ display: "block" }}
            />
          </div>
        </div>
      )}

      {showSubmitModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-border-faint">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-sky/10 rounded-xl flex items-center justify-center">
                  <Camera className="w-5 h-5 text-sky" />
                </div>
                <h2 className="text-xl font-bold text-foreground">Submit Your Photos</h2>
              </div>
              <button onClick={closeModal} className="p-2 hover:bg-muted rounded-lg">
                <X className="w-5 h-5 text-foreground-faint" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm text-foreground-secondary leading-relaxed">
                We'd love to feature your photos on our Image Wall! By uploading, you confirm you own the
                copyright and consent to minor adjustments such as colour balancing and cropping. All submissions
                are reviewed by our team before being published, so your images won't appear immediately.
              </p>

              {submitResult && (
                <div className={`flex items-start gap-3 p-3 rounded-lg text-sm ${submitResult.success ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
                  {submitResult.success ? <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" /> : <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />}
                  <span>{submitResult.message}</span>
                </div>
              )}

              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-border-faint rounded-xl p-6 text-center hover:border-sky hover:bg-sky/5 transition-colors cursor-pointer"
                >
                  <Upload className="w-8 h-8 text-foreground-faint mx-auto mb-2" />
                  <p className="text-sm font-medium text-foreground">Click to select photos</p>
                  <p className="text-xs text-foreground-faint mt-1">JPEG, PNG, WebP or HEIC — up to 15MB each, max 10 photos</p>
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Photographer Credit <span className="text-foreground-faint font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={photographerName}
                  onChange={(e) => setPhotographerName(e.target.value)}
                  placeholder="e.g. Jane Smith Photography"
                  maxLength={60}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border-faint bg-background text-foreground placeholder:text-foreground-faint focus:outline-none focus:ring-2 focus:ring-sky/30 focus:border-sky transition-colors"
                />
                <p className="text-xs text-foreground-faint mt-1">
                  Your name will appear as a small watermark on the image
                </p>
              </div>

              {selectedFiles.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">{selectedFiles.length} file{selectedFiles.length !== 1 ? "s" : ""} selected</p>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {selectedFiles.map((file, i) => (
                      <div key={i} className="relative aspect-square rounded-lg overflow-hidden bg-muted group">
                        <img
                          src={previewUrls[i] || ""}
                          alt={file.name}
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => removeFile(i)}
                          className="absolute top-1 right-1 w-6 h-6 bg-black/60 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 text-sm text-foreground-secondary hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={selectedFiles.length === 0 || submitting}
                  className="px-6 py-2 bg-sky hover:bg-sky-light text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      Submit {selectedFiles.length} Photo{selectedFiles.length !== 1 ? "s" : ""}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
