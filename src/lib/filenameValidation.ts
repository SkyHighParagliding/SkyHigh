const EXEMPT_CATEGORIES = ["09", "10"];

const DATE_PREFIX_REGEX = /^\d{4}-\d{2}-\d{2}_/;
const VALID_FILENAME_REGEX = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])_[A-Za-z0-9][A-Za-z0-9_]*$/;

export function isValidFilename(filename: string): boolean {
  const nameWithoutExt = stripExtension(filename);
  return VALID_FILENAME_REGEX.test(nameWithoutExt);
}

export function isExemptCategory(categoryCode: string): boolean {
  return EXEMPT_CATEGORIES.includes(categoryCode);
}

export function generateCorrectedFilename(filename: string): string {
  const ext = getExtension(filename);
  let nameWithoutExt = stripExtension(filename);

  let datePrefix = "";
  if (DATE_PREFIX_REGEX.test(nameWithoutExt)) {
    const match = nameWithoutExt.match(/^(\d{4}-\d{2}-\d{2})_(.*)$/);
    if (match) {
      const [y, m, d] = match[1].split("-").map(Number);
      if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        datePrefix = match[1];
        nameWithoutExt = match[2];
      }
    }
  }

  if (!datePrefix) {
    datePrefix = getTodayISO();
  }

  let cleaned = nameWithoutExt
    .replace(/[^A-Za-z0-9_ -]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!cleaned) {
    cleaned = "Document";
  }

  return `${datePrefix}_${cleaned}${ext}`;
}

/**
 * Rename a File object. Falls back to a Blob with a name property if the
 * File constructor is unavailable (e.g. in some older environments). The
 * fallback Blob passes `name` checks but fails `instanceof File`.
 */
export function renameFile(file: File, newName: string): File {
  try {
    return new File([file], newName, { type: file.type, lastModified: file.lastModified });
  } catch {
    const blob = new Blob([file], { type: file.type }) as Blob & { name: string; lastModified: number };
    blob.name = newName;
    blob.lastModified = file.lastModified || Date.now();
    return blob as unknown as File;
  }
}

function getTodayISO(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot === -1 || lastDot === 0) return "";
  return filename.substring(lastDot);
}

function stripExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  if (lastDot === -1 || lastDot === 0) return filename;
  return filename.substring(0, lastDot);
}
