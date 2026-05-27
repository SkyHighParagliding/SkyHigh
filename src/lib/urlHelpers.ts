export function convertToDirectImageUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;

  const driveMatch = trimmed.match(/\/\/drive\.google\.com\/file\/d\/([^/]+)/);
  if (driveMatch && driveMatch[1]) {
    return `https://lh3.googleusercontent.com/d/${driveMatch[1]}`;
  }

  if (trimmed.includes("dropbox.com")) {
    if (trimmed.includes("dl=0")) {
      return trimmed.replace("dl=0", "raw=1");
    }
    if (!trimmed.includes("raw=1")) {
      return trimmed.includes("?") ? `${trimmed}&raw=1` : `${trimmed}?raw=1`;
    }
  }

  // Google Photos URLs (photos.google.com, photos.app.goo.gl) don't support direct linking.
  // Warn the user and return as-is (it will fail to render as an image).
  if (/photos\.google\.com|photos\.app\.goo\.gl/.test(trimmed)) {
    console.warn(
      "Google Photos URLs cannot be used as direct image sources. " +
      "Upload the image via the image picker instead."
    );
  }

  return trimmed;
}
