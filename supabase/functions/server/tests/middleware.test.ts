import { assertEquals, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { withCorrelation, withTiming, getCorrelationId, respondError } from "../error_utils.ts";

function makeCtx() {
  const headers = new Headers();
  const res = new Response(null, { headers });
  const vars: Record<string, unknown> = {};
  return {
    req: {
      header: (name?: string) => (name ? undefined : new Map<string, string>()),
      method: 'GET',
      path: '/test',
    },
    res,
    set: (k: string, v: unknown) => { vars[k] = v; },
    get: (k: string) => vars[k],
    json: (payload: unknown, status = 200) => ({ payload, status }),
  } as any;
}

Deno.test('withCorrelation sets X-Correlation-ID header', async () => {
  const c = makeCtx();
  const next = () => Promise.resolve(c.res);
  await withCorrelation(c, next);
  const id = c.res.headers.get('X-Correlation-ID');
  assertMatch(String(id), /[a-z0-9-]{8,}/i);
  assertEquals(getCorrelationId(c), id);
});

Deno.test('withTiming sets X-Response-Time header', async () => {
  const c = makeCtx();
  // Ensure the slow threshold is high so kv logging doesn't run during test
  Deno.env.set('SLOW_REQUEST_MS', '999999');
  const next = async () => {
    // Simulate brief work
    await new Promise((r) => setTimeout(r, 5));
    return c.res;
  };
  await withTiming(c, next);
  const rt = c.res.headers.get('X-Response-Time');
  assertMatch(String(rt), /\d+ms/);
});

Deno.test('respondError returns sanitized error payload', async () => {
  const c = makeCtx();
  const result = await respondError(c, 403, 'ACCESS_DENIED', 'Access denied', { limit: 4, used: 4 });
  // respondError returns c.json(...) which our stub returns as an object
  assertEquals(result.status, 403);
  const payload = (result as any).payload;
  assertEquals(payload.error, 'Access denied');
  assertEquals(payload.code, 'ACCESS_DENIED');
  assertEquals(payload.limit, 4);
  assertEquals(payload.used, 4);
  assertMatch(String(payload.correlationId), /[a-z0-9-]{8,}/i);
});