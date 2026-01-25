import * as kv from './kv_store.ts';

// Lightweight env access compatible with Edge runtime and tests
const envGet = (key: string): string | undefined => {
  try {
    const hasEnv = typeof Deno !== 'undefined' && typeof (Deno as { env?: { get?: (k: string) => string | undefined } }).env?.get === 'function';
    return hasEnv ? (Deno as { env: { get: (k: string) => string | undefined } }).env.get(key) : undefined;
  } catch {
    return undefined;
  }
};

type LogLevel = 'debug' | 'info' | 'warn' | 'error';
const levelOrder: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function effectiveLogLevel(): LogLevel {
  const envLevel = (envGet('LOG_LEVEL') || '').toLowerCase() as LogLevel;
  const nodeEnv = (envGet('NODE_ENV') || envGet('ENV') || '').toLowerCase();
  const isProd = nodeEnv === 'production';
  return envLevel || (isProd ? 'warn' : 'debug');
}

function canLog(level: LogLevel): boolean {
  const eff = effectiveLogLevel();
  return levelOrder[level] >= levelOrder[eff];
}

export function generateCorrelationId(): string {
  try {
    return typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

type HeadersLike = { set(name: string, value: string): void };
type HeaderFn = {
  (name: string): string | undefined;
  (): Record<string, string>;
};
type ReqLike = { header: HeaderFn; path: string; method: string; url?: string };
type CtxLike = {
  req: ReqLike;
  res: { headers: HeadersLike };
  json: (body: Record<string, unknown>, status?: number) => Response;
  set: (key: string, value: string) => void;
  get: (key: string) => string | undefined;
};

export async function withCorrelation(c: CtxLike, next: () => Promise<void>) {
  const headerId = c.req.header('X-Correlation-ID');
  const id = headerId || generateCorrelationId();
  c.set('correlationId', id);
  await next();
  try { c.res.headers.set('X-Correlation-ID', id); } catch { void 0; }
  return;
}

// Simple timing middleware to record response time and flag slow requests
export async function withTiming(c: CtxLike, next: () => Promise<void>) {
  const start = Date.now();
  await next();
  const elapsed = Date.now() - start;
  try { c.res.headers.set('X-Response-Time', `${elapsed}ms`); } catch { void 0; }
  const slowMs = Number(envGet('SLOW_REQUEST_MS') || 1000);
  if (elapsed >= slowMs) {
    try {
      await kv.set(`log:slow:${Date.now()}`, {
        event: 'slow_request',
        route: c.req.path,
        method: c.req.method,
        elapsedMs: elapsed,
        thresholdMs: slowMs,
        timestamp: new Date().toISOString(),
      });
    } catch { void 0; }
    if (canLog('warn')) console.warn('[SlowRequest]', c.req.path, `${elapsed}ms`);
  }
  return;
}

export function getCorrelationId(c: CtxLike): string {
  return c.get('correlationId') || c.req.header('X-Correlation-ID') || generateCorrelationId();
}

export async function logServerError(c: CtxLike, status: number, code: string, userMessage: string, details?: Record<string, unknown>) {
  const correlationId = getCorrelationId(c);
  const nowIso = new Date().toISOString();
  const route = c.req.path;
  const method = c.req.method;
  const authHeader = c.req.header('Authorization') || '';
  // Minimal request context to aid debugging; avoid logging sensitive payloads
  const entry = {
    event: 'error',
    correlationId,
    route,
    method,
    status,
    code,
    timestamp: nowIso,
    request: {
      hasAuth: !!authHeader,
      authPreview: authHeader ? authHeader.slice(0, 16) + '...' : null,
      headers: [],
    },
    message: userMessage,
    ...(details || {}),
  } as Record<string, unknown>;

  try {
    await kv.set(`log:error:${correlationId}:${Date.now()}`, entry);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (canLog('warn')) console.warn('[ErrorLog] kv.set failed', msg);
  }

  // Console logging controlled by level
  if (canLog('error')) console.error('[Error]', entry);
}

export function respondError(c: CtxLike, status: number, code: string, userMessage: string, details?: Record<string, unknown>) {
  const correlationId = getCorrelationId(c);
  const category = status >= 500 ? 'server' : 'client';
  // Persist detailed log entry
  logServerError(c, status, code, userMessage, {
    category,
    ...(details || {}),
  }).catch(() => {});
  // Always return sanitized payload to client
  const payload: Record<string, unknown> = {
    error: userMessage,
    code,
    correlationId,
    status,
  };
  if (details && typeof (details as Record<string, unknown>)['redirect'] === 'string') {
    payload.redirect = (details as Record<string, unknown>)['redirect'] as string;
  }
  // Optionally include numeric limit/used for client-side UX on quotas
  if (details && typeof (details as Record<string, unknown>)['limit'] === 'number') {
    payload.limit = (details as Record<string, unknown>)['limit'] as number;
  }
  if (details && typeof (details as Record<string, unknown>)['used'] === 'number') {
    payload.used = (details as Record<string, unknown>)['used'] as number;
  }
  return c.json(payload, status);
}
