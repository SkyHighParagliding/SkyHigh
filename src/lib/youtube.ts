const ALLOWED_YT_HOSTS = new Set(["youtu.be", "youtube.com", "www.youtube.com", "m.youtube.com"]);

export function extractVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    if (!ALLOWED_YT_HOSTS.has(u.hostname)) return null;
    if (u.hostname === "youtu.be") return u.pathname.slice(1).split("/")[0] || null;
    const v = u.searchParams.get("v");
    if (v) return v;
    const segments = u.pathname.split("/");
    for (const key of ["shorts", "embed", "v"]) {
      const idx = segments.indexOf(key);
      if (idx !== -1 && segments[idx + 1]) return segments[idx + 1];
    }
  } catch {}
  return null;
}
