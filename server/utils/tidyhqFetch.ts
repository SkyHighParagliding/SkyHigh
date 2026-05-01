export async function tidyhqFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = process.env.TIDYHQ_ACCESS_TOKEN;
  if (!token) {
    throw new Error("TIDYHQ_ACCESS_TOKEN is not set in environment secrets");
  }

  const fullUrl = url.startsWith("http") ? url : `https://api.tidyhq.com/v1${url}`;

  const r = await fetch(fullUrl, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token}`,
    },
  });

  if (r.status === 401) {
    const separator = fullUrl.includes("?") ? "&" : "?";
    const fallbackUrl = `${fullUrl}${separator}access_token=${encodeURIComponent(token)}`;
    const r2 = await fetch(fallbackUrl, options);
    return r2;
  }

  return r;
}
