export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function isErrorPayload(data: unknown): data is { error?: string; message?: string } {
  return typeof data === 'object' && data !== null;
}

type RequestOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  signal?: AbortSignal;
};

async function request<T>(url: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', headers = {}, body, signal } = opts;

  const fetchHeaders: Record<string, string> = { ...headers };
  if (body !== undefined) {
    fetchHeaders['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, {
    method,
    headers: fetchHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });

  if (!res.ok) {
    let data: unknown;
    try {
      data = await res.json();
    } catch {}
    let msg = res.statusText;
    if (isErrorPayload(data)) {
      msg = data.error ?? data.message ?? res.statusText;
    }
    throw new ApiError(msg, res.status, data);
  }

  const text = await res.text();
  if (!text) return undefined as unknown as T;
  return JSON.parse(text) as T;
}

function authHeaders(token: string | null): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

type ExtraOpts = { headers?: Record<string, string>; signal?: AbortSignal };

export const api = {
  get<T>(url: string, token?: string | null, opts?: ExtraOpts): Promise<T> {
    return request<T>(url, { headers: { ...authHeaders(token ?? null), ...opts?.headers }, signal: opts?.signal });
  },

  post<T>(url: string, body?: unknown, token?: string | null, opts?: ExtraOpts): Promise<T> {
    return request<T>(url, {
      method: 'POST',
      headers: { ...authHeaders(token ?? null), ...opts?.headers },
      body,
      signal: opts?.signal,
    });
  },

  put<T>(url: string, body?: unknown, token?: string | null, opts?: ExtraOpts): Promise<T> {
    return request<T>(url, {
      method: 'PUT',
      headers: { ...authHeaders(token ?? null), ...opts?.headers },
      body,
      signal: opts?.signal,
    });
  },

  patch<T>(url: string, body?: unknown, token?: string | null, opts?: ExtraOpts): Promise<T> {
    return request<T>(url, {
      method: 'PATCH',
      headers: { ...authHeaders(token ?? null), ...opts?.headers },
      body,
      signal: opts?.signal,
    });
  },

  delete<T>(url: string, token?: string | null, opts?: ExtraOpts): Promise<T> {
    return request<T>(url, {
      method: 'DELETE',
      headers: { ...authHeaders(token ?? null), ...opts?.headers },
      signal: opts?.signal,
    });
  },
};
