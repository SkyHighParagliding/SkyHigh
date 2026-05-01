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

  return trimmed;
}
