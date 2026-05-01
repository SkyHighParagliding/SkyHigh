import { getDemoRole } from './demoConfig';

let interceptorInstalled = false;

const DEMO_API_PREFIXES = [
  '/api/flights',
  '/api/retrievals',
  '/api/pilot-auth',
  '/api/map-messages',
];

function shouldInterceptUrl(url: string): boolean {
  return DEMO_API_PREFIXES.some(prefix => url.startsWith(prefix));
}

function getDemoSessionFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('demoSession');
}

function getDemoToken(role: string): string {
  if (role.startsWith('duty')) {
    return `demo-token-duty-${role.replace(/\D/g, '') || '1'}`;
  }
  return `demo-token-${role.replace(/(\d+)/, '-$1')}`;
}

export function installDemoInterceptor() {
  if (interceptorInstalled) return;

  const demoRole = getDemoRole();
  if (!demoRole) return;

  const demoToken = getDemoToken(demoRole);
  interceptorInstalled = true;
  const originalFetch = window.fetch.bind(window);

  window.fetch = function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);

    if (shouldInterceptUrl(url)) {
      init = { ...init };
      const headers = new Headers(init.headers);
      headers.set('x-demo', 'true');
      headers.set('x-pilot-token', demoToken);
      headers.set('Authorization', `Bearer ${demoToken}`);
      const demoSession = getDemoSessionFromUrl();
      if (demoSession) {
        headers.set('x-demo-session', demoSession);
      }
      init.headers = headers;
      return originalFetch(url, init);
    }

    return originalFetch(input, init);
  } as typeof fetch;
}
