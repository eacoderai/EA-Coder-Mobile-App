import { getFunctionUrl } from '../utils/supabase/client';
import { toast } from './tieredToast';
import { shouldShowLimitToast } from './limits';

interface FetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  accessToken?: string | null;
  retries?: number; // number of retries on non-2xx
  retryDelayMs?: number; // base delay
  toast?: 'auto' | 'always' | 'never'; // automatic toast mapping on errors
}

function buildUrl(path: string) {
  // Always route through Supabase function URL for all environments
  return getFunctionUrl(path);
}

export async function apiFetch<T = any>(
  path: string,
  {
    method = 'GET',
    headers = {},
    body,
    accessToken,
    retries = 1,
    retryDelayMs = 300,
    toast: toastMode = 'auto',
  }: FetchOptions = {}
): Promise<T> {
  const url = buildUrl(path);
  const finalHeaders: Record<string, string> = {
    Accept: 'application/json',
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    ...headers,
  };

  const init: RequestInit = {
    method,
    headers: finalHeaders,
    cache: 'no-store',
    ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
  };

  let attempt = 0;
  const start = performance.now();
  if (import.meta.env.DEV) {
    console.log('[API] Request', { url, method, headers: finalHeaders, body: body ? '[payload]' : null });
  }
  while (attempt <= retries) {
    try {
      const response = await fetch(url, init);
      const elapsed = Math.round(performance.now() - start);
      if (import.meta.env.DEV) {
        console.log('[API] Response', { url, status: response.status, elapsedMs: elapsed });
      }
      if (!response.ok) {
        const text = await response.text();
        // Attempt to parse structured error JSON
        let parsed: any = null;
        try { parsed = JSON.parse(text); } catch {}
        const message = parsed?.error || `Request failed (${response.status})`;
        const error: any = new Error(message);
        error.status = response.status;
        error.statusText = response.statusText;
        error.bodyPreview = text.slice(0, 500);
        if (parsed && typeof parsed.redirect === 'string') error.redirect = parsed.redirect;
        if (parsed && typeof parsed.limit === 'number') error.limit = parsed.limit;
        if (parsed && typeof parsed.used === 'number') error.used = parsed.used;
        if (parsed && Array.isArray(parsed.errors)) error.errors = parsed.errors;

        // Only show toasts on the final attempt
        const shouldToast = toastMode !== 'never' && (toastMode === 'always' || attempt >= retries);
        if (shouldToast) {
          try {
            const status = response.status;
            // Quota/limit UX if server included telemetry
            if (typeof error.limit === 'number' && typeof error.used === 'number') {
              if (error.used >= error.limit) {
                toast.info('Limit reached — upgrade for unlimited strategy creation and weekly analysis.', { audience: 'free', tag: 'limit_reached' });
              } else if (error.used === error.limit - 1) {
                toast.info('You’re almost out — upgrade to get unlimited strategy creation and weekly analysis.', { audience: 'free', tag: 'limit_almost' });
              }
            }

            // Friendly mappings for common statuses
            if (status === 401) {
              // Session expired or unauthenticated
              toast.info('Your session expired. Please sign in again.');
            } else if (status === 403) {
              // Access denied (403). Suppressing premium upsell toast per requirements.
            } else if (status === 404) {
              toast.error('Requested resource not found');
            } else if (status === 429) {
              toast.error(message || 'Too many requests. Please wait a bit and try again.');
            } else if (status >= 500) {
              toast.error('Something went wrong. Please try again.');
            }
          } catch (toastErr) {
            console.warn('[API] Toast mapping failed', (toastErr as any)?.message || toastErr);
          }
        }

        if (attempt < retries) {
          const wait = retryDelayMs * Math.pow(2, attempt);
          console.warn('[API] Retrying', { url, attempt: attempt + 1, waitMs: wait });
          await new Promise(r => setTimeout(r, wait));
          attempt++;
          continue;
        }
        throw error;
      }
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        return (await response.json()) as T;
      }
      // fallback: return text
      return (await response.text()) as T;
    } catch (e: any) {
      if (attempt < retries) {
        const wait = retryDelayMs * Math.pow(2, attempt);
        console.warn('[API] Retry due to exception', { url, attempt: attempt + 1, waitMs: wait, error: e?.message });
        await new Promise(r => setTimeout(r, wait));
        attempt++;
        continue;
      }
      throw e;
    }
  }
  throw new Error('Unreachable');
}
