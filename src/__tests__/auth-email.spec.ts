import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../supabase/functions/server/kv_store.ts', () => {
  const store = new Map<string, any>();
  return {
    set: async (k: string, v: any) => { store.set(k, v); },
    get: async (k: string) => store.get(k),
    del: async (k: string) => { store.delete(k); },
    getByPrefix: async (p: string) => Array.from(store.entries()).filter(([k]) => k.startsWith(p)).map(([,v]) => v),
    mset: async (entries: [string, any][]) => { entries.forEach(([k,v]) => store.set(k, v)); },
    mget: async (ks: string[]) => ks.map(k => store.get(k)),
    mdel: async (ks: string[]) => { ks.forEach(k => store.delete(k)); },
  };
});

vi.mock('resend', () => {
  let idx = 0;
  const emails = {
    send: vi.fn(async () => {
      const seq = (globalThis as any).__resend_sequence__ || [];
      const cur = seq[idx] ?? { error: null };
      idx++;
      return cur;
    })
  };
  class ResendMock {
    apiKey: string;
    emails = emails;
    constructor(apiKey: string) { this.apiKey = apiKey; idx = 0; }
  }
  return { Resend: ResendMock };
});

import { safeRedirectUrl, sendEmailResend, consumeMagicToken } from '../supabase/functions/server/auth_utils';

describe('Auth email utilities', () => {
  beforeEach(() => {
    (globalThis as any).window = (globalThis as any).window || {};
    (globalThis as any).window.Deno = {
      env: {
        get: (key: string) => {
          if (key === 'SITE_URL') return 'http://example.com';
          if (key === 'RESEND_API_KEY') return 'test_key';
          return '';
        },
      },
    };
  });

  it('safeRedirectUrl enforces https and path', () => {
    const url = safeRedirectUrl('/auth/reset-callback');
    expect(url).toBe('https://example.com/auth/reset-callback');
  });

  it('sendEmailResend sends email with retries', async () => {
    (globalThis as any).__resend_sequence__ = [
      { error: { message: 'fail' } },
      { error: { message: 'fail2' } },
      { error: null }
    ];
    const ok = await sendEmailResend('user@example.com', 'Subject', '<p>Test</p>');
    expect(ok).toBe(true);
  });

  it('consumeMagicToken enforces single-use with expiry', async () => {
    const token = 'tok123';
    const now = Date.now();
    const action = 'https://supabase.example/action';
    const kv = await import('../supabase/functions/server/kv_store');
    await kv.set(`magic:${token}`, { email: 'user@example.com', action_link: action, expires_at: now + 10000, used: false });
    const link = await consumeMagicToken(token);
    expect(link).toBe(action);
    await expect(consumeMagicToken(token)).rejects.toThrow();
  });
});
