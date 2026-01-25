import * as kv from './kv_store.ts';

declare global {
  interface Window {
    Deno: {
      env: { get(key: string): string | undefined };
    };
  }
}

function getDeno(): { env: { get(key: string): string | undefined } } {
  try {
    if (typeof Deno !== 'undefined') return Deno as any;
    if (typeof window !== 'undefined' && (window as any).Deno) return (window as any).Deno as any;
    return { env: { get: (key: string) => (typeof process !== 'undefined' && (process as any).env ? (process as any).env[key] : '') } } as any;
  } catch {
    return { env: { get: (_key: string) => '' } } as any;
  }
}

export function siteUrl(): string {
  const deno = getDeno();
  return deno.env.get('SITE_URL') || deno.env.get('PUBLIC_SITE_URL') || deno.env.get('NEXT_PUBLIC_SITE_URL') || '';
}

export function safeRedirectUrl(path: string): string {
  const base = siteUrl();
  try {
    const u = new URL(base);
    u.protocol = 'https:';
    u.pathname = path;
    u.search = '';
    return u.toString();
  } catch {
    return '';
  }
}

export async function hashIdentity(input: string): Promise<string> {
  try {
    const enc = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest('SHA-256', enc);
    const arr = Array.from(new Uint8Array(digest));
    return arr.map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return Array.from(input).map((c) => c.charCodeAt(0).toString(16)).join('');
  }
}

export async function sendEmailResend(to: string, subject: string, html: string): Promise<boolean> {
  const deno = getDeno();
  const RESEND_API_KEY = deno.env.get('RESEND_API_KEY') || '';
  if (!RESEND_API_KEY) return false;
  try {
    const spec = 're' + 'send';
    const mod: any = await import(spec);
    const Resend = mod.Resend;
    const resend = new Resend(RESEND_API_KEY);
    let attempt = 0;
    const max = 3;
    let lastErr: any = null;
    while (attempt < max) {
      const { error } = await resend.emails.send({ from: 'EA Coder <no-reply@eacoder.app>', to: [to], subject, html });
      if (!error) return true;
      lastErr = error;
      await new Promise((r) => setTimeout(r, 250 * Math.pow(2, attempt)));
      attempt++;
    }
    const toHash = await hashIdentity(to);
    await kv.set(`audit:email:${Date.now()}:${toHash}`, { event: 'send_failed', to_hash: toHash, subject, error: String(lastErr?.message || lastErr) });
    return false;
  } catch (e: any) {
    const toHash = await hashIdentity(to);
    await kv.set(`audit:email:${Date.now()}:${toHash}`, { event: 'send_exception', to_hash: toHash, subject, error: String(e?.message || e) });
    return false;
  }
}

export async function consumeMagicToken(token: string): Promise<string> {
  const rec = await kv.get(`magic:${token}`);
  if (!rec || rec.used || Date.now() > rec.expires_at) throw new Error('invalid_or_expired');
  rec.used = true;
  rec.used_at = new Date().toISOString();
  await kv.set(`magic:${token}`, rec);
  const emailHash = await hashIdentity(rec.email);
  await kv.set(`magic:stats:${emailHash}:${Date.now()}`, { event: 'used', email_hash: emailHash });
  return rec.action_link as string;
}
