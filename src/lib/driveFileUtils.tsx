import { File, Image, FileSpreadsheet, Presentation, Film, Music, Archive, FileText } from "lucide-react";

/** Shared Google Drive file helpers, used by the Documents and Project-Edit pages. */

export function formatFileSize(bytes: number): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getMimeIcon(mimeType: string) {
  if (!mimeType) return <File className="w-4 h-4 text-foreground-faint" />;
  if (mimeType.startsWith("image/")) return <Image className="w-4 h-4 text-pink-500" />;
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel") || mimeType.includes("csv")) return <FileSpreadsheet className="w-4 h-4 text-emerald-600" />;
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint")) return <Presentation className="w-4 h-4 text-orange-500" />;
  if (mimeType.startsWith("video/")) return <Film className="w-4 h-4 text-purple-500" />;
  if (mimeType.startsWith("audio/")) return <Music className="w-4 h-4 text-accent" />;
  if (mimeType.includes("zip") || mimeType.includes("tar") || mimeType.includes("compressed")) return <Archive className="w-4 h-4 text-amber-600" />;
  if (mimeType.includes("pdf")) return <FileText className="w-4 h-4 text-red-500" />;
  return <File className="w-4 h-4 text-foreground-faint" />;
}

export function getShortType(mimeType: string): string {
  if (!mimeType) return "File";
  if (mimeType.includes("pdf")) return "PDF";
  if (mimeType.includes("word") || mimeType.includes("document")) return "Word";
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) return "Excel";
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint")) return "Slides";
  if (mimeType.startsWith("image/")) return mimeType.split("/")[1]?.toUpperCase() || "Image";
  if (mimeType.startsWith("video/")) return "Video";
  if (mimeType.startsWith("audio/")) return "Audio";
  if (mimeType.includes("zip") || mimeType.includes("compressed")) return "Archive";
  if (mimeType.includes("text/")) return "Text";
  return "File";
}
