import { getDemoRole } from './demoConfig';

/**
 * NOTE: This module patches window.fetch to intercept demo API calls.
 * `useDataUsage` (src/hooks/useDataUsage.ts) also patches window.fetch for
 * bandwidth tracking. If `installDemoInterceptor` runs first, the original
 * fetch captured here is the one before useDataUsage patches it, so data
 * usage tracking will correctly see the modified (intercepted) requests.
 *
 * If useDataUsage patches fetch first, then this interceptor captures
 * useDataUsage's wrapper as the original, and demo-intercepted requests
 * bypass data usage tracking.
 *
 * In practice, demo mode and data usage tracking don't overlap much, so
 * this ordering is low risk. If both are active, ensure this interceptor
 * runs AFTER useDataUsage to capture both layers correctly.
 */

let interceptorInstalled = false;

const DEMO_API_PREFIXES = [
  '/api/flights',
  '/api/retrievals',
  '/api/pilot-auth',
  '/api/map-messages',
];

function shouldInterceptUrl(url: string): boolean {
  try {
    const parsed = new URL(url, window.location.origin);
    return DEMO_API_PREFIXES.some(prefix => parsed.pathname.startsWith(prefix));
  } catch {
    return DEMO_API_PREFIXES.some(prefix => url.startsWith(prefix));
  }
}

function getDemoSessionFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('demoSession');
}

function getDemoToken(role: string): string {
  if (role.startsWith('duty')) {
    const num = role.replace(/\D/g, '') || '1';
    return `demo-token-duty-${num}`;
  }
  const numbered = role.match(/\d+/);
  return numbered ? `demo-token-${role.replace(/(\d+)/, '-$1')}` : `demo-token-${role}`;
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
