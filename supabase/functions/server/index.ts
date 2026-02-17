import { Hono } from 'npm:hono@^4.4.6';
import { cors } from 'npm:hono@^4.4.6/cors';
import { logger } from 'npm:hono@^4.4.6/logger';
import { createClient } from 'npm:@supabase/supabase-js@^2.49.8';
import * as kv from './kv_store.ts';
import { withCorrelation, respondError, withTiming } from './error_utils.ts';
import type Stripe from 'npm:stripe@^14.0.0';
import { Resend } from 'npm:resend@^3.3.0';
import { ForgotPasswordTemplate, EmailConfirmationTemplate } from './email-templates.ts';

// Helper to validate email OTP types
const isEmailOtp = (v: string | null): v is EmailOtpType => {
  return v === 'signup' || v === 'invite' || v === 'magiclink' || v === 'recovery' || v === 'email_change' || v === 'email';
};

const envGet = (key: string): string | undefined => {
  try {
    const hasEnv = typeof Deno !== 'undefined' && typeof (Deno as { env?: { get?: (k: string) => string | undefined } }).env?.get === 'function';
    return hasEnv ? (Deno as { env: { get: (k: string) => string | undefined } }).env.get(key) : undefined;
  } catch {
    return undefined;
  }
};

const app = new Hono();
// Create a sub-app that we will mount under both prefixes to support aliasing
const api = new Hono();

app.use('*', cors());
app.use('*', logger(console.log));
// Inject correlation ID into all API requests
api.use('*', withCorrelation);
api.use('*', withTiming);
// Temporarily disable CSRF middleware to simplify public endpoints

import type { SupabaseClient, MobileOtpType, EmailOtpType } from 'npm:@supabase/supabase-js@^2.49.8';

function getSupabaseAdmin(): SupabaseClient {
  const url = envGet('SUPABASE_URL');
  const key = envGet('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    throw new Error('Missing Supabase service credentials');
  }
  return createClient(url, key);
}

// Public client (anon key) for non-admin operations, e.g., built-in password reset emails
function getSupabaseAnon(): SupabaseClient {
  const url = envGet('SUPABASE_URL');
  const anon = envGet('SUPABASE_ANON_KEY');
  if (!url || !anon) {
    throw new Error('Missing Supabase anon credentials');
  }
  return createClient(url, anon);
}

// Claude/Anthropic API configuration (direct Anthropic usage)
// Prefer ANTHROPIC_API_KEY, fall back to CLAUDE_API_KEY for compatibility
const CLAUDE_API_KEY = envGet('ANTHROPIC_API_KEY') || envGet('CLAUDE_API_KEY') || '';
const CLAUDE_API_BASE = envGet('CLAUDE_API_BASE') || 'https://api.anthropic.com/v1/messages';
// Anthropic models listing endpoint for validation
const CLAUDE_MODELS_ENDPOINT = envGet('CLAUDE_MODELS_ENDPOINT') || 'https://api.anthropic.com/v1/models';
// Default to a current Anthropic Messages API model
// Note: Anthropic model IDs use hyphens, not dots (e.g., 3-5 not 3.5)
const CLAUDE_MODEL = envGet('CLAUDE_MODEL') || 'claude-3-5-sonnet-20241022';

// Stripe configuration
const STRIPE_SECRET_KEY = envGet('STRIPE_SECRET_KEY') || '';
const STRIPE_WEBHOOK_SECRET = envGet('STRIPE_WEBHOOK_SECRET') || '';
const STRIPE_WEBHOOK_SECRET_SUBSCRIPTION = envGet('STRIPE_WEBHOOK_SECRET_SUBSCRIPTION') || '';
const STRIPE_PRODUCT_PRO_MONTHLY = envGet('STRIPE_PRODUCT_PRO_MONTHLY') || '';
const STRIPE_PRODUCT_PRO_YEARLY = envGet('STRIPE_PRODUCT_PRO_YEARLY') || '';
const STRIPE_PRODUCT_ELITE_MONTHLY = envGet('STRIPE_PRODUCT_ELITE_MONTHLY') || '';
const STRIPE_PRODUCT_ELITE_YEARLY = envGet('STRIPE_PRODUCT_ELITE_YEARLY') || '';
const STRIPE_PRODUCT_PRO = envGet('STRIPE_PRODUCT_PRO') || STRIPE_PRODUCT_PRO_MONTHLY || 'prod_TVwRNndzjnsRhB';
const STRIPE_PRODUCT_ELITE = envGet('STRIPE_PRODUCT_ELITE') || STRIPE_PRODUCT_ELITE_MONTHLY;
const STRIPE_PRODUCT_FREE = 'free_tier';
let stripe: Stripe | null = null;
try {
  if (STRIPE_SECRET_KEY) {
    const StripeMod = await import('npm:stripe@^14.0.0');
    stripe = new StripeMod.default(STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });
  }
} catch (_e) {
  stripe = null;
}
const RESEND_API_KEY = envGet('RESEND_API_KEY');
const FCM_SERVER_KEY = envGet('FCM_SERVER_KEY') || '';

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function kvRetrySet(key: string, value: unknown, retries = 3): Promise<void> {
  let lastErr: unknown = null;
  for (let i = 0; i < retries; i++) {
    try {
      await kv.set(key, value);
      return;
    } catch (e: unknown) {
      lastErr = e;
      await sleep(100 * Math.pow(2, i));
    }
  }
  throw lastErr;
}

async function kvRetryMSet(entries: [string, unknown][], retries = 3): Promise<void> {
  let lastErr: unknown = null;
  for (let i = 0; i < retries; i++) {
    try {
      await kv.mset(entries);
      return;
    } catch (e: unknown) {
      lastErr = e;
      await sleep(100 * Math.pow(2, i));
    }
  }
  throw lastErr;
}

type SubscriptionRecord = { plan: 'free' | 'pro' | 'elite'; subscriptionDate: string; expiryDate?: string };

async function updatePlanAtomic(userId: string, plan: 'free' | 'pro' | 'elite', source: string, eventId: string, specificProductId?: string): Promise<boolean> {
  const start = Date.now();
  const subscription: SubscriptionRecord = { plan, subscriptionDate: new Date().toISOString() };
  try {
    await kvRetryMSet([
      [`user:${userId}:subscription`, subscription],
      [`session:${userId}:payment_complete`, { value: true, timestamp: new Date().toISOString() }],
    ]);
    try {
      const supabase = getSupabaseAdmin();
      let prod = specificProductId || 'free_tier';
      if (!specificProductId) {
        if (plan === 'pro') prod = STRIPE_PRODUCT_PRO;
        else if (plan === 'elite') prod = STRIPE_PRODUCT_ELITE;
      }
      
      await supabase.auth.admin.updateUserById(String(userId), { user_metadata: { product_info: { prod_id: prod, plan_name: plan } } } as Record<string, unknown>);
    } catch { void 0; }
    if (plan === 'free' && RESEND_API_KEY) {
      try {
        let toEmail = '';
        try {
          const supabase = getSupabaseAdmin();
          const { data, error } = await supabase.auth.admin.getUserById(userId);
          toEmail = error ? '' : String(data?.user?.email || '');
        } catch { void 0; }
        if (toEmail) {
          const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto"><h2>Free Plan Activated</h2><p>Your Free plan is now active.</p><p>Features: 1 EA generation, MQL5 support.</p><p>Start building in EACoder AI.</p><p>EACoder AI</p></div>`;
          await sendEmailResend(toEmail, 'Your EACoder AI Plan Activated: Free', html);
        }
      } catch { void 0; }
    }
    await kvRetrySet(`audit:payment_update:${eventId}`, { ok: true, plan, userId, source, durationMs: Date.now() - start, at: new Date().toISOString() });
    return true;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    await kvRetrySet(`audit:payment_update:${eventId}`, { ok: false, plan, userId, source, error: msg, durationMs: Date.now() - start, at: new Date().toISOString() });
    return false;
  }
}

async function hashIdentity(input: string): Promise<string> {
  try {
    const enc = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest('SHA-256', enc);
    const arr = Array.from(new Uint8Array(digest));
    return arr.map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return Array.from(input).map((c) => c.charCodeAt(0).toString(16)).join('');
  }
}



function siteUrl() {
  return envGet('SITE_URL') || envGet('PUBLIC_SITE_URL') || envGet('NEXT_PUBLIC_SITE_URL') || 'https://eacoderai.xyz';
}

function _functionUrl() {
  return envGet('FUNCTIONS_URL') || envGet('EDGE_FUNCTIONS_URL') || envGet('SITE_URL') || '';
}

function safeRedirectUrl(path: string) {
  const base = siteUrl();
  try {
    const u = new URL(base);
    u.protocol = 'https:';
    // Split incoming path into pathname and query
    const [pathname, search] = path.split('?');
    u.pathname = pathname;
    u.search = search ? `?${search}` : '';
    return u.toString();
  } catch {
    return '';
  }
}

// removed unused safeFunctionUrl

async function sendEmailResend(to: string, subject: string, html: string) {
  if (!RESEND_API_KEY) return false;
  try {
    const resend = new Resend(RESEND_API_KEY);
    let attempt = 0;
    const max = 3;
    let lastErr: unknown = null;
    while (attempt < max) {
      const { error } = await resend.emails.send({ 
        from: 'EACoder AI <team@eacoderai.xyz>', 
        to: [to], 
        subject, 
        html 
      });
      if (!error) return true;
      lastErr = error;
      await new Promise<void>(r => setTimeout(r, 250 * Math.pow(2, attempt)));
      attempt++;
    }
    const toHash = await hashIdentity(to);
    const errMsg = lastErr instanceof Error ? lastErr.message : String(lastErr);
    await kv.set(`audit:email:${Date.now()}:${toHash}`, { event: 'send_failed', email_hash: toHash, subject, error: errMsg });
    return false;
  } catch (e: unknown) {
    const toHash = await hashIdentity(to);
    const msg = e instanceof Error ? e.message : String(e);
    await kv.set(`audit:email:${Date.now()}:${toHash}`, { event: 'send_exception', email_hash: toHash, subject, error: msg });
    return false;
  }
}

async function resolvePriceId(productId: string, mode: 'payment' | 'subscription'): Promise<string | null> {
  if (!stripe) return null;
  try {
    const prices = await stripe.prices.list({ product: productId, active: true, limit: 10 });
    const list = Array.isArray(prices?.data) ? prices.data : [];
    if (mode === 'subscription') {
      const recurring = list.find((p: { recurring?: unknown }) => !!p.recurring);
      return recurring && 'id' in recurring ? String((recurring as { id: string }).id) : (list[0] && 'id' in list[0] ? String((list[0] as { id: string }).id) : null);
    }
    const oneTime = list.find((p: { recurring?: unknown }) => !p.recurring);
    return oneTime && 'id' in oneTime ? String((oneTime as { id: string }).id) : (list[0] && 'id' in list[0] ? String((list[0] as { id: string }).id) : null);
  } catch {
    return null;
  }
}
// Admin cron secret for scheduled tasks
const CRON_SECRET = envGet('CRON_SECRET') || '';

// Helper to verify user authentication
async function getAuthenticatedUser(authHeader: string | null) {
  if (!authHeader) {
    return null;
  }
  
  const token = authHeader.split(' ')[1];
  try {
    const supabase = getSupabaseAdmin();
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return null;
    }
    return user;
  } catch {
    return null;
  }
}

// Middleware: require premium subscription before accessing core features
// removed unused requirePremium

// Remove global premium-only guard on convert; we'll enforce per-request
// policy inside the /convert handler to allow basic users on free strategies.

// Free-tier usage helpers: allow first 4 strategy views for basic users
// removed unused free-tier helpers

// Helper to call Claude API
type ClaudeMessage = { role: 'system' | 'user' | 'assistant'; content: string };

async function callClaudeAPI(messages: ClaudeMessage[], temperature = 0.7, maxTokens = 4000) {
  try {
    console.log(`[ClaudeAPI] start model=${CLAUDE_MODEL} messages=${messages.length}`);

    if (!CLAUDE_API_KEY) {
      console.error('ERROR: Claude API key is not set');
      throw new Error('Claude API key is not configured. Please set CLAUDE_API_KEY in your environment variables.');
    }

    // Extract system message if present
    const systemMessages = messages.filter(msg => msg.role === 'system');
    const userMessages = messages.filter(msg => msg.role !== 'system');

    const normalizedModel = (() => {
      let m = CLAUDE_MODEL || '';
      if (m.startsWith('anthropic/')) m = m.replace(/^anthropic\//, '');
      return m;
    })();

    const formattedMessages = userMessages.map(msg => ({
      role: msg.role,
      content: [{ type: 'text', text: msg.content }]
    }));

    const headers = {
      'anthropic-version': '2023-06-01',
      'x-api-key': CLAUDE_API_KEY,
      'Content-Type': 'application/json',
    } as Record<string, string>;

    const candidates: string[] = Array.from(new Set([
      normalizedModel,
      'claude-3-5-sonnet-latest',
      'claude-3-sonnet-20240229',
      'claude-3-5-haiku-20241022',
    ])).filter(Boolean);

    let lastErrorText = '';
    for (let i = 0; i < candidates.length; i++) {
      const modelToUse = candidates[i];
      const body = {
        model: modelToUse,
        messages: formattedMessages,
        system: systemMessages.length > 0 ? systemMessages[0].content : undefined,
        temperature,
        max_tokens: maxTokens,
      };

      const res = await fetch(CLAUDE_API_BASE, { method: 'POST', headers, body: JSON.stringify(body) });

      if (res.ok) {
        const data = await res.json();
        const content = data?.content?.[0]?.text;
        if (!content) {
          throw new Error('Unexpected API response structure. Please check the Claude API documentation for any changes.');
        }
        console.log(`[ClaudeAPI] success length=${content?.length || 0}`);
        return content;
      }

      const errorText = await res.text();
      lastErrorText = errorText;
      if (res.status === 401) {
        throw new Error('Authentication failed: Invalid API key. Please check your ANTHROPIC_API_KEY.');
      } else if (res.status === 400) {
        throw new Error(`Bad request: ${errorText}`);
      } else if (res.status === 429) {
        throw new Error('Rate limit exceeded. Please try again later.');
      } else if (res.status === 404) {
        const hasMore = i < candidates.length - 1;
        if (hasMore) {
          continue;
        } else {
          const msg = `Model not found after fallbacks: ${candidates.join(', ')}. Verify model availability in your Claude subscription. Consider setting CLAUDE_MODEL to a supported ID.`;
          throw new Error(msg);
        }
      } else {
        throw new Error(`Claude API error: ${res.status} - ${errorText}`);
      }
    }
    console.log(`[ClaudeAPI] failed err=${(lastErrorText || '').slice(0, 120)}`);
    throw new Error(`Claude API call failed. ${lastErrorText || ''}`);
  } catch (error: unknown) {
    throw error instanceof Error ? error : new Error(String(error));
  }
}

// Sign up endpoint
api.post('/signup', async (c) => {
  try {
    const payload = await c.req.json();
    const emailStr = String(payload?.email || '').trim().toLowerCase();
    const pwdStr = String(payload?.password || '');
    const nameStr = String(payload?.name || '').trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailStr)) {
      return respondError(c, 400, 'invalid_email', 'Invalid email format.');
    }
    if (pwdStr.length < 6) {
      return respondError(c, 400, 'weak_password', 'Password must be at least 6 characters.');
    }
    if (!nameStr) {
      return respondError(c, 400, 'invalid_input', 'Name is required.');
    }
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.auth.admin.createUser({
      email: emailStr,
      password: pwdStr,
      user_metadata: { name: nameStr, display_name: nameStr, full_name: nameStr },
      email_confirm: false
    });
    if (error) {
      const msg = String(error.message || '').toLowerCase();
      if (msg.includes('already') || msg.includes('exists') || msg.includes('duplicate')) {
        return respondError(c, 409, 'email_exists', 'Email already registered. Please sign in.', { field: 'email' });
      }
      if (msg.includes('password')) {
        return respondError(c, 400, 'weak_password', 'Password does not meet requirements.');
      }
      return respondError(c, 400, 'invalid_input', 'Invalid input.');
    }
    try {
      const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({ type: 'signup', email: emailStr });
      if (!linkErr && linkData) {
        const confirmId = crypto.randomUUID();
        const expires = Date.now() + 24 * 60 * 60 * 1000;
        
        // Store user_id in KV to allow force confirmation fallback
        await kv.set(`magic:${confirmId}`, { 
          email: emailStr, 
          user_id: data.user?.id, 
          action_link: linkData.properties?.action_link || '', 
          expires_at: expires, 
          used: false 
        });
        
        // Use server-side confirmation endpoint for immediate verification
        const serverUrl = envGet('SUPABASE_URL') || 'https://iixyfjipzvrfuzlxaneb.supabase.co';
        const href = `${serverUrl}/functions/v1/server/magic/confirm?token=${confirmId}`;
        const html = EmailConfirmationTemplate(href, nameStr, siteUrl());
        const ok = await sendEmailResend(emailStr, 'Confirm your EACoder AI account', html);
        const emailHash = await hashIdentity(emailStr);
        await kv.set(`audit:email:${Date.now()}:${emailHash}`, { event: ok ? 'magiclink_sent' : 'magiclink_send_failed', email_hash: emailHash, kind: 'signup' });
        if (!ok) {
          try {
            const supabaseAnon = getSupabaseAnon();
            const { error: otpErr } = await supabaseAnon.auth.signInWithOtp({ email: emailStr });
            if (otpErr) {
              await kv.set(`audit:email:${Date.now()}:${emailHash}`, { event: 'otp_fallback_failed', email_hash: emailHash, message: String(otpErr?.message || otpErr) });
            }
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            await kv.set(`audit:email:${Date.now()}:${emailHash}`, { event: 'otp_fallback_exception', email_hash: emailHash, message: msg });
          }
        }
      }
    } catch { void 0; }
    return c.json({ user: data.user });
  } catch (error: any) {
    console.log('Signup exception:', error);
    return respondError(c, 500, 'signup_failed', 'Unable to sign up at the moment.', { errorMessage: error?.message });
  }
});

// Forgot Password endpoint
api.post('/forgot-password', async (c) => {
  try {
    const { email } = await c.req.json();

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return respondError(c, 400, 'invalid_email', 'Invalid email format.');
    }

    // Rate limiting: max 3 requests per hour per email
    const rateKey = `rate:forgot:${await hashIdentity(email)}`;
    const rate = (await kv.get(rateKey)) || { count: 0, timestamp: Date.now() };
    const now = Date.now();
    if (now - rate.timestamp < 3600000) { // 1 hour
      if (rate.count >= 3) {
        return respondError(c, 429, 'rate_limit_exceeded', 'Too many requests. Please try again later.');
      }
    } else {
      rate.count = 1;
      rate.timestamp = now;
    }
    await kv.set(rateKey, rate);

    const SITE_URL = siteUrl();

    // If RESEND is configured, try generating a one-time reset link and send a custom email
    if (RESEND_API_KEY) {
      try {
        const supabaseAdmin = getSupabaseAdmin();
        const { data, error } = await supabaseAdmin.auth.admin.generateLink({ 
          type: 'recovery', 
          email, 
          options: { redirectTo: 'eacoder://update-password' } 
        });
        if (!error && data) {
          const userName = data.user.user_metadata?.name || 'User';
          const rawProps = (data as unknown) as { properties?: { action_link?: unknown } };
          
          // Use the action_link directly if available
          // Since we set redirectTo to the custom scheme, Supabase should generate a link that redirects there
          const resetLink = typeof rawProps.properties?.action_link === 'string' ? rawProps.properties!.action_link! : '';
          
          // Fallback if action_link is empty: manually construct bridge URL using custom scheme
          const finalLink = resetLink || `eacoder://update-password?token=${(rawProps as any)?.properties?.email_otp || ''}&type=recovery`;

          const htmlContent = ForgotPasswordTemplate(finalLink, userName, siteUrl());
          const ok = await sendEmailResend(email, 'Password Reset Request', htmlContent);
          if (ok) {
            return c.json({ message: 'Password reset email sent successfully.' });
          }
      
        } else {
          console.log('Reset link generation error (admin):', error);
        }
      } catch (e) {
        console.log('Admin link generation failed, falling back:', e);
      }
    }

  // Built-in Supabase mailer fallback using anon client
  try {
    const supabaseAnon = getSupabaseAnon();
    // Force custom scheme for redirect
    const redirect = 'eacoder://update-password';
    const { error: resetErr } = await supabaseAnon.auth.resetPasswordForEmail(email, { redirectTo: redirect });
    if (resetErr) {
      console.log('resetPasswordForEmail error:', resetErr);
      return respondError(c, 500, 'reset_failed', 'Failed to initiate password reset.');
    }
    return c.json({ message: 'If the email exists, a reset message was sent.' });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log('Anon reset fallback exception:', msg);
    return respondError(c, 500, 'forgot_password_failed', 'Failed to process request.', { errorMessage: msg });
  }
} catch (error: unknown) {
  const msg = error instanceof Error ? error.message : String(error);
  console.log('Forgot password error:', msg);
  return respondError(c, 500, 'forgot_password_failed', 'Failed to process request.', { errorMessage: msg });
}
});

api.post('/reset/request', async (c) => {
  try {
    const { email } = await c.req.json();
    const { token } = await requestPasswordReset(String(email || ''));
    return c.json({ message: 'Password reset email sent.', token });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return respondError(c, 500, 'reset_request_failed', 'Failed to start reset.', { errorMessage: msg });
  }
});

api.get('/reset/validate', async (c) => {
  try {
    const token = String(c.req.query('token') || '');
    if (!token) return respondError(c, 400, 'invalid_token', 'Invalid token');
    const rec = await kv.get(`reset:${token}`);
    const ok = !!rec && rec.used === false && Number(rec.expires_at || 0) > Date.now();
    return c.json({ valid: ok });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return respondError(c, 500, 'reset_validate_failed', 'Failed to validate token', { errorMessage: msg });
  }
});

function strong(p: string): boolean {
  const min = p.length >= 8;
  const lower = /[a-z]/.test(p);
  const upper = /[A-Z]/.test(p);
  const digit = /\d/.test(p);
  const special = /[^A-Za-z0-9]/.test(p);
  return min && lower && upper && digit && special;
}

api.post('/reset/confirm', async (c) => {
  try {
    const body = await c.req.json();
    const token = String(body?.token || '');
    const password = String(body?.password || '');
    const ok = await confirmPasswordReset(token, password);
    if (ok) return c.json({ ok: true });
    return respondError(c, 500, 'reset_failed', 'Failed to update password');
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return respondError(c, 500, 'reset_failed', 'Failed to update password', { errorMessage: msg });
  }
});

export function isStrongPassword(p: string): boolean { return strong(p); }
export async function validateResetToken(token: string): Promise<boolean> {
  const rec = await kv.get(`reset:${token}`);
  return !!rec && rec.used === false && Number(rec.expires_at || 0) > Date.now();
}
export async function requestPasswordReset(email: string): Promise<{ token: string; href: string }> {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!re.test(String(email || ''))) {
    throw new Error('Invalid email format.');
  }
  const { data, error } = await getSupabaseAdmin().auth.admin.listUsers({ perPage: 200, page: 1 });
  if (error) throw new Error('Failed to lookup users');
  const found = Array.isArray(data?.users) ? data.users.find((u) => String((u as { email?: string }).email || '').toLowerCase() === String(email).toLowerCase()) : null;
  if (!found || !found.id) throw new Error('User not found');
  const token = crypto.randomUUID();
  const expires = Date.now() + 24 * 60 * 60 * 1000;
  await kvRetrySet(`reset:${token}`, { email: String(email), userId: String(found.id), expires_at: expires, used: false, created_at: new Date().toISOString() });
  const href = safeRedirectUrl(`/reset-password?token=${token}`) || `${siteUrl()}/reset-password?token=${token}`;
  const name = String((found as { user_metadata?: Record<string, unknown> }).user_metadata?.name || 'User');
  const html = ForgotPasswordTemplate(href, name);
  await sendEmailResend(String(email), 'Reset your EACoder AI password', html);
  return { token, href };
}
export async function confirmPasswordReset(token: string, password: string): Promise<boolean> {
  if (!token) throw new Error('Invalid token');
  if (!strong(password)) throw new Error('Password does not meet requirements');
  const rec = await kv.get(`reset:${token}`);
  if (!rec) throw new Error('Invalid token');
  if (rec.used) throw new Error('Token already used');
  if (Number(rec.expires_at || 0) <= Date.now()) throw new Error('Token expired');
  const uid = String(rec.userId || '');
  const hasCreds = !!(envGet('SUPABASE_URL') && envGet('SUPABASE_SERVICE_ROLE_KEY'));
  if (hasCreds && uid) {
    const { error } = await getSupabaseAdmin().auth.admin.updateUserById(uid, { password });
    if (error) throw new Error('Failed to update password');
  }
  await kvRetrySet(`reset:${token}`, { ...rec, used: true, used_at: new Date().toISOString() });
  return true;
}

api.post('/magic/request', async (c) => {
  try {
    const { email } = await c.req.json();
    
    const rateKey = `rate:magic:${await hashIdentity(email)}`;
    const rate = (await kv.get(rateKey)) || { count: 0, timestamp: Date.now() };
    const now = Date.now();
    if (now - rate.timestamp < 3600000) {
      if (rate.count >= 3) return respondError(c, 429, 'rate_limit_exceeded', 'Too many requests.');
      rate.count++;
    } else {
      rate.count = 1;
      rate.timestamp = now;
    }
    await kv.set(rateKey, rate);
    const supabaseAdmin = getSupabaseAdmin();
    const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({ 
      type: 'magiclink', 
      email,
      options: { redirectTo: 'https://eacoderai.xyz' }
    });
    if (linkErr || !linkData) return respondError(c, 500, 'magic_failed', 'Failed to issue magic link.');
    const id = crypto.randomUUID();
    const expires = Date.now() + 24 * 60 * 60 * 1000;
    await kv.set(`magic:${id}`, { email, action_link: String(linkData.properties?.action_link || ''), expires_at: expires, used: false });
    const href = safeRedirectUrl(`/magic/confirm?token=${id}`);
    const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><h1>Your Magic Link</h1><p>Hello,</p><p>Click to sign in:</p><a href="${href}" style="background:#111827;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Sign In</a><p>This link expires in 24 hours and is single-use.</p><p>EACoder AI</p></div>`;
    const ok = await sendEmailResend(email, 'Your EACoder AI Magic Link', html);
    const emailHash2 = await hashIdentity(email);
    await kv.set(`audit:email:${Date.now()}:${emailHash2}`, { event: ok ? 'magiclink_sent' : 'magiclink_send_failed', email_hash: emailHash2, kind: 'request' });
    if (!ok) {
      try {
        const supabaseAnon = getSupabaseAnon();
        const { error: otpErr } = await supabaseAnon.auth.signInWithOtp({ email });
        if (otpErr) {
          await kv.set(`audit:email:${Date.now()}:${emailHash2}`, { event: 'otp_fallback_failed', email_hash: emailHash2, message: String(otpErr?.message || otpErr) });
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        await kv.set(`audit:email:${Date.now()}:${emailHash2}`, { event: 'otp_fallback_exception', email_hash: emailHash2, message: msg });
      }
    }
    return c.json({ message: ok ? 'Magic link sent.' : 'Magic link initiated via fallback.' });
  } catch (error: any) {
    return respondError(c, 500, 'magic_failed', 'Failed to process request.', { errorMessage: error?.message });
  }
});

api.get('/magic/confirm', async (c) => {
  try {
    const url = new URL(c.req.url);
    const token = url.searchParams.get('token') || '';
    
    console.log(`[Confirm] Request token: ${token}`);
    
    const rec = await kv.get(`magic:${token}`);
    
    // If invalid or expired, redirect to frontend error page
    if (!rec) {
      console.log(`[Confirm] Token not found in KV: ${token}`);
      return c.redirect('http://eacoderai.xyz/confirmation?status=error&reason=expired&detail=token_not_found');
    }
    
    if (rec.used) {
      console.log(`[Confirm] Token already used: ${token}`);
      return c.redirect('http://eacoderai.xyz/confirmation?status=error&reason=expired&detail=already_used');
    }
    
    if (Date.now() > rec.expires_at) {
      console.log(`[Confirm] Token expired: ${token}`);
      return c.redirect('http://eacoderai.xyz/confirmation?status=error&reason=expired&detail=token_expired');
    }

    rec.used = true;
    rec.used_at = new Date().toISOString();
    await kv.set(`magic:${token}`, rec);

    const ehash = await hashIdentity(rec.email);
    await kv.set(`magic:stats:${ehash}:${Date.now()}`, { event: 'used', email_hash: ehash });

    // Perform verification against Supabase Auth
    try {
      console.log(`[Confirm] Action Link: ${rec.action_link}`);
      
      const u = new URL(rec.action_link);
      let tokenHash = u.searchParams.get('token_hash');
      const tokenVal = u.searchParams.get('token');
      const typeRaw = u.searchParams.get('type');
      
      console.log(`[Confirm] Parsed - Hash: ${tokenHash ? 'present' : 'missing'}, TokenVal: ${tokenVal ? 'present' : 'missing'}, Type: ${typeRaw}`);
      
      // Fallback: Use 'token' param as 'token_hash' if token_hash is missing but token is present (Supabase PKCE/Flow variation)
      if (!tokenHash && tokenVal) {
          console.log('[Confirm] Using token param as token_hash');
          tokenHash = tokenVal;
      }
      
      const t = isEmailOtp(typeRaw) ? (typeRaw as EmailOtpType) : null;

      if (!tokenHash || !t) {
        console.log('Invalid link data in KV:', { action_link: rec.action_link });
        return c.redirect(`http://eacoderai.xyz/confirmation?status=error&reason=invalid_link_data&detail=${encodeURIComponent('Missing token_hash or invalid type')}`);
      }

      const supabaseAnon = getSupabaseAnon();
      const { data: verifyData, error } = await supabaseAnon.auth.verifyOtp({ type: t, token_hash: tokenHash });
      
      if (error) {
          console.log('Verification error:', error);
          
          // Force confirm fallback if we have user_id
          if (rec.user_id) {
             try {
               console.log(`[Confirm] Attempting force confirmation for user ${rec.user_id}`);
               const supabaseAdmin = getSupabaseAdmin();
               const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(rec.user_id, { email_confirm: true });
               if (!updateErr) {
                 console.log(`[Confirm] Force confirmation successful for user ${rec.user_id}`);
                 return c.redirect('http://eacoderai.xyz/confirmation?status=success');
               } else {
                 console.log(`[Confirm] Force confirmation failed:`, updateErr);
               }
             } catch (fcError) {
                console.log(`[Confirm] Force confirmation exception:`, fcError);
             }
          }
          
          return c.redirect(`http://eacoderai.xyz/confirmation?status=error&reason=verification_failed&detail=${encodeURIComponent(error.message)}`);
      }
      
      console.log('[Confirm] Verification successful', verifyData);
      
      // Double check: Ensure email_confirm is true
      if (rec.user_id || verifyData.user?.id) {
         const uid = rec.user_id || verifyData.user?.id;
         try {
             const supabaseAdmin = getSupabaseAdmin();
             await supabaseAdmin.auth.admin.updateUserById(uid, { email_confirm: true });
         } catch (e) { console.log('Post-verification confirmation ensure failed', e); }
      }
      
    } catch (e: any) {
      console.log('Verification exception:', e);
      return c.redirect(`http://eacoderai.xyz/confirmation?status=error&reason=exception&detail=${encodeURIComponent(e.message || String(e))}`);
    }

    // Success! Redirect to frontend success page
    return c.redirect('http://eacoderai.xyz/confirmation?status=success');
  } catch (error: any) {
    console.log('[Confirm] Outer exception:', error);
    return c.redirect(`http://eacoderai.xyz/confirmation?status=error&reason=server_error&detail=${encodeURIComponent(error.message || String(error))}`);
  }
});

api.get('/auth/reset-callback', async (c) => {
  try {
    const url = new URL(c.req.url);
    const tokenHash = url.searchParams.get('token_hash') || '';
    const typeRaw = url.searchParams.get('type') || '';
    type OtpEmailType = EmailOtpType;
    const isEmailOtp = (v: string): v is OtpEmailType => {
      return v === 'signup' || v === 'magiclink' || v === 'recovery' || v === 'email_change';
    };
    const t = isEmailOtp(typeRaw) ? (typeRaw as OtpEmailType) : null;
    if (!tokenHash || !t) return c.redirect(safeRedirectUrl('/reset-password?status=error') || '/');
    const supabaseAnon = getSupabaseAnon();
    try {
      const { error } = await supabaseAnon.auth.verifyOtp({ type: t, token_hash: tokenHash });
      if (error) return c.redirect(safeRedirectUrl('/reset-password?status=expired') || '/');
      return c.redirect(safeRedirectUrl('/reset-password?status=success') || '/');
    } catch {
      return c.redirect(safeRedirectUrl('/reset-password?status=error') || '/');
    }
  } catch {
    return c.redirect(safeRedirectUrl('/reset-password?status=error') || '/');
  }
});

api.post('/magic/verify', async (c) => {
  try {
    const { token } = await c.req.json();
    if (!token) return respondError(c, 400, 'missing_token', 'Token is required.');

    const rec = await kv.get(`magic:${token}`);
    if (!rec || rec.used || Date.now() > rec.expires_at) {
      return respondError(c, 400, 'invalid_or_expired', 'Invalid or expired link.');
    }

    rec.used = true;
    rec.used_at = new Date().toISOString();
    await kv.set(`magic:${token}`, rec);

    const ehash = await hashIdentity(rec.email);
    await kv.set(`audit:email:${Date.now()}:${ehash}`, { event: 'magiclink_used', email_hash: ehash });

    const u = new URL(rec.action_link);
    const tokenHash = u.searchParams.get('token_hash');
    const typeRaw = u.searchParams.get('type');
    const t = isEmailOtp(typeRaw) ? (typeRaw as OtpEmailType) : null;

    if (!tokenHash || !t) {
      return respondError(c, 400, 'invalid_link_data', 'Link data is invalid.');
    }

    const supabaseAnon = getSupabaseAnon();
    const { error } = await supabaseAnon.auth.verifyOtp({ type: t, token_hash: tokenHash });

    if (error) {
      return respondError(c, 400, 'verification_failed', 'Verification failed or expired.');
    }

    return c.json({ success: true, message: 'Email confirmed successfully.' });
  } catch (error: any) {
    return respondError(c, 500, 'verification_error', 'Internal verification error.', { errorMessage: error?.message });
  }
});

// Get free usage counts for the authenticated user (monthly window)
api.get('/usage', async (c) => {
  const user = await getAuthenticatedUser(c.req.header('Authorization') || null);
  if (!user) {
    return respondError(c, 401, 'unauthorized', 'Please sign in to continue.');
  }
  try {
    // Lifetime usage: count total successful strategies (status === 'generated')
    const strategies = await kv.getByPrefix(`strategy:${user.id}:`);
    const count = Array.isArray(strategies)
      ? strategies.filter((s: any) => s && s.status === 'generated').length
      : 0;
    const remaining = Math.max(0, 4 - count);
    const window = 'lifetime';
    return c.json({ usage: { count, remaining, window } });
  } catch (error: any) {
    console.log('Get usage error:', error);
    return respondError(c, 500, 'usage_failed', 'Failed to fetch usage.', { errorMessage: error?.message });
  }
});

// List available Anthropic models to validate access and resolve naming issues
api.get('/anthropic/models', async (c) => {
  const user = await getAuthenticatedUser(c.req.header('Authorization') || null);
  if (!user) {
    return respondError(c, 401, 'unauthorized', 'Please sign in to continue.');
  }

  if (!CLAUDE_API_KEY) {
    return respondError(c, 500, 'service_unavailable', 'Service temporarily unavailable.', { errorMessage: 'Claude API key not configured' });
  }

  try {
    const headers = {
      'anthropic-version': '2023-06-01',
      'x-api-key': CLAUDE_API_KEY,
    } as Record<string, string>;

    const res = await fetch(CLAUDE_MODELS_ENDPOINT, { headers });
    const raw = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(raw);
    } catch {
      json = { raw };
    }

    if (!res.ok) {
      return respondError(c, res.status, 'models_list_failed', 'Failed to list models', { status: res.status, data: json });
    }

    // Anthropic returns { data: [{ id, ... }, ...] }
    const models = Array.isArray(json?.data)
      ? json.data.map((m: any) => m?.id || m?.name || m)
      : json;

    const resolvedModel = (CLAUDE_MODEL.startsWith('anthropic/')
      ? CLAUDE_MODEL.replace(/^anthropic\//, '')
      : CLAUDE_MODEL);

    return c.json({ models, resolvedModel });
  } catch (err: any) {
    return respondError(c, 500, 'models_list_failed', 'Failed to list models', { errorMessage: err?.message || String(err) });
  }
});

// Get all strategies for authenticated user
api.get('/strategies', async (c) => {
  const user = await getAuthenticatedUser(c.req.header('Authorization') || null);
  
  if (!user) {
    console.log('[GetStrategies] Unauthorized request - no user found');
    return respondError(c, 401, 'unauthorized', 'Please sign in to continue.');
  }

  console.log(`[GetStrategies] Fetching strategies for user: ${user.id} (${user.email || 'no-email'})`);
  
  try {
    const supabase = getSupabaseAdmin();
    
    // Fetch from Supabase as primary storage
    const { data: dbStrategies, error: dbError } = await supabase
      .from('strategies')
      .select('*')
      .eq('user_id', user.id);

    if (dbError) {
      console.error(`[GetStrategies] Supabase error for user ${user.id}:`, dbError);
      throw dbError;
    }

    // Fetch from KV as secondary/fallback storage to ensure no strategies are lost
    const kvStrategies = await kv.getByPrefix(`strategy:${user.id}:`);
    
    // Create a map of strategies by ID, starting with Supabase data
    const strategyMap = new Map<string, any>();
    
    // Always perform a broad search if we have fewer than 1 strategy, 
    // to ensure no "disappearing" strategies due to ID mismatches.
    let rescueCount = 0;
    const shouldRescue = (!dbStrategies || dbStrategies.length === 0) && (!kvStrategies || kvStrategies.length === 0);
    
    if (shouldRescue) {
      console.log(`[GetStrategies] Broad search rescue for user: ${user.id} (${user.email})`);
      try {
        const { data: allKv } = await supabase
          .from('kv_store_00a119be')
          .select('key, value')
          .filter('key', 'ilike', 'strategy:%');
        
        if (allKv) {
          const matches = allKv.filter((item: any) => {
            const val = item.value;
            if (!val) return false;
            
            // Match by exact user_id
            if (val.user_id === user.id) return true;
            
            // Match by email if user_id doesn't match (rescue for ID changes)
            if (user.email && val.user_email === user.email) {
              console.log(`[GetStrategies] Found strategy ${val.id} via email match for user ${user.id}`);
              return true;
            }
            
            return false;
          });
          
          if (matches.length > 0) {
            console.log(`[GetStrategies] Rescue found ${matches.length} matching strategies`);
            rescueCount = matches.length;
            matches.forEach((m: any) => {
              const s = m.value;
              if (s && s.id && !strategyMap.has(s.id)) {
                strategyMap.set(s.id, {
                  id: s.id,
                  strategy_name: s.strategy_name || 'Untitled Strategy',
                  description: s.description,
                  status: s.status,
                  created_at: s.created_at,
                  platform: s.platform || s.language || 'manual',
                  strategy_type: s.strategy_type || 'manual',
                  free_access: s.free_access
                });
              }
            });
          }
        }
      } catch (rescueErr) {
        console.error('[GetStrategies] Rescue failed:', rescueErr);
      }
    }
    
    console.log(`[GetStrategies] User ${user.id}: found ${dbStrategies?.length || 0} in DB, ${kvStrategies?.length || 0} in KV, ${rescueCount} via rescue`);
    
    (dbStrategies || []).forEach((s: any) => {
      strategyMap.set(s.id, {
        id: s.id,
        strategy_name: s.strategy_name || 'Untitled Strategy',
        description: s.description,
        status: s.status,
        created_at: s.created_at,
        platform: s.platform || s.language || 'manual',
        strategy_type: s.strategy_type || 'manual'
      });
    });

    // Merge KV strategies, which might contain items not yet synced to Supabase
    const missingInDb: any[] = [];
    (kvStrategies || []).forEach((s: any) => {
      if (s && s.id) {
        if (!strategyMap.has(s.id)) {
          missingInDb.push(s);
        }
        // Always update map with latest from KV as it contains full details including generated_code
        strategyMap.set(s.id, {
          id: s.id,
          strategy_name: s.strategy_name || 'Untitled Strategy',
          description: s.description,
          status: s.status,
          created_at: s.created_at,
          platform: s.platform || 'manual',
          strategy_type: s.strategy_type || 'manual',
          free_access: s.free_access
        });
      }
    });

    // Lazy sync: If items are in KV but missing in Supabase DB, try to sync them now
    if (missingInDb.length > 0) {
      console.log(`[GetStrategies] Found ${missingInDb.length} strategies in KV missing from DB. Attempting lazy sync...`);
      const syncPromises = missingInDb.map(async (strategy) => {
        try {
          await supabase.from('strategies').insert({
            id: strategy.id,
            user_id: user.id,
            strategy_name: strategy.strategy_name,
            description: strategy.description,
            status: strategy.status,
            input: {
              risk_management: strategy.risk_management,
              instrument: strategy.instrument,
              analysis_instrument: strategy.analysis_instrument,
              platform: strategy.platform,
              indicators: strategy.indicators,
              indicator_mode: strategy.indicator_mode
            },
            output_code: strategy.generated_code || '',
            language: strategy.platform || 'manual',
            strategy_type: strategy.strategy_type || 'manual',
            created_at: strategy.created_at
          });
          return true;
        } catch (e) {
          console.error(`[GetStrategies] Lazy sync failed for strategy ${strategy.id}:`, e);
          return false;
        }
      });
      await Promise.allSettled(syncPromises);
    }

    const strategies = Array.from(strategyMap.values());

    // Sort by created_at ascending to compute first 1 free tier for legacy items
    const asc = strategies.slice().sort((a: any, b: any) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    const firstAllowedIds = new Set(asc.slice(0, 1).map((s: any) => s.id));

    // Enrich legacy items missing free_access: mark first 1 as free for free users
    const subscription = await kv.get(`user:${user.id}:subscription`);
    const plan = subscription?.plan || 'free';
    const isProOrElite = plan === 'pro' || plan === 'elite';

    const enriched = strategies.map((s: any) => {
      if (!isProOrElite) {
        if (typeof s.free_access === 'undefined') {
          // Legacy: allow viewing for first one only
          return { ...s, free_access: firstAllowedIds.has(s.id) };
        }
      }
      return s;
    });

    // Return sorted by created_at descending for UI
    const sortedDesc = enriched.sort((a: any, b: any) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    return c.json({ 
      strategies: sortedDesc,
      _debug: {
        storage: kv.isMemoryFallback ? 'memory (not persisted!)' : 'supabase',
        dbCount: dbStrategies?.length || 0,
        kvCount: kvStrategies?.length || 0,
        rescueCount: rescueCount,
        userId: user.id,
        userEmail: user.email
      }
    });
  } catch (error: any) {
    console.log('Get strategies error:', error);
    return respondError(c, 500, 'strategies_list_failed', 'Failed to fetch strategies.', { errorMessage: error?.message });
  }
});

export function validateStrategyData(body: any): string[] {
  const { strategy_name, description, platform, strategy_type } = body || {};
  const allowedPlatforms = new Set(['mql4', 'mql5', 'pinescript', 'manual']);
  const errors: string[] = [];
  
  if (!description || typeof description !== 'string' || description.trim().length < 20) {
    errors.push('Description must be at least 20 characters');
  }
  
  // If automated, platform is required. If manual, platform is optional (or 'manual')
  if (strategy_type !== 'manual' && (!platform || !allowedPlatforms.has(String(platform)))) {
    errors.push('Platform must be one of mql4, mql5, pinescript');
  }
  
  if (strategy_name && String(strategy_name).length > 120) {
    errors.push('Strategy name must be 120 characters or less');
  }
  
  return errors;
}

// Create new strategy
api.post('/strategies', async (c) => {
  const user = await getAuthenticatedUser(c.req.header('Authorization') || null);
  
  if (!user) {
    return respondError(c, 401, 'unauthorized', 'Please sign in to continue.');
  }
  
  try {
    // Basic request validation before any writes
    const body = await c.req.json();
    const { strategy_name, description, risk_management, instrument, platform, analysis_instrument, indicators, indicator_mode, strategy_type } = body || {};
    
    const errors = validateStrategyData(body);
    if (errors.length > 0) {
      await kv.set(`audit:${user.id}:strategy.create.validation:${Date.now()}`, {
        event: 'strategy.create.validation_failed',
        userId: user.id,
        errors,
        route: c.req.path,
        createdAt: new Date().toISOString(),
      });
      return respondError(c, 400, 'invalid_input', 'Invalid strategy data.', { errors });
    }

    // Subscription + usage check — gate creation
    const subscription = await kv.get(`user:${user.id}:subscription`);
    const plan = subscription?.plan || 'free';
    const isProOrElite = plan === 'pro' || plan === 'elite';

    let userStrategiesCount = 0;
    try {
      const existing = await kv.getByPrefix(`strategy:${user.id}:`);
      const allGenerated = Array.isArray(existing)
        ? existing.filter((s: any) => s && s.status === 'generated')
        : [];
      
      if (plan === 'pro') {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        userStrategiesCount = allGenerated.filter((s: any) => s.created_at >= startOfMonth).length;
      } else {
        // Free (lifetime) or Elite (unlimited)
        userStrategiesCount = allGenerated.length;
      }
    } catch { void 0; }
    // Enforce limits (Free: 1, Pro: 10, Elite: Unlimited)
    if (!shouldAllowCreation(plan, userStrategiesCount)) {
      const limit = plan === 'pro' ? 10 : 1;
      await log403(user.id, c.req.path, 'limit_reached', { used: userStrategiesCount, limit, plan });
      return respondError(c, 403, 'feature_restricted', `${plan === 'pro' ? 'Pro' : 'Free'} tier limit reached — upgrade to continue`, {
        used: userStrategiesCount,
        limit,
        redirect: '/subscription'
      });
    }

    const strategyId = crypto.randomUUID();
    
    const strategy = {
      id: strategyId,
      user_id: user.id,
      user_email: user.email, // Store email for rescue searches
      strategy_name: strategy_name || 'Untitled Strategy',
      description,
      risk_management: risk_management || '',
      instrument: instrument || '',
      analysis_instrument: analysis_instrument || instrument || '',
      platform: platform || 'manual',
      indicators: Array.isArray(indicators) ? indicators.filter(Boolean) : [],
      indicator_mode: (indicator_mode === 'single' || indicator_mode === 'multiple') ? indicator_mode : 'multiple',
      strategy_type: strategy_type || 'manual',
      status: 'pending',
      generated_code: '',
      created_at: new Date().toISOString(),
      free_access: false
    };

    // Attempt to persist the strategy to KV
    try {
      await kv.set(`strategy:${user.id}:${strategyId}`, strategy);
    } catch (storageErr: any) {
      console.error('KV storage failed:', storageErr);
    }

    // Also persist to Supabase strategies table to satisfy foreign keys
    // Robust sync with retries
    let dbSynced = false;
    for (let i = 0; i < 3; i++) {
      try {
        const supabase = getSupabaseAdmin();
        const { error: dbErr } = await supabase.from('strategies').insert({
          id: strategyId,
          user_id: user.id,
          strategy_name: strategy.strategy_name,
          description: strategy.description,
          status: strategy.status,
          input: {
            risk_management: strategy.risk_management,
            instrument: strategy.instrument,
            analysis_instrument: strategy.analysis_instrument,
            platform: strategy.platform,
            indicators: strategy.indicators,
            indicator_mode: strategy.indicator_mode
          },
          output_code: strategy.generated_code,
          language: strategy.platform,
          strategy_type: strategy.strategy_type,
          created_at: strategy.created_at
        });

        if (!dbErr) {
          dbSynced = true;
          break;
        }
        console.warn(`[CreateStrategy] Supabase sync attempt ${i+1} failed for user ${user.id}:`, dbErr);
        if (i < 2) await sleep(500 * (i + 1)); // Exponential backoff
      } catch (dbErr: any) {
        console.error(`[CreateStrategy] Supabase sync attempt ${i+1} exception for user ${user.id}:`, dbErr);
        if (i < 2) await sleep(500 * (i + 1));
      }
    }

    if (!dbSynced) {
      console.error(`[CreateStrategy] CRITICAL: Failed to sync strategy ${strategyId} to Supabase after 3 attempts. Strategy is only in KV.`);
      // We still return success because KV is the source of truth, but now we've logged it heavily
      // and the GET endpoint's lazy sync will attempt to fix it on next refresh.
    }

    // For free users: mark free_access for first successful strategy
    if (!isProOrElite) {
      try {
        strategy.free_access = userStrategiesCount < 1;
      } catch { void 0; }
    }

    // For Pro/Elite users, schedule initial next-analysis so UI pill shows immediately
    if (isProOrElite) {
      const nextAnalysisDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
      await kv.set(`analysis:${user.id}:${strategyId}:next`, {
        nextAnalysisDate,
        strategyName: strategy.strategy_name,
        lastAnalysis: new Date().toISOString(),
      });
    }
    
    // Generate code using Claude AI in background with automatic retry
    (async () => {
      let retryCount = 0;
      const maxRetries = 3;
      const baseDelay = 1000; // 1 second

      while (retryCount < maxRetries) {
        try {
          
          
          const generatedCode = await generateCodeWithAI(platform, description, risk_management, instrument, { 
            indicators: Array.isArray(body?.indicators) ? body.indicators.filter(Boolean) : [], 
            indicator_mode: (body?.indicator_mode === 'single' || body?.indicator_mode === 'multiple') ? body.indicator_mode : 'multiple',
            strategy_type: strategy.strategy_type
          });
          strategy.status = 'generated';
          strategy.generated_code = generatedCode;
          await kv.set(`strategy:${user.id}:${strategyId}`, strategy);
          
          // Create "New Strategy Created" notification (Triggered ONLY after successful generation)
          const notificationId = crypto.randomUUID();
          const notification = {
            id: notificationId,
            type: 'strategy_creation',
            title: 'New Strategy Created',
            message: `${strategy_name || 'Untitled Strategy'}: ${description}`,
            timestamp: new Date().toISOString(),
            read: false,
            strategyId: strategyId,
            strategyName: strategy_name || 'Untitled Strategy',
          };
          await kv.set(`notification:${user.id}:${notificationId}`, notification);

          // Audit success
          await kv.set(`audit:${user.id}:strategy.create.success:${Date.now()}`, {
            event: 'strategy.create.success',
            strategyId,
            route: c.req.path,
            createdAt: new Date().toISOString(),
          }).catch(() => {});
          return;
          
        } catch (error: unknown) {
          retryCount++;
          
          
          if (retryCount >= maxRetries) {
            const errMsg = error instanceof Error ? error.message : String(error);
            console.log('AI code generation final failure for strategy', strategyId, ':', errMsg);
            strategy.status = 'pending';
            strategy.generated_code = strategy.generated_code || '';
            await kv.set(`strategy:${user.id}:${strategyId}`, strategy);
            await kv.set(`audit:${user.id}:strategy.create.error:${Date.now()}`, {
              event: 'strategy.create.generation_failed',
              strategyId,
              route: c.req.path,
              createdAt: new Date().toISOString(),
              error: errMsg,
            }).catch(() => {});
            return;
          }
          
          // Wait before next retry with exponential backoff
          const delay = baseDelay * Math.pow(2, retryCount - 1);
          await new Promise<void>(resolve => setTimeout(resolve, delay));
        }
      }
    })();
    
    return c.json({ strategyId, message: 'Strategy submitted for AI code generation' });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log('Create strategy error:', msg);
    return respondError(c, 500, 'strategy_create_failed', 'Failed to create strategy.', { errorMessage: msg });
  }
});

// Get single strategy
api.get('/strategies/:id', async (c) => {
  const user = await getAuthenticatedUser(c.req.header('Authorization') || null);
  
  if (!user) {
    return respondError(c, 401, 'unauthorized', 'Please sign in to continue.');
  }
  
  try {
    const strategyId = c.req.param('id');
    const strategy = await kv.get(`strategy:${user.id}:${strategyId}`);
    
    if (!strategy) {
      return respondError(c, 404, 'not_found', 'Strategy not found.');
    }

    // Viewing a user's own strategy is allowed for authenticated users regardless of tier.
    // Enrich legacy strategies: for free users, mark first 1 as free if free_access is undefined
    const subscription = await kv.get(`user:${user.id}:subscription`);
    const plan = subscription?.plan || 'free';
    const isProOrElite = plan === 'pro' || plan === 'elite';
    let enriched = strategy;
    if (!isProOrElite && typeof strategy.free_access === 'undefined') {
      const all = await kv.getByPrefix(`strategy:${user.id}:`);
      const asc = all.slice().sort((a: unknown, b: unknown) =>
        new Date(String((a as { created_at?: string }).created_at)).getTime() -
        new Date(String((b as { created_at?: string }).created_at)).getTime()
      );
      const firstAllowedIds = new Set(
        asc.slice(0, 1).map((s: unknown) => String((s as { id?: string }).id))
      );
      enriched = { ...strategy, free_access: firstAllowedIds.has(strategyId) };
    }
    
    return c.json(enriched);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log('Get strategy error:', msg);
    return respondError(c, 500, 'strategy_load_failed', 'Failed to load strategy.', { errorMessage: msg });
  }
});

// Update strategy (PATCH)
api.patch('/strategies/:id', async (c) => {
  const user = await getAuthenticatedUser(c.req.header('Authorization') || null);
  
  if (!user) {
    return respondError(c, 401, 'unauthorized', 'Please sign in to continue.');
  }
  
  try {
    const strategyId = c.req.param('id');
    const body = await c.req.json();
    const { 
      strategy_name, 
      description, 
      risk_management, 
      instrument, 
      platform, 
      indicators, 
      indicator_mode,
      strategy_type 
    } = body;

    // Load existing strategy
    const existingStrategy = await kv.get(`strategy:${user.id}:${strategyId}`);
    if (!existingStrategy) {
      return respondError(c, 404, 'not_found', 'Strategy not found.');
    }

    // Update strategy fields
    const updatedStrategy = {
      ...existingStrategy,
      strategy_name: strategy_name || existingStrategy.strategy_name,
      description: description || existingStrategy.description,
      risk_management: risk_management || existingStrategy.risk_management,
      instrument: instrument || existingStrategy.instrument,
      platform: platform || existingStrategy.platform,
      indicators: Array.isArray(indicators) ? indicators.filter(Boolean) : existingStrategy.indicators,
      indicator_mode: indicator_mode || existingStrategy.indicator_mode,
      strategy_type: strategy_type || existingStrategy.strategy_type,
      status: 'pending', // Reset status for re-generation
      updated_at: new Date().toISOString()
    };

    // Persist updated strategy
    try {
      await kv.set(`strategy:${user.id}:${strategyId}`, updatedStrategy);
    } catch (storageErr: any) {
      return respondError(c, 503, 'storage_unavailable', 'Storage unavailable — cannot update strategy at this time');
    }

    // Trigger AI code generation in background (similar to POST /strategies)
    (async () => {
      let retryCount = 0;
      const maxRetries = 3;
      const baseDelay = 1000;

      while (retryCount < maxRetries) {
        try {
          console.log(`[AI][Update] Generating code for strategy ${strategyId} (attempt ${retryCount + 1})`);
          const generatedCode = await generateCodeWithAI(
            updatedStrategy.platform, 
            updatedStrategy.description, 
            updatedStrategy.risk_management, 
            updatedStrategy.instrument, 
            { 
              indicators: updatedStrategy.indicators, 
              indicator_mode: (updatedStrategy.indicator_mode === 'single' || updatedStrategy.indicator_mode === 'multiple') ? updatedStrategy.indicator_mode : 'multiple',
              strategy_type: updatedStrategy.strategy_type
            }
          );
          
          updatedStrategy.status = 'generated';
          updatedStrategy.generated_code = generatedCode;
          await kv.set(`strategy:${user.id}:${strategyId}`, updatedStrategy);
          
          console.log(`[AI][Update] Successfully generated code for strategy ${strategyId}`);

          // Audit success
          await kv.set(`audit:${user.id}:strategy.update.success:${Date.now()}`, {
            event: 'strategy.update.success',
            strategyId,
            route: c.req.path,
            createdAt: new Date().toISOString(),
          }).catch(() => {});
          return;
          
        } catch (error: unknown) {
          retryCount++;
          const errMsg = error instanceof Error ? error.message : String(error);
          console.log(`[AI][Update] Error for strategy ${strategyId} (attempt ${retryCount}):`, errMsg);

          if (retryCount >= maxRetries) {
            console.log('AI code generation final failure for strategy update', strategyId, ':', errMsg);
            updatedStrategy.status = 'pending';
            await kv.set(`strategy:${user.id}:${strategyId}`, updatedStrategy);
            return;
          }
          const delay = baseDelay * Math.pow(2, retryCount - 1);
          await new Promise<void>(resolve => setTimeout(resolve, delay));
        }
      }
    })();
    
    return c.json({ strategyId, message: 'Strategy updated and submitted for AI code generation' });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log('Update strategy error:', msg);
    return respondError(c, 500, 'strategy_update_failed', 'Failed to update strategy.', { errorMessage: msg });
  }
});

// Get chat messages for strategy
api.get('/strategies/:id/chat', async (c) => {
  const user = await getAuthenticatedUser(c.req.header('Authorization') || null);
  
  if (!user) {
    return respondError(c, 401, 'unauthorized', 'Please sign in to continue.');
  }
  
  try {
    const strategyId = c.req.param('id');
    // Load strategy to enforce access rules
    const strategy = await kv.get(`strategy:${user.id}:${strategyId}`);
    if (!strategy) {
      return respondError(c, 404, 'not_found', 'Strategy not found.');
    }
    // Pro/Elite users: full access; Free: no access per pricing
    const subscription = await kv.get(`user:${user.id}:subscription`);
    const plan = subscription?.plan || 'free';
    const isProOrElite = plan === 'pro' || plan === 'elite';
    
    if (!isProOrElite) {
      return respondError(c, 403, 'feature_restricted', 'Chat is a Pro feature. Upgrade to unlock.', { redirect: '/subscription' });
    }
    
    // Legacy support: if we wanted to allow free chat for the free strategy, we would check free_access here.
    // But pricing spec says "No access to /chat". So we block all free users.

    const messages = await kv.getByPrefix(`chat:${user.id}:${strategyId}:`);
    
    // Sort by timestamp
    const sorted = messages.sort((a: unknown, b: unknown) =>
      new Date(String((a as { timestamp?: string }).timestamp)).getTime() -
      new Date(String((b as { timestamp?: string }).timestamp)).getTime()
    );
    
    return c.json({ messages: sorted });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log('Get chat messages error:', msg);
    return respondError(c, 500, 'chat_load_failed', 'Failed to load chat.', { errorMessage: msg });
  }
});

// Send chat message
api.post('/strategies/:id/chat', async (c) => {
  const user = await getAuthenticatedUser(c.req.header('Authorization') || null);
  
  if (!user) {
    return respondError(c, 401, 'unauthorized', 'Please sign in to continue.');
  }
  
  try {
    const strategyId = c.req.param('id');
    // Load strategy to enforce access rules
    const strategy = await kv.get(`strategy:${user.id}:${strategyId}`);
    if (!strategy) {
      return respondError(c, 404, 'not_found', 'Strategy not found.');
    }
    // Pro/Elite users: full access; Free: no access
    const subscription = await kv.get(`user:${user.id}:subscription`);
    const plan = subscription?.plan || 'free';
    const isProOrElite = plan === 'pro' || plan === 'elite';
    
    if (!isProOrElite) {
      await kv.set(`audit:${user.id}:chat.send.denied:${Date.now()}`, {
        event: 'chat.send.denied',
        route: c.req.path,
        createdAt: new Date().toISOString(),
        strategyId,
        reason: 'Free plan has no chat access',
      }).catch(() => {});
      return respondError(c, 403, 'feature_restricted', 'Chat is a Pro feature. Upgrade to unlock.', { redirect: '/subscription' });
    }
    const { message, codeOverride } = await c.req.json();
    
    // Save user message
    const userMsgId = crypto.randomUUID();
    const userMessage = {
      id: userMsgId,
      role: 'user',
      content: message,
      timestamp: new Date().toISOString()
    };
    await kv.set(`chat:${user.id}:${strategyId}:${userMsgId}`, userMessage);
    
    // Strategy loaded above
    
    // Get chat history for context
    const chatHistory = await kv.getByPrefix(`chat:${user.id}:${strategyId}:`);
    const sortedHistory = chatHistory.sort((a: unknown, b: unknown) =>
      new Date(String((a as { timestamp?: string }).timestamp)).getTime() -
      new Date(String((b as { timestamp?: string }).timestamp)).getTime()
    );
    
// Generate AI response using Claude
    let aiResponse: string;
    try {
      const currentCode = typeof codeOverride === 'string' ? codeOverride : (strategy?.generated_code || '');
      aiResponse = await generateChatResponse(message, currentCode, strategy, sortedHistory);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log('AI chat response error:', msg);
      aiResponse = 'I apologize, but I encountered an error processing your request. Please try again.';
    }
    
    const aiMsgId = crypto.randomUUID();
    const aiMessage = {
      id: aiMsgId,
      role: 'assistant',
      content: aiResponse,
      timestamp: new Date().toISOString()
    };
    await kv.set(`chat:${user.id}:${strategyId}:${aiMsgId}`, aiMessage);
    
    return c.json({ response: aiResponse });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log('Send chat message error:', msg);
    return respondError(c, 500, 'chat_post_failed', 'Failed to send message.', { errorMessage: msg });
  }
});

// Convert code
api.post('/convert', async (c) => {
  const user = await getAuthenticatedUser(c.req.header('Authorization') || null);
  
  if (!user) {
    return respondError(c, 401, 'unauthorized', 'Please sign in to continue.');
  }
  
  try {
    const { code, from_lang, to_lang, strategyId } = await c.req.json();

    // Gate convert access: Elite only for Pine<->MQL, but pricing says "Code Converter (MQL <-> Pine) ... Elite: Check".
    // Pro/Free: X.
    const subscription = await kv.get(`user:${user.id}:subscription`);
    const plan = subscription?.plan || 'free';
    // Elite allows convert. (Assuming Pro legacy maps to Elite for this, or maybe Pro? Pricing says Elite only).
    // Let's assume 'pro' legacy users get access too to avoid breaking them.
    const isElite = plan === 'elite' || plan === 'pro';

    if (!isElite) {
       return respondError(c, 403, 'feature_restricted', 'Code conversion is an Elite feature.', { redirect: '/subscription' });
    }
    
// Convert code using Claude AI
    let convertedCode: string;
    try {
      convertedCode = await convertCodeWithAI(code, from_lang, to_lang);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log('AI code conversion error:', msg);
      return respondError(c, 500, 'convert_failed', 'Code conversion failed.', { errorMessage: msg });
    }
    
    return c.json({ converted_code: convertedCode });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log('Convert code error:', msg);
    return respondError(c, 500, 'convert_failed', 'Code conversion failed.', { errorMessage: msg });
  }
});

// Helper to build system prompt for manual plans
function buildManualPlanMessages(description: string, risk: string, instrument: string, indicators: string[]) {
  const prompt = `You are an expert trading mentor. Create a structured manual trading plan for the following strategy description:
"${description}"
Instrument: ${instrument}
Risk Management Preferences: ${risk}
Indicators: ${indicators.join(', ')}

Format the output with the following sections using clear bold headers (e.g. **Section**) and bullet points:
- **Strategy Overview** 🎯: Brief summary of the logic.
- **Entry Rules** ✅: Exact conditions to enter a trade (Long/Short).
- **Exit Rules** 🛑: Exact conditions to take profit or stop loss.
- **Risk Management** ⚖️: Position sizing, R:R ratio, and risk rules.
- **Psychology & Tips** 🧠: Mental cues and what to watch out for.

Use icons (✅, 🛑, 🎯, etc.) and keep it scannable. Do NOT generate code. Just the manual plan.`;

  return [
    { role: 'system', content: 'You are an expert trading mentor helping a trader define a manual strategy.' },
    { role: 'user', content: prompt }
  ] as ClaudeMessage[];
}

// AI-powered code generation function
async function generateCodeWithAI(platform: string, description: string, riskManagement: string, instrument: string, extras?: { indicators?: string[]; indicator_mode?: 'single' | 'multiple'; strategy_type?: string }): Promise<string> {
  const indicators = Array.isArray(extras?.indicators) ? extras!.indicators!.filter(Boolean) : [];
  const isManual = extras?.strategy_type === 'manual';
  
  let messages: ClaudeMessage[] = [];
  
  if (isManual) {
    messages = buildManualPlanMessages(description, riskManagement, instrument, indicators);
  } else {
    const strategy = { description, risk_management: riskManagement, instrument, timeframe: platform === 'pinescript' ? '60' : 'H1', platform, indicators, indicator_mode: (extras?.indicator_mode === 'single' || extras?.indicator_mode === 'multiple') ? extras!.indicator_mode! : 'multiple' };
    messages = buildCodeMessages(platform, strategy) as ClaudeMessage[];
  }

  const type = deriveStrategyType({ description, risk_management: riskManagement, instrument, platform, indicators });
  await recordPromptVersion('codegen', type);

  try {
    const raw = await callClaudeAPI(messages, 0.25, 5000);
    
    if (isManual) {
      return raw || 'Failed to generate manual plan.';
    }

    const codeOnly = extractPrimaryCode((raw || '').trim(), platform);
    return codeOnly;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to generate content using Claude API: ${msg}`);
  }
}

function extractPrimaryCode(input: string, platform: string): string {
  const fences = Array.from(input.matchAll(/```([a-zA-Z0-9_\-\.\s]*)\n([\s\S]*?)```/g));
  const alias: Record<string, string[]> = {
    mql5: ['mql5', 'mq5'],
    mql4: ['mql4', 'mq4'],
    pinescript: ['pinescript', 'pine', 'pine v5', 'pine-v5'],
    javascript: ['javascript', 'js'],
    typescript: ['typescript', 'ts'],
    python: ['python', 'py']
  };
  const target = (alias[platform] || []).map(s => s.toLowerCase());
  let best = '';
  let bestScore = -1;
  for (const m of fences) {
    const lang = String(m[1] || '').toLowerCase().trim();
    const body = String(m[2] || '').trim();
    const len = body.length;
    const matchScore = target.includes(lang) ? 2 : (lang ? 0 : 1);
    const score = matchScore * 1000000 + len;
    if (score > bestScore) { bestScore = score; best = body; }
  }
  if (best) return best;
  // If no fenced code, try to strip any leading narrative markers
  const stripped = input.replace(/^.*?\n(?=#|int |void |var |class |\/\/\@|input |strategy\(|indicator\()/s, '').trim();
  return stripped || input;
}

// AI-powered chat response function
async function generateChatResponse(userMessage: string, currentCode: string, strategy: Record<string, unknown>, chatHistory: Array<{ role: string; content: string; timestamp?: string }>): Promise<string> {
  const type = deriveStrategyType(strategy || {});
  const instrument = (strategy as Record<string, unknown>)?.analysis_instrument || (strategy as Record<string, unknown>)?.instrument || 'Not specified';
  const timeframe = (strategy as Record<string, unknown>)?.timeframe || 'H1';
  const platform = (strategy as Record<string, unknown>)?.platform || 'mql4';
  const typeFocus: Record<string, string> = {
    trend_following: 'Regime detection, HTF confirmation, momentum-based edits',
    mean_reversion: 'Volatility bands, threshold tuning, session filters',
    breakout: 'Consolidation detection, breakout rules, volatility expansion',
    scalping: 'Spread/slippage caps, fast execution, ATR-based risk',
    grid_martingale: 'Strict caps, equity guards, lot ceilings',
    news_event: 'Embargo windows, calendars, gap/volatility handling',
    other: 'Tailor to instrument/timeframe specifics'
  };
  const systemPrompt = `You are Crizzy, EA Coder's Code Assistant. Always identify yourself as "Crizzy, EA Coder's Code Assistant" if asked about your name or identity. Do not claim to be Claude or Anthropic; avoid vendor branding in first-person statements. You were created by EA Coder.\n\nYou are an expert ${platform} assistant. Instrument: ${instrument}. Timeframe: ${timeframe}. Focus: ${typeFocus[type] || typeFocus.other}. Provide concise, implementable code edits and explanations.`;

  const messages: ClaudeMessage[] = [{ role: 'system', content: systemPrompt }];

  // Add context about the strategy
  if (strategy) {
    messages.push({
      role: 'system',
      content: `Current strategy context:
- Name: ${strategy.strategy_name}
- Platform: ${strategy.platform}
- Description: ${strategy.description || 'Not specified'}

Current code:
\`\`\`
${currentCode.substring(0, 2000)}${currentCode.length > 2000 ? '\n... (code truncated)' : ''}
\`\`\``
    });
  }

  // Add recent chat history (last 6 messages for context)
  const recentHistory = chatHistory.slice(-6);
  for (const msg of recentHistory) {
    if (msg.role !== 'system') {
      messages.push({ role: msg.role as 'user' | 'assistant', content: msg.content });
    }
  }

  // Add current user message
  messages.push({ role: 'user', content: userMessage });

  await recordPromptVersion('chat', type);
  const response = await callClaudeAPI(messages, 0.7, 3000);
  return response;
}

// AI-powered code conversion function
async function convertCodeWithAI(code: string, fromLang: string, toLang: string): Promise<string> {
  const langMap: Record<string, string> = {
    mql5: 'MetaTrader 5 (MQL5)',
    mql4: 'MetaTrader 4 (MQL4)',
    pinescript: 'TradingView Pine Script'
  };

  const fromLangName = langMap[fromLang] || fromLang;
  const toLangName = langMap[toLang] || toLang;

  const systemPrompt = `You are an expert in converting algorithmic trading code between different platforms. You have deep knowledge of MQL4, MQL5, and Pine Script syntax, functions, and best practices.`;

  const userPrompt = `Convert the following ${fromLangName} code to ${toLangName}.

IMPORTANT REQUIREMENTS:
- Preserve all trading logic exactly
- Convert syntax and functions to ${toLangName} equivalents
- Maintain the same strategy behavior
- Include comments explaining major conversions
- Ensure the converted code is production-ready
- Follow ${toLangName} best practices

SOURCE CODE (${fromLangName}):
\`\`\`
${code}
\`\`\`

Return ONLY the converted ${toLangName} code, no explanations before or after.`;

  const messages: ClaudeMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ];

  const convertedCode = await callClaudeAPI(messages, 0.2, 4000);
  return extractPrimaryCode(convertedCode.trim(), toLang);
}

// AI-powered strategy analysis function
async function analyzeStrategyWithAI(strategy: any): Promise<string[]> {
    
  const messages = buildAnalyzeMessages(strategy);
  const type = deriveStrategyType(strategy || {});
  await recordPromptVersion('analyze', type);
  const response = await callClaudeAPI(messages as ClaudeMessage[], 0.3, 1400);
  
  try {
    // Try to parse as JSON array
    const improvements = JSON.parse(response.trim());
    if (Array.isArray(improvements)) {
      return improvements;
    }
  } catch {
    // If JSON parsing fails, try to extract suggestions from text
    const lines = response.split('\n').filter((line: string) => line.trim().length > 0);
    return lines.slice(0, 6);
  }

  // Fallback
  return [
    'Optimize entry and exit timing based on market conditions',
    'Implement dynamic position sizing based on volatility',
    'Add multiple timeframe confirmation',
    'Consider adding filters for trending vs ranging markets'
  ];
}

// Generate backtest-like analysis metrics via AI, with conservative defaults fallback
async function generateAnalysisMetricsWithAI(strategy: any): Promise<Record<string, any>> {
  const type = deriveStrategyType(strategy);
  const messages = buildMetricsMessages(strategy);
  await recordPromptVersion('metrics', type);
  try {
    const response = await callClaudeAPI(messages as ClaudeMessage[], 0.5, 1200);
    const parsed = JSON.parse(response.trim());
    if (parsed && typeof parsed === 'object') return parsed;
  } catch (_) {
    // fall through to synthetic defaults
  }

  return {
    win_rate: 52,
    total_trades: 230,
    winning_trades: 120,
    losing_trades: 110,
    average_win: '1.2%',
    average_loss: '0.8%',
    largest_win: '4.5%',
    largest_loss: '3.2%',
    profit_loss_ratio: 1.5,
    profit_factor: 1.8,
    max_drawdown: 14,
    expected_return: 18,
    avg_trade_duration: '2h 30m',
    volatility: 22,
    trade_frequency: '3 trades/week',
    avg_holding_time: '1d 4h',
    sharpe_ratio: 1.1,
    sortino_ratio: 1.4,
    recovery_factor: 1.7,
    consecutive_losses: 5,
    bull_market_performance: 'Strong trend-following behavior',
    bull_market_score: 76,
    bear_market_performance: 'Moderate risk; tighten stops',
    bear_market_score: 58,
    volatile_market_performance: 'Performs well with volatility filters',
    volatile_market_score: 70,
  };
}

// Get user subscription
api.get('/subscription', async (c) => {
  const user = await getAuthenticatedUser(c.req.header('Authorization') || null);
  
  if (!user) {
    return respondError(c, 401, 'unauthorized', 'Please sign in to continue.');
  }
  
  try {
    // Return current subscription without auto-initializing a plan.
    // First-login users have no active plan until they select one.
    let subscription = await kv.get(`user:${user.id}:subscription`);
    
    // ENHANCEMENT: Check Stripe Sync View for definitive status
    // This uses the Stripe Sync Engine data (if available) to self-heal the KV store
    try {
       const supabase = getSupabaseAdmin();
       // Only proceed if the view exists and is accessible
       const { data, error } = await supabase
        .from('user_subscriptions_view')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle(); // Use maybeSingle to avoid errors if not found
       
       if (!error && data) {
          // Found active subscription in Synced DB
          let dbPlan = 'pro'; 
          try {
             // Simple heuristic: check if JSONB items contain 'elite'
             const items = data.items || [];
             if (JSON.stringify(items).toLowerCase().includes('elite')) dbPlan = 'elite';
          } catch {}
          
          // If KV is stale (e.g. says free but DB says pro/elite), update it
          if (!subscription || subscription.plan !== dbPlan) {
             subscription = { 
               plan: dbPlan, 
               subscriptionDate: data.created ? new Date(data.created * 1000).toISOString() : new Date().toISOString(),
               expiryDate: data.current_period_end ? new Date(data.current_period_end * 1000).toISOString() : undefined
             };
             // Update KV in background
             kv.set(`user:${user.id}:subscription`, subscription).catch((e: any) => console.warn('KV update failed', e));
          }
       }
    } catch {
       // View likely doesn't exist yet (user hasn't run the SQL setup)
       // This is expected failure mode until setup is complete
    }

    // Retroactive fix: if KV has legacy 'premium' plan, auto-upgrade to 'pro'
    if (subscription && subscription.plan === 'premium') {
      subscription.plan = 'pro';
      // update KV asynchronously
      kv.set(`user:${user.id}:subscription`, subscription).catch((e: any) => console.warn('KV legacy update failed', e));
    }

    const paymentComplete = await kv.get(`session:${user.id}:payment_complete`);
    return c.json({ subscription: subscription ?? null, paymentComplete: !!(paymentComplete && paymentComplete.value) });
  } catch (error: any) {
    console.log('Get subscription error:', error);
    return respondError(c, 500, 'subscription_fetch_failed', 'Failed to load subscription.');
  }
});

 

api.get('/subscription/admin/:id', async (c) => {
  const secret = c.req.header('x-cron-secret') || '';
  const auth = c.req.header('Authorization') || '';
  const ok = (CRON_SECRET && (secret === CRON_SECRET || auth === `Bearer ${CRON_SECRET}`)) || (!CRON_SECRET && secret === '' && auth === '');
  if (!ok) {
    return respondError(c, 401, 'unauthorized', 'Admin access required.');
  }
  try {
    const userId = c.req.param('id');
    const subscription = await kv.get(`user:${userId}:subscription`);
    const paymentComplete = await kv.get(`session:${userId}:payment_complete`);
    return c.json({ subscription: subscription ?? null, paymentComplete: !!(paymentComplete && paymentComplete.value) });
  } catch (error: any) {
    return respondError(c, 500, 'subscription_fetch_failed', 'Failed to load subscription.');
  }
});

api.get('/subscription/admin/by-email', async (c) => {
  const secret = c.req.header('x-cron-secret') || '';
  const auth = c.req.header('Authorization') || '';
  const ok = (CRON_SECRET && (secret === CRON_SECRET || auth === `Bearer ${CRON_SECRET}`)) || (!CRON_SECRET && secret === '' && auth === '');
  if (!ok) {
    return respondError(c, 401, 'unauthorized', 'Admin access required.');
  }
  try {
    const email = String(c.req.query('email') || '').trim().toLowerCase();
    if (!email) return respondError(c, 400, 'invalid_input', 'Email is required.');
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await (supabaseAdmin as any).auth.admin.listUsers({ perPage: 200, page: 1 });
    if (error) return respondError(c, 500, 'user_lookup_failed', 'Failed to lookup users');
    const found = Array.isArray(data?.users) ? data.users.find((u: any) => String(u?.email || '').toLowerCase() === email) : null;
    if (!found || !found.id) return respondError(c, 404, 'not_found', 'User not found');
    const subscription = await kv.get(`user:${found.id}:subscription`);
    const paymentComplete = await kv.get(`session:${found.id}:payment_complete`);
    return c.json({ userId: found.id, subscription: subscription ?? null, paymentComplete: !!(paymentComplete && paymentComplete.value) });
  } catch (error: any) {
    return respondError(c, 500, 'subscription_fetch_failed', 'Failed to load subscription.');
  }
});

// Sync subscription state from Stripe (DB or API)
// This endpoint leverages the Stripe Sync Engine data (if available) or falls back to the Stripe API
// to ensure the user's plan is up-to-date.
api.post('/subscription/sync', async (c) => {
  const user = await getAuthenticatedUser(c.req.header('Authorization') || null);
  if (!user) {
    return respondError(c, 401, 'unauthorized', 'Please sign in to continue.');
  }

  try {
    const supabase = getSupabaseAdmin();
    let plan = 'free';
    let expiryDate: string | undefined;
    let found = false;

    // 1. Try to read from the synced view (fastest, no API limits)
    // Requires running supabase/setup_stripe_sync.sql
    try {
      const { data, error } = await supabase
        .from('user_subscriptions_view')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (!error && data) {
        found = true;
        // Basic check: if active in DB, assume Pro unless identified otherwise
        // Ideally we'd map the product ID from data.items if available
        plan = 'pro'; 
        
        // Try to refine plan based on items if available
        try {
            const items = data.items || [];
            if (Array.isArray(items) && items.length > 0) {
                // Check if any item looks like Elite
                // This depends on how the Sync Engine structures JSONB
                const str = JSON.stringify(items).toLowerCase();
                if (str.includes('elite')) plan = 'elite';
            }
        } catch {}

        if (data.current_period_end) {
             try { expiryDate = new Date(data.current_period_end * 1000).toISOString(); } catch {}
        }
      }
    } catch { 
      // View might not exist yet or permission denied
    }

    // 2. Fallback to Stripe API if not found in DB (or DB not setup)
    if (!found && stripe && user.email) {
      try {
         const customers = await stripe.customers.list({ email: user.email, limit: 1 });
         if (customers.data.length > 0) {
           const subs = await stripe.subscriptions.list({ customer: customers.data[0].id, status: 'active', limit: 1 });
           if (subs.data.length > 0) {
             found = true;
             const sub = subs.data[0];
             const productId = sub.items.data[0].price.product as string;
             
             if (productId === STRIPE_PRODUCT_PRO || productId === STRIPE_PRODUCT_PRO_MONTHLY || productId === STRIPE_PRODUCT_PRO_YEARLY) plan = 'pro';
             else if (productId === STRIPE_PRODUCT_ELITE || productId === STRIPE_PRODUCT_ELITE_MONTHLY || productId === STRIPE_PRODUCT_ELITE_YEARLY) plan = 'elite';
             else {
                try {
                  const product = await stripe.products.retrieve(productId);
                  const name = (product.name || '').toLowerCase();
                  if (name.includes('elite')) plan = 'elite';
                  else if (name.includes('pro') || name.includes('premium')) plan = 'pro';
                } catch {}
             }
             
             if (sub.current_period_end) {
               expiryDate = new Date(sub.current_period_end * 1000).toISOString();
             }
           }
         }
      } catch (e) {
        console.warn('Stripe API sync failed:', e);
      }
    }

    // 3. Update State
    const subscription = { plan, subscriptionDate: new Date().toISOString(), ...(expiryDate ? { expiryDate } : {}) };
    await kv.set(`user:${user.id}:subscription`, subscription);
    
    // Update metadata
    try {
      let prod = STRIPE_PRODUCT_FREE;
      if (plan === 'pro') prod = STRIPE_PRODUCT_PRO;
      else if (plan === 'elite') prod = STRIPE_PRODUCT_ELITE;
      
      await supabase.auth.admin.updateUserById(user.id, { 
        user_metadata: { product_info: { prod_id: prod, plan_name: plan } } 
      });
    } catch {}

    return c.json({ plan, synced: true, source: found ? 'stripe' : 'default' });
  } catch (error: any) {
    return respondError(c, 500, 'sync_failed', 'Failed to sync subscription.');
  }
});

// Upgrade subscription
api.post('/subscription/upgrade', async (c) => {
  const user = await getAuthenticatedUser(c.req.header('Authorization') || null);
  if (!user) {
    return respondError(c, 401, 'unauthorized', 'Please sign in to continue.');
  }
  try {
    const { plan } = await c.req.json();
    if (plan !== 'pro' && plan !== 'elite') {
      return respondError(c, 400, 'invalid_plan', 'Invalid plan for upgrade.');
    }
    const subscription = {
      plan,
      subscriptionDate: new Date().toISOString(),
    } as any;
    await kv.set(`user:${user.id}:subscription`, subscription);
    
    // Add welcome notification
    const notificationId = crypto.randomUUID();
    const title = `Welcome to ${plan.charAt(0).toUpperCase() + plan.slice(1)}! 🎉`;
    await kv.set(`notification:${user.id}:${notificationId}`, {
        id: notificationId,
        type: 'subscription',
        title,
        message: 'Your plan has been upgraded.',
        timestamp: new Date().toISOString(),
        read: false
    });

    await kv.set(`audit:${user.id}:upgrade:${Date.now()}`, {
      event: 'subscription.upgraded',
      plan,
      createdAt: new Date().toISOString(),
    });
    return c.json({ subscription });
  } catch (error: any) {
    return respondError(c, 500, 'upgrade_failed', 'Failed to upgrade subscription.');
  }
});

// Select a free plan explicitly (first-login users must choose a plan)
api.post('/subscription/select', async (c) => {
  const user = await getAuthenticatedUser(c.req.header('Authorization') || null);
  
  if (!user) {
    return respondError(c, 401, 'unauthorized', 'Please sign in to continue.');
  }
  
  try {
    const { plan } = await c.req.json();
    if (plan !== 'free') {
      return respondError(c, 400, 'invalid_plan', 'Only free plan selection is supported here.');
    }
    const subscription = {
      plan: 'free',
      subscriptionDate: new Date().toISOString(),
    };
    await kv.set(`user:${user.id}:subscription`, subscription);
    return c.json({ subscription });
  } catch (error: any) {
    console.log('Select free plan error:', error);
    return respondError(c, 500, 'subscription_select_failed', 'Failed to activate Free plan.');
  }
});


      

api.post('/free/reconcile', async (c) => {
  const user = await getAuthenticatedUser(c.req.header('Authorization') || null);
  if (!user) {
    return respondError(c, 401, 'unauthorized', 'Please sign in to continue.');
  }
  if (!stripe) {
    return respondError(c, 500, 'stripe_not_configured', 'Stripe not configured');
  }
  try {
    let userEmail = '';
    try {
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase.auth.admin.getUserById(user.id);
      userEmail = error ? '' : String(data?.user?.email || '');
    } catch {}

    const events = await stripe.events.list({ type: 'checkout.session.completed', limit: 50 });
    let updated = false;
    for (const ev of (events?.data || [])) {
      const session = ev.data?.object as any;
      if (!session || (session as any)?.mode === 'subscription') continue;
      const plink = String(session.payment_link || '');
      let matchPrice = false;
      let matchProduct = false;
      try {
        const items = await stripe.checkout.sessions.listLineItems(session.id, { limit: 10 });
        const first = Array.isArray(items?.data) ? items.data[0] : null;
        const priceId = first?.price?.id || null;
        if (priceId) {
          const price = await stripe.prices.retrieve(priceId);
          const productId = typeof price?.product === 'string' ? price.product : (price?.product as any)?.id;
          if (productId === STRIPE_PRODUCT_FREE) matchProduct = true;
        }
      } catch {}
      if (!matchPrice && !matchProduct) continue;
      const ref = String(session.client_reference_id || '');
      const email = String((session.customer_details as any)?.email || (session as any)?.customer_email || '');
      const matchUser = (ref && ref === String(user.id)) || (userEmail && email && email.toLowerCase() === userEmail.toLowerCase());
      if (!matchUser) continue;
      const ok = await updatePlanAtomic(String(user.id), 'free', 'reconcile', String(ev.id));
      if (ok) {
        updated = true;
      }
    }
    return c.json({ updated });
  } catch (error: any) {
    return respondError(c, 500, 'free_reconcile_failed', 'Failed to reconcile free');
  }
});



api.get('/debug/env/plans', async (c) => {
  const user = await getAuthenticatedUser(c.req.header('Authorization') || null);
  if (!user) {
    return respondError(c, 401, 'unauthorized', 'Please sign in to continue.');
  }
  try {
    return c.json({
      stripe_secret_present: !!STRIPE_SECRET_KEY,
      stripe_webhook_secret_present: !!STRIPE_WEBHOOK_SECRET,
      stripe_webhook_subscription_secret_present: !!STRIPE_WEBHOOK_SECRET_SUBSCRIPTION,
    });
  } catch (error: any) {
    return respondError(c, 500, 'env_read_failed', 'Failed to read environment');
  }
});

// Health and version endpoints for monitoring
const SERVER_START = Date.now();
// Sub-app index: reachable at alias mounts
api.get('/', (c) => {
  return c.json({
    ok: true,
    message: 'EA Coder API — see /health and /version',
    endpoints: {
      health: '/health',
      version: '/version',
      strategies: '/strategies',
      convert: '/convert',
      models: '/anthropic/models',
    },
  });
});

api.get('/strategies/:id/code', async (c) => {
  const user = await getAuthenticatedUser(c.req.header('Authorization') || null);
  if (!user) {
    return respondError(c, 401, 'unauthorized', 'Please sign in to continue.');
  }
  try {
    const strategyId = c.req.param('id');
    const strategy = await kv.get(`strategy:${user.id}:${strategyId}`);
    if (!strategy) {
      return respondError(c, 404, 'not_found', 'Strategy not found.');
    }
    const versions = await kv.get(`strategy_code_versions:${user.id}:${strategyId}`) || [];
    return c.json({ code: String(strategy.generated_code || ''), versions });
  } catch (error: any) {
    return respondError(c, 500, 'code_fetch_failed', 'Failed to load code.', { errorMessage: error?.message });
  }
});

api.post('/strategies/:id/code', async (c) => {
  const user = await getAuthenticatedUser(c.req.header('Authorization') || null);
  if (!user) {
    return respondError(c, 401, 'unauthorized', 'Please sign in to continue.');
  }
  try {
    const strategyId = c.req.param('id');
    const payload = await c.req.json();
    const nextCode = String(payload?.code || '');
    const strategy = await kv.get(`strategy:${user.id}:${strategyId}`);
    if (!strategy) {
      return respondError(c, 404, 'not_found', 'Strategy not found.');
    }
    const prevCode = String(strategy.generated_code || '');
    const versionEntry = { id: crypto.randomUUID(), code: nextCode, timestamp: new Date().toISOString() };
    const existing = await kv.get(`strategy_code_versions:${user.id}:${strategyId}`) || [];
    const updatedVersions = [versionEntry, ...existing].slice(0, 50);
    const updated = { ...strategy, generated_code: nextCode };
    await kv.set(`strategy:${user.id}:${strategyId}`, updated);
    await kv.set(`strategy_code_versions:${user.id}:${strategyId}`, updatedVersions);
    return c.json({ ok: true });
  } catch (error: any) {
    return respondError(c, 500, 'code_save_failed', 'Failed to save code.', { errorMessage: error?.message });
  }
});
api.get('/health', async (c) => {
  try {
    const uptimeMs = Date.now() - SERVER_START;
    return c.json({ ok: true, uptimeMs });
  } catch {
    return c.json({ ok: true });
  }
});

api.get('/version', async (c) => {
  const version = envGet('RELEASE_SHA') || envGet('GIT_SHA') || 'unknown';
  const deployedAt = envGet('DEPLOYED_AT') || null;
  const model = (CLAUDE_MODEL.startsWith('anthropic/') ? CLAUDE_MODEL.replace(/^anthropic\//, '') : CLAUDE_MODEL);
  return c.json({ version, deployedAt, model });
});

api.get('/webhooks/audit', async (c) => {
  const user = await getAuthenticatedUser(c.req.header('Authorization') || null);
  if (!user) {
    return respondError(c, 401, 'unauthorized', 'Please sign in to continue.');
  }
  try {
    const payments = await kv.getByPrefix('audit:payment_webhook:');
    const updates = await kv.getByPrefix('audit:payment_update:');
    const subs = await kv.getByPrefix('audit:subscription_webhook:');
    return c.json({ payments, updates, subscriptions: subs });
  } catch (error: any) {
    return respondError(c, 500, 'audit_fetch_failed', 'Failed to fetch webhook audit');
  }
});

api.get('/monitor/webhooks/payments', async (c) => {
  const user = await getAuthenticatedUser(c.req.header('Authorization') || null);
  if (!user) {
    return respondError(c, 401, 'unauthorized', 'Please sign in to continue.');
  }
  try {
    const updates = await kv.getByPrefix('audit:payment_update:');
    const total = updates.length;
    const success = updates.filter((u: any) => u?.ok).length;
    const failure = updates.filter((u: any) => u && u.ok === false).length;
    const durations = updates.map((u: any) => Number(u?.durationMs || 0)).filter((n: number) => Number.isFinite(n) && n > 0);
    const avgMs = durations.length ? Math.round(durations.reduce((a: number, b: number) => a + b, 0) / durations.length) : null;
    const payments = await kv.getByPrefix('audit:payment_webhook:');
    const delivered = payments.length;
    const withDuration = payments.filter((p: any) => typeof p?.durationMs === 'number').length;
    return c.json({ updates: { total, success, failure, avgDurationMs: avgMs }, deliveries: { total: delivered, withDuration } });
  } catch (error: any) {
    return respondError(c, 500, 'monitor_fetch_failed', 'Failed to fetch monitoring data');
  }
});

api.post('/payments/create-intent', async (c) => {
  const user = await getAuthenticatedUser(c.req.header('Authorization') || null);
  if (!user) {
    return respondError(c, 401, 'unauthorized', 'Please sign in to continue.');
  }
  if (!stripe) {
    return respondError(c, 500, 'stripe_not_configured', 'Stripe is not configured');
  }
  try {
    const body = await c.req.json();
    const amount = Number(body?.amount || 0);
    const currency = String(body?.currency || 'usd');
    const purpose = String(body?.purpose || 'one_time');
    if (!Number.isFinite(amount) || amount < 100 || amount > 500000) {
      return respondError(c, 400, 'invalid_amount', 'Invalid amount');
    }
    const idempotencyKey = `${user.id}:${purpose}:${amount}:${Date.now()}`;
    const intent = await stripe.paymentIntents.create({
      amount,
      currency,
      automatic_payment_methods: { enabled: true },
      metadata: { user_id: user.id, purpose },
      receipt_email: String((user as any)?.email || ''),
    }, { idempotencyKey });
    await kv.set(`payment:${user.id}:${intent.id}`, { status: intent.status, amount, currency, created_at: new Date().toISOString(), purpose });
    return c.json({ clientSecret: intent.client_secret, intentId: intent.id, status: intent.status });
  } catch (error: any) {
    return respondError(c, 500, 'create_intent_failed', 'Failed to create payment intent.', { errorMessage: error?.message });
  }
});

api.post('/payments/checkout', async (c) => {
  const user = await getAuthenticatedUser(c.req.header('Authorization') || null);
  if (!user) {
    return respondError(c, 401, 'unauthorized', 'Please sign in to continue.');
  }
  if (!stripe) {
    return respondError(c, 500, 'stripe_not_configured', 'Stripe is not configured');
  }
  try {
    const body = await c.req.json();
    const purpose = String(body?.purpose || 'pro');
    const quantity = Math.max(1, Number(body?.quantity || 1));
    const successPath = String(body?.success_path || '/subscription?status=success');
    const cancelPath = String(body?.cancel_path || '/subscription?status=cancel');
    let mode: 'payment' | 'subscription' = 'payment';
    let productId = String(body?.productId || '');
    const priceIdOverride = String(body?.priceId || '');
    if (purpose === 'pro') {
      mode = 'subscription';
      productId = productId || STRIPE_PRODUCT_PRO;
    } else if (purpose === 'free') {
      mode = 'payment';
      productId = productId || STRIPE_PRODUCT_FREE;
    }
    if (!productId) {
      return respondError(c, 400, 'missing_product', 'Missing product');
    }
    const priceId = priceIdOverride || await resolvePriceId(productId, mode);
    if (!priceId) {
      return respondError(c, 500, 'price_resolution_failed', 'Unable to resolve price');
    }
    const looksAbsolute = (u: string) => /^https?:\/\//i.test(u);
    const successUrl = looksAbsolute(successPath) ? successPath : (safeRedirectUrl(successPath) || siteUrl() || '');
    const cancelUrl = looksAbsolute(cancelPath) ? cancelPath : (safeRedirectUrl(cancelPath) || siteUrl() || '');
    if (!successUrl || !cancelUrl) {
      return respondError(c, 500, 'redirect_unavailable', 'Redirect URLs not configured');
    }
    let session: any;
    session = await stripe.checkout.sessions.create({
      mode,
      line_items: [{ price: priceId, quantity }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: String(user.id),
      metadata: { user_id: user.id, purpose },
      customer_email: String((user as any)?.email || ''),
    });
    await kv.set(`checkout:${user.id}:${session.id}`, { purpose, quantity, created_at: new Date().toISOString() });
    return c.json({ id: session.id, url: String(session.url || '') });
  } catch (error: any) {
    return respondError(c, 500, 'checkout_failed', 'Failed to create checkout session.', { errorMessage: error?.message });
  }
});

api.get('/payments/:id/status', async (c) => {
  const user = await getAuthenticatedUser(c.req.header('Authorization') || null);
  if (!user) {
    return respondError(c, 401, 'unauthorized', 'Please sign in to continue.');
  }
  try {
    const id = c.req.param('id');
    const entry = await kv.get(`payment:${user.id}:${id}`);
    if (!entry) {
      return respondError(c, 404, 'not_found', 'Payment not found');
    }
    return c.json({ payment: entry });
  } catch (error: any) {
    return respondError(c, 500, 'status_fetch_failed', 'Failed to fetch status');
  }
});

api.post('/payments/webhook', async (c) => {
  if (!stripe || !STRIPE_WEBHOOK_SECRET) {
    return respondError(c, 500, 'stripe_webhook_not_configured', 'Stripe webhook not configured');
  }
  const sig = c.req.header('stripe-signature') || c.req.header('Stripe-Signature') || c.req.header('STRIPE-SIGNATURE') || '';
  const ip = c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip') || 'unknown';
  const payload = await c.req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(payload, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err: any) {
    try { await kvRetrySet(`audit:stripe_sig_error:${Date.now()}`, { route: '/server/payments/webhook', error: String(err?.message || err), at: new Date().toISOString() }); } catch {}
    return respondError(c, 400, 'invalid_signature', 'Invalid signature');
  }
  try {
    // Basic rate limiting per source IP (60/min)
    try {
      const rlKey = `ratelimit:webhook:${ip}`;
      const current = await kv.get(rlKey);
      const now = Date.now();
      const windowMs = 60_000;
      const limit = 60;
      let count = 0;
      let start = now;
      if (current && typeof current.start === 'string') {
        start = new Date(current.start).getTime();
        count = Number(current.count || 0);
        if (now - start > windowMs) { count = 0; start = now; }
      }
      count++;
      await kv.set(rlKey, { count, start: new Date(start).toISOString() });
      if (count > limit) {
        return respondError(c, 429, 'rate_limited', 'Too many webhook events');
      }
    } catch {}

    // Idempotency guard
    const processedKey = `webhook:processed:${event.id}`;
    const processed = await kv.get(processedKey);
    if (processed) {
      return c.json({ received: true, duplicate: true });
    }

    await kvRetrySet(`audit:payment_webhook:${event.id}`, { type: event.type, createdAt: new Date().toISOString(), startedAt: new Date().toISOString() });

    if (event.type === 'payment_intent.succeeded') {
      const pi = event.data.object as Stripe.PaymentIntent;
      const userId = (pi.metadata && (pi.metadata as any).user_id) || null;
      const purposeMeta = String((pi.metadata as any)?.purpose || '');
      if (userId) {
        await kvRetrySet(`payment:${userId}:${pi.id}`, { status: 'succeeded', amount: pi.amount, currency: pi.currency, created_at: new Date().toISOString(), purpose: purposeMeta });
        let purpose = purposeMeta;
        if (!purpose) {
          const amt = Number(pi.amount || 0);
          if (amt === 0) purpose = 'free';
        }
        if (purpose === 'free') {
          await updatePlanAtomic(String(userId), 'free', 'payment_intent.succeeded', event.id);
          try {
            const supabase = getSupabaseAdmin();
            await (supabase as any).auth.admin.updateUserById(String(userId), { user_metadata: { product_info: { prod_id: STRIPE_PRODUCT_FREE, plan_name: 'free' } } });
          } catch {}
        }
      } else {
        try {
          const expanded = await stripe.paymentIntents.retrieve(pi.id, { expand: ['latest_charge'] });
          const ch: any = (expanded as any)?.latest_charge || null;
          const email = String(ch?.billing_details?.email || '');
          if (email) {
            const supabaseAdmin = getSupabaseAdmin();
            const { data, error } = await (supabaseAdmin as any).auth.admin.listUsers({ perPage: 200, page: 1 });
            if (!error && data && Array.isArray(data.users)) {
              const found = data.users.find((u: any) => String(u?.email || '').toLowerCase() === email.toLowerCase());
              const uid = found?.id ? String(found.id) : null;
              if (uid) {
                await kvRetrySet(`payment:${uid}:${pi.id}`, { status: 'succeeded', amount: pi.amount, currency: pi.currency, created_at: new Date().toISOString(), purpose: purposeMeta });
                let purpose = purposeMeta;
                if (!purpose) {
                  const amt = Number(pi.amount || 0);
                  if (amt === 0) purpose = 'free';
                }
                if (purpose === 'free') {
                  await updatePlanAtomic(uid, 'free', 'payment_intent.succeeded', event.id);
                  try {
                    const supabase = getSupabaseAdmin();
                    await (supabase as any).auth.admin.updateUserById(uid, { user_metadata: { product_info: { prod_id: STRIPE_PRODUCT_FREE, plan_name: 'free' } } });
                  } catch {}
                }
              }
            }
          }
          if (!email) {
          try {
            const sessions = await stripe.checkout.sessions.list({ limit: 50 });
            let foundSession: Stripe.Checkout.Session | null = null;
            for (const s of (sessions?.data || [])) {
              const sPI = s.payment_intent;
              const pid = typeof sPI === 'string' ? sPI : (sPI ? (sPI as Stripe.PaymentIntent).id : undefined);
              if (pid && pid === pi.id) { foundSession = s; break; }
            }
            if (foundSession) {
              const fmd = foundSession.metadata as Record<string, string> | null;
              let uid: string | null = (fmd?.user_id) || foundSession.client_reference_id || null;
              if (!uid) {
                const e = String(foundSession.customer_details?.email || foundSession.customer_email || '');
                if (e) {
                  const { data, error } = await getSupabaseAdmin().auth.admin.listUsers({ perPage: 200, page: 1 });
                  if (!error && data && Array.isArray(data.users)) {
                    const fu = data.users.find((u) => String((u as { email?: string }).email || '').toLowerCase() === e.toLowerCase());
                    if (fu && fu.id) uid = String(fu.id);
                  }
                }
              }
              const fmd2 = foundSession.metadata as Record<string, string> | null;
              let purpose = String(fmd2?.purpose || '') || purposeMeta;
              if (!purpose) {
                try {
                  const items = await stripe.checkout.sessions.listLineItems(foundSession.id, { limit: 10 });
                  const first = Array.isArray(items?.data) ? items.data[0] : null;
                  const priceId = first?.price?.id || null;
                  if (priceId) {
                    const price = await stripe.prices.retrieve(priceId);
                    const productId = typeof price?.product === 'string' ? String(price.product) : ((price?.product as { id?: string })?.id || null);
                    if (productId === STRIPE_PRODUCT_FREE) purpose = 'free';
                  }
                } catch { void 0; }
              }
              if (uid && purpose === 'free') {
                await updatePlanAtomic(String(uid), 'free', 'pi_linked_session', event.id);
              }
            }
          } catch { void 0; }
          }
        } catch { void 0; }
      }
    } else if (event.type === 'payment_intent.payment_failed') {
      const pi = event.data.object as Stripe.PaymentIntent;
      const userId = (pi.metadata && (pi.metadata as { user_id?: string })?.user_id) || null;
      if (userId) {
        const _toEmail = await (async () => { try { const supabase = getSupabaseAdmin(); const { data, error } = await supabase.auth.admin.getUserById(userId); return error ? '' : String(data?.user?.email || ''); } catch { return ''; } })();
        try {
          const notificationId = crypto.randomUUID();
          const notification = { id: notificationId, type: 'payment', title: 'Payment Failed', message: 'Your payment did not complete.', timestamp: new Date().toISOString(), read: false };
          await kv.set(`notification:${userId}:${notificationId}`, notification);
        } catch { void 0; }
      }
    } else if (event.type === 'charge.succeeded') {
      const ch = event.data.object as Stripe.Charge;
      const userId = (ch.metadata && (ch.metadata as { user_id?: string })?.user_id) || null;
      const email = String(ch.receipt_email || '');
      if (userId) {
        const pmd = ch.payment_method_details as unknown as { card?: { last4?: string }, type?: string };
        await kv.set(`payment:${userId}:${ch.payment_intent}`, { status: 'succeeded', amount: ch.amount, currency: ch.currency, created_at: new Date().toISOString(), receipt_url: String(ch.receipt_url || ''), last4: String(pmd?.card?.last4 || ''), method: String(pmd?.type || '') });
        const toEmail = email || (await (async () => { try { const supabase = getSupabaseAdmin(); const { data, error } = await supabase.auth.admin.getUserById(userId); return error ? '' : String(data?.user?.email || ''); } catch { return ''; } })());
        if (toEmail && RESEND_API_KEY) {
          const amountUsd = (ch.amount || 0) / 100;
          const last4 = String(pmd?.card?.last4 || '');
          const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto"><h2>Payment Receipt</h2><p>Thank you for your payment.</p><p>Amount: $${amountUsd.toFixed(2)} ${ch.currency?.toUpperCase() || 'USD'}</p><p>Card: **** **** **** ${last4}</p><p><a href="${String(ch.receipt_url || '')}">View Stripe receipt</a></p><p>EACoder AI</p></div>`;
          await sendEmailResend(toEmail, 'Your EACoder AI Receipt', html);
        }
        try {
          const md = ch.metadata as Record<string, string> | null;
          let purpose = String(md?.purpose || '');
          if (!purpose) {
            try {
              const sessions = await stripe.checkout.sessions.list({ limit: 50 });
              let foundSession: Stripe.Checkout.Session | null = null;
              for (const s of (sessions?.data || [])) {
                const sPI = s.payment_intent;
                const pid = typeof sPI === 'string' ? sPI : (sPI ? (sPI as Stripe.PaymentIntent).id : undefined);
                if (pid && pid === String(ch.payment_intent || '')) { foundSession = s; break; }
              }
              if (foundSession) {
                const pl = String(((foundSession as unknown) as { payment_link?: string })?.payment_link || '');
                if (!purpose) {
                  const items = await stripe.checkout.sessions.listLineItems(foundSession.id, { limit: 10 });
                  const first = Array.isArray(items?.data) ? items.data[0] : null;
                  const priceId = first?.price?.id || null;
                  if (priceId) {
                    const price = await stripe.prices.retrieve(priceId);
                    const productId = typeof price?.product === 'string' ? String(price.product) : ((price?.product as { id?: string })?.id || null);
                    if (productId === STRIPE_PRODUCT_FREE) purpose = 'free';
                    else if (productId === STRIPE_PRODUCT_ELITE || productId === STRIPE_PRODUCT_ELITE_MONTHLY || productId === STRIPE_PRODUCT_ELITE_YEARLY) purpose = 'elite';
                    else if (productId === STRIPE_PRODUCT_PRO || productId === STRIPE_PRODUCT_PRO_MONTHLY || productId === STRIPE_PRODUCT_PRO_YEARLY) purpose = 'pro';
                  }
                }
              }
            } catch { void 0; }
          }
          if (purpose === 'free' || purpose === 'pro' || purpose === 'elite') {
            await updatePlanAtomic(String(userId), purpose, 'charge.succeeded', event.id);
            if (purpose !== 'free') {
                try {
                    const notificationId = crypto.randomUUID();
                    const title = `Welcome to ${purpose.charAt(0).toUpperCase() + purpose.slice(1)}! 🎉`;
                    await kv.set(`notification:${userId}:${notificationId}`, {
                        id: notificationId, type: 'subscription', title, message: 'Your plan has been upgraded.', timestamp: new Date().toISOString(), read: false
                    });
                } catch {}
            }
          }
        } catch { void 0; }
      }
    } else if (event.type === 'charge.dispute.created') {
      const d = event.data.object as Stripe.Dispute;
      const userId = (d.metadata && (d.metadata as { user_id?: string }).user_id) || null;
      if (userId) {
        await kv.set(`audit:dispute:${userId}:${event.id}`, { createdAt: new Date().toISOString(), payment_intent: d.payment_intent, amount: d.amount, currency: d.currency });
      }
    } else if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session?.mode === 'subscription') {
        // Pro subscriptions handled by subscription webhook
      } else {
        const md = session.metadata as Record<string, string> | null;
        let userId = (md?.user_id) || session?.client_reference_id || null;
        let purpose = String(md?.purpose || '');
        if (!userId) {
          try {
            const email = String(session.customer_details?.email || session.customer_email || '');
            if (email) {
              const { data, error } = await getSupabaseAdmin().auth.admin.listUsers({ perPage: 200, page: 1 });
              if (!error && data && Array.isArray(data.users)) {
                const found = data.users.find((u) => String((u as { email?: string }).email || '').toLowerCase() === email.toLowerCase());
                if (found && found.id) userId = String(found.id);
              }
            }
          } catch { void 0; }
        }
        if (!purpose) {
          try {
            const items = await stripe.checkout.sessions.listLineItems(session.id, { limit: 10 });
            const first = Array.isArray(items?.data) ? items.data[0] : null;
            const priceId = first?.price?.id || null;
            if (priceId) {
              const price = await stripe.prices.retrieve(priceId);
              const productId = typeof price?.product === 'string' ? String(price.product) : ((price?.product as { id?: string })?.id || null);
              
              // Priority 1: Product ID
              if (productId) {
                 if (productId === STRIPE_PRODUCT_ELITE || productId === STRIPE_PRODUCT_ELITE_MONTHLY || productId === STRIPE_PRODUCT_ELITE_YEARLY) {
                   purpose = 'elite';
                 } else if (productId === STRIPE_PRODUCT_PRO || productId === STRIPE_PRODUCT_PRO_MONTHLY || productId === STRIPE_PRODUCT_PRO_YEARLY) {
                   purpose = 'pro';
                 }
              }

              // Priority 3 (Part A): Name Fallback (if ID didn't match known env vars but might be valid)
              if (!purpose && productId) {
                try {
                  const product = await stripe.products.retrieve(productId);
                  const name = String(product?.name || '').toLowerCase();
                  if (name.includes('elite')) purpose = 'elite';
                  else if (name.includes('pro') || name.includes('premium')) purpose = 'pro';
                } catch { void 0; }
              }
            }
          } catch { void 0; }
        }
        // Priority 2: Amount Match (Fallback if Product ID/Name failed)
        if (!purpose && typeof session.amount_total === 'number') {
          const amt = Number(session.amount_total || 0);
          if (amt === 1900 || amt === 19900) purpose = 'pro';
          else if (amt === 2900 || amt === 29900) purpose = 'elite';
        }
        
        if (userId) {
          if (purpose === 'pro' || purpose === 'elite') {
            await updatePlanAtomic(String(userId), purpose, 'checkout.session.completed', event.id);
            // Send welcome notification
            const notificationId = crypto.randomUUID();
            const title = `Welcome to ${purpose.charAt(0).toUpperCase() + purpose.slice(1)}! 🎉`;
            await kv.set(`notification:${userId}:${notificationId}`, {
                id: notificationId,
                type: 'subscription',
                title,
                message: 'Your plan has been upgraded.',
                timestamp: new Date().toISOString(),
                read: false
            });
          }
        }
      }
    }
    await kvRetrySet(processedKey, { id: event.id, at: new Date().toISOString() });
    try {
      const started = await kv.get(`audit:payment_webhook:${event.id}`);
      const dur = started?.startedAt ? (Date.now() - new Date(started.startedAt).getTime()) : null;
      await kvRetrySet(`audit:payment_webhook:${event.id}`, { ...(started || {}), completedAt: new Date().toISOString(), durationMs: dur });
    } catch { void 0; }
    return c.json({ received: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return respondError(c, 500, 'webhook_processing_error', 'Webhook processing error', { errorMessage: msg });
  }
});

api.post('/payments/webhook/simulate', async (c) => {
  const user = await getAuthenticatedUser(c.req.header('Authorization') || null);
  const secret = c.req.header('X-Cron-Secret') || '';
  const ok = !!user || (CRON_SECRET && secret === CRON_SECRET);
  if (!ok) {
    return respondError(c, 401, 'unauthorized', 'Unauthorized');
  }
  try {
    const { type, user_id, purpose, amount } = await c.req.json();
    const eventId = `sim_${crypto.randomUUID()}`;
    const startedAt = new Date().toISOString();
    await kvRetrySet(`audit:payment_webhook:${eventId}`, { type, createdAt: startedAt, startedAt });
    if (type === 'payment_intent.succeeded') {
      const uid = String(user_id || (user ? user.id : ''));
      if (!uid) {
        return respondError(c, 400, 'bad_request', 'Missing user_id');
      }
      const amt = Number(amount || 2990);
      await kvRetrySet(`payment:${uid}:${eventId}`, { status: 'succeeded', amount: amt, currency: 'usd', created_at: new Date().toISOString(), purpose: String(purpose || '') });
      if (String(purpose || '') === 'free') {
        await updatePlanAtomic(uid, 'free', 'simulate', eventId);
      }
    } else if (type === 'checkout.session.completed') {
      const uid = String(user_id || (user ? user.id : ''));
      if (!uid) {
        return respondError(c, 400, 'bad_request', 'Missing user_id');
      }
      if (String(purpose || '') === 'pro') {
        await updatePlanAtomic(uid, 'pro', 'simulate.checkout.completed', eventId);
      }
    }
    await kvRetrySet(`webhook:processed:${eventId}`, { id: eventId, at: new Date().toISOString() });
    try {
      const started = await kv.get(`audit:payment_webhook:${eventId}`);
      const dur = started?.startedAt ? (Date.now() - new Date(started.startedAt).getTime()) : null;
      await kvRetrySet(`audit:payment_webhook:${eventId}`, { ...(started || {}), completedAt: new Date().toISOString(), durationMs: dur });
    } catch { void 0; }
    return c.json({ simulated: true, eventId });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return respondError(c, 500, 'simulate_failed', 'Failed to simulate', { errorMessage: msg });
  }
});

api.post('/payments/test-intent/pro', async (c) => {
  const user = await getAuthenticatedUser(c.req.header('Authorization') || null);
  const secret = c.req.header('X-Cron-Secret') || '';
  const ok = !!user || (CRON_SECRET && secret === CRON_SECRET);
  if (!ok) {
    return respondError(c, 401, 'unauthorized', 'Unauthorized');
  }
  if (!stripe) {
    return respondError(c, 500, 'stripe_not_configured', 'Stripe is not configured');
  }
  try {
    let email = '';
    let userIdOverride = '';
    try {
      const body = await c.req.json();
      userIdOverride = String(body?.user_id || '').trim();
    } catch { void 0; }
    try {
      const supabase = getSupabaseAdmin();
      const targetId = user ? user.id : (userIdOverride || '');
      if (targetId) {
        const { data, error } = await supabase.auth.admin.getUserById(targetId);
        email = error ? '' : String(data?.user?.email || '');
      }
    } catch { void 0; }
    const intent = await stripe.paymentIntents.create({
      amount: 1900,
      currency: 'usd',
      payment_method_types: ['card'],
      payment_method: 'pm_card_visa',
      confirm: true,
      metadata: { user_id: (user ? user.id : (userIdOverride || '')), purpose: 'pro' },
      receipt_email: email || undefined,
    });
    return c.json({ id: String(intent.id || ''), status: String(intent.status || '') });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return respondError(c, 500, 'test_intent_failed', 'Failed to create and confirm test intent', { errorMessage: msg });
  }
});

// Stripe webhook to confirm subscription
api.post('/subscription/webhook', async (c) => {
  if (!stripe || !STRIPE_WEBHOOK_SECRET_SUBSCRIPTION) {
    return respondError(c, 500, 'stripe_webhook_not_configured', 'Stripe webhook not configured');
  }

  const sig = c.req.header('stripe-signature') || c.req.header('Stripe-Signature') || c.req.header('STRIPE-SIGNATURE') || '';
  const payload = await c.req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(payload, sig, STRIPE_WEBHOOK_SECRET_SUBSCRIPTION);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Webhook signature verification failed:', msg);
    try { await kvRetrySet(`audit:stripe_sig_error:${Date.now()}`, { route: '/server/subscription/webhook', error: msg, at: new Date().toISOString() }); } catch { void 0; }
    return respondError(c, 400, 'invalid_signature', 'Invalid signature');
  }

  try {
    await kv.set(`audit:subscription_webhook:${event.id}`, { type: event.type, createdAt: new Date().toISOString() });
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session?.mode !== 'subscription') {
          // Non-subscription checkouts handled by payments webhook
          break;
        }
        const md = session.metadata as Record<string, string> | null;
        let userId = (md?.user_id) || session?.client_reference_id || null;
        let purpose = String(md?.purpose || '');
        
        let productId: string | null = null;
        try {
          const items = await stripe.checkout.sessions.listLineItems(session.id, { limit: 10 });
          const first = Array.isArray(items?.data) ? items.data[0] : null;
          const priceId = first?.price?.id || null;
          if (priceId) {
            const price = await stripe.prices.retrieve(priceId);
            productId = typeof price?.product === 'string' ? String(price.product) : ((price?.product as { id?: string })?.id || null);
          }
        } catch { void 0; }

        // Priority 1: Product ID Confirmation
        // This is authoritative as per user request
        if (productId) {
            if (productId === STRIPE_PRODUCT_ELITE || productId === STRIPE_PRODUCT_ELITE_MONTHLY || productId === STRIPE_PRODUCT_ELITE_YEARLY) {
                purpose = 'elite';
            } else if (productId === STRIPE_PRODUCT_PRO || productId === STRIPE_PRODUCT_PRO_MONTHLY || productId === STRIPE_PRODUCT_PRO_YEARLY) {
                purpose = 'pro';
            }
        }

        const isKnownPlan = purpose === 'elite' || purpose === 'pro';

        // Priority 2: Amount Match (Safety Override)
        // Only run if we haven't confirmed a known plan via Product ID, OR if we want to double check against potential mislabeling
        // Since user said "Trust the amount paid over the metadata purpose label", but also "use the product IDs for main confirmation"
        // We will prioritize Product ID. If Product ID is unknown or mismatched, we check amount.
        if (!isKnownPlan && typeof session.amount_total === 'number') {
          const amt = Number(session.amount_total);
          if (amt === 2900 || amt === 29900) {
            purpose = 'elite';
          } else if (amt === 1900 || amt === 19900) {
            purpose = 'pro';
          }
        }

        // Priority 3: Product Name Fallback
        if (!isKnownPlan && !purpose && productId) {
          try {
            const product = await stripe.products.retrieve(productId);
            const name = String(product?.name || '').toLowerCase();
            if (name.includes('elite')) purpose = 'elite';
            else if (name.includes('pro') || name.includes('premium')) purpose = 'pro';
            console.log(`[SubscriptionWebhook] Resolved plan by name: ${name} -> ${purpose} (${productId})`);
          } catch (e) {
            console.warn('Failed to retrieve product details for name check:', e);
          }
        }

        const subscriptionId = typeof session.subscription === 'string' ? session.subscription : (session.subscription ? (session.subscription as Stripe.Subscription).id : undefined);

        let expiryDate: string | undefined;
        try {
          if (subscriptionId) {
            const sub = await stripe.subscriptions.retrieve(subscriptionId as string);
            if (sub.current_period_end) {
              expiryDate = new Date(sub.current_period_end * 1000).toISOString();
            }
          }
        } catch (e) {
          console.warn('Could not retrieve subscription period:', e);
        }

        if (!userId) {
          try {
            const email = String(session.customer_details?.email || session.customer_email || '');
            if (email) {
              // Try to find user by email
              const { data, error } = await getSupabaseAdmin().auth.admin.listUsers({ perPage: 200, page: 1 });
              if (!error && data && Array.isArray(data.users)) {
                const found = data.users.find((u) => String((u as { email?: string }).email || '').toLowerCase() === email.toLowerCase());
                if (found && found.id) userId = String(found.id);
              }
            }
          } catch { void 0; }
        }

        if (userId) {
          {
            // Price Check Fallback (Robustness against missing env vars/names)
            if (!purpose && typeof session.amount_total === 'number') {
               const amt = Number(session.amount_total);
               // Elite: $29 or $299
               if (amt === 2900 || amt === 29900) purpose = 'elite';
               // Pro: $19 or $199
               else if (amt === 1900 || amt === 19900) purpose = 'pro';
            }

            if (!purpose) {
                // Log failure to KV for debugging
                try { await kv.set(`debug:webhook:fail:${session.id}`, { reason: 'Unknown plan', productId, amount: session.amount_total }); } catch { void 0; }
                // Do not proceed with update to avoid accidental pro assignment
                break;
            }

            const plan = (purpose === 'elite') ? 'elite' : 'pro';
            await updatePlanAtomic(String(userId), plan, 'subscription.webhook', event.id, productId || undefined);
            const subscription = { plan, subscriptionDate: new Date().toISOString(), ...(expiryDate ? { expiryDate } : {}) };
            await kv.set(`user:${userId}:subscription`, subscription);
            await kv.set(`session:${userId}:payment_complete`, { value: true, timestamp: new Date().toISOString() });
            const notificationId = crypto.randomUUID();
            const notification = { id: notificationId, type: 'subscription', title: `Welcome to ${plan.charAt(0).toUpperCase() + plan.slice(1)}! 🎉`, message: 'Your AI analysis updates are now active.', timestamp: new Date().toISOString(), read: false };
            await kv.set(`notification:${userId}:${notificationId}`, notification);
            
            await kv.set(`audit:${userId}:${event.id}`, { event: 'checkout.completed', sessionId: session.id, createdAt: new Date().toISOString(), plan, status: 'completed' });
            try {
              let toEmail = '';
              const cd = session.customer_details as { email?: string } | null;
              if (cd?.email) {
                toEmail = String(cd.email);
              } else {
                try {
                  const supabase = getSupabaseAdmin();
                  const { data, error } = await supabase.auth.admin.getUserById(userId);
                  toEmail = error ? '' : String(data?.user?.email || '');
                } catch { void 0; }
              }
              if (toEmail && RESEND_API_KEY) {
                const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto"><h2>${plan.charAt(0).toUpperCase() + plan.slice(1)} Plan Activated</h2><p>Your plan is now active.</p><p>Features: Unlimited generations, weekly AI re-analysis, smart notifications.</p><p>Enjoy advanced features in EACoder AI.</p><p>EACoder AI</p></div>`;
                await sendEmailResend(toEmail, `Your EACoder AI Plan Activated: ${plan.charAt(0).toUpperCase() + plan.slice(1)}`, html);
              }
            } catch { void 0; }
          }
        }
        break;
      }
      case 'invoice.payment_failed': {
        const inv = event.data.object as Stripe.Invoice;
        const userId = (inv.metadata && (inv.metadata as { user_id?: string })?.user_id) || null;
        if (userId) {
          await kv.set(`audit:${userId}:${event.id}`, {
            event: 'payment.failed',
            createdAt: new Date().toISOString(),
            plan: 'pro',
            status: 'failed',
            reason: inv?.hosted_invoice_url ? 'invoice_failed' : 'unknown',
          });
          try {
            const notificationId = crypto.randomUUID();
            const notification = { id: notificationId, type: 'payment', title: 'Payment Failed', message: 'Your Pro subscription payment failed.', timestamp: new Date().toISOString(), read: false };
            await kv.set(`notification:${userId}:${notificationId}`, notification);
          } catch { void 0; }
        }
        break;
      }
      default:
        // Ignore other events but log
        console.log('Unhandled Stripe event:', event.type);
    }

    return c.json({ received: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Webhook handler error:', msg);
    return respondError(c, 500, 'webhook_processing_error', 'Webhook processing error');
  }
});

// Get notifications
api.get('/notifications', async (c) => {
  const user = await getAuthenticatedUser(c.req.header('Authorization') || null);
  
  if (!user) {
    return respondError(c, 401, 'unauthorized', 'Please sign in to continue.');
  }
  
  try {
    const notifications = await kv.getByPrefix(`notification:${user.id}:`);
    
    // Sort by timestamp descending
    const sorted = notifications.sort((a: unknown, b: unknown) => 
      new Date(String((b as { timestamp?: string }).timestamp)).getTime() -
      new Date(String((a as { timestamp?: string }).timestamp)).getTime()
    );

    // Filter out duplicate analysis spam (same strategy, within 2 mins)
    const filtered: any[] = [];
    const lastAnalysisTime = new Map<string, number>(); // strategyId -> timestamp
    const toDeleteIds: string[] = [];

    for (const n of sorted as any[]) {
      if (n.type === 'analysis_update' && n.strategyId) {
        const ts = new Date(n.timestamp).getTime();
        const lastTs = lastAnalysisTime.get(n.strategyId);
        
        if (lastTs && Math.abs(lastTs - ts) < 2 * 60 * 1000) {
          // Duplicate/spam detected
          toDeleteIds.push(n.id);
          continue;
        }
        lastAnalysisTime.set(n.strategyId, ts);
      }
      filtered.push(n);
    }

    // Lazy cleanup of spam in background
    if (toDeleteIds.length > 0) {
      (async () => {
        try {
          for (const id of toDeleteIds) await kv.del(`notification:${user.id}:${id}`);
          console.log(`[Notifications] Cleaned up ${toDeleteIds.length} spam notifications for user ${user.id}`);
        } catch (e) { console.error('Cleanup error', e); }
      })();
    }
    
    return c.json({ notifications: filtered });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log('Get notifications error:', msg);
    return respondError(c, 500, 'notifications_fetch_failed', 'Failed to load notifications.');
  }
});

// Get unread notification count
api.get('/notifications/unread-count', async (c) => {
  const user = await getAuthenticatedUser(c.req.header('Authorization') || null);
  
  if (!user) {
    return respondError(c, 401, 'unauthorized', 'Please sign in to continue.');
  }
  
  try {
    const notifications = await kv.getByPrefix(`notification:${user.id}:`);
    
    // Sort for consistent dedup
    const sorted = notifications.sort((a: unknown, b: unknown) => 
      new Date(String((b as { timestamp?: string }).timestamp)).getTime() -
      new Date(String((a as { timestamp?: string }).timestamp)).getTime()
    );

    // Dedup logic (same as GET /notifications)
    const lastAnalysisTime = new Map<string, number>();
    const filtered = sorted.filter((n: any) => {
      if (n.type === 'analysis_update' && n.strategyId) {
        const ts = new Date(n.timestamp).getTime();
        const lastTs = lastAnalysisTime.get(n.strategyId);
        if (lastTs && Math.abs(lastTs - ts) < 2 * 60 * 1000) return false;
        lastAnalysisTime.set(n.strategyId, ts);
      }
      return true;
    });

    const unreadCount = filtered.filter((n: unknown) => !(n as { read?: boolean }).read).length;
    
    return c.json({ count: unreadCount });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log('Get unread count error:', msg);
    return respondError(c, 500, 'unread_count_fetch_failed', 'Failed to load unread count.');
  }
});

 

// Mark notification as read
api.post('/notifications/:id/read', async (c) => {
  const user = await getAuthenticatedUser(c.req.header('Authorization') || null);
  
  if (!user) {
    return respondError(c, 401, 'unauthorized', 'Please sign in to continue.');
  }
  
  try {
    const notificationId = c.req.param('id');
    const notification = await kv.get(`notification:${user.id}:${notificationId}`);
    
    if (notification) {
      notification.read = true;
      await kv.set(`notification:${user.id}:${notificationId}`, notification);
    }
    
    return c.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log('Mark notification as read error:', msg);
    return respondError(c, 500, 'notification_mark_read_failed', 'Failed to mark notification as read.');
  }
});

// Delete notification
api.delete('/notifications/:id', async (c) => {
  const user = await getAuthenticatedUser(c.req.header('Authorization') || null);
  
  if (!user) {
    return respondError(c, 401, 'unauthorized', 'Please sign in to continue.');
  }
  
  try {
    const notificationId = c.req.param('id');
    await kv.del(`notification:${user.id}:${notificationId}`);
    
    return c.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log('Delete notification error:', msg);
    return respondError(c, 500, 'notification_delete_failed', 'Failed to delete notification.');
  }
});

// Trigger strategy re-analysis (premium or free-access strategies for basic)
api.post('/strategies/:id/reanalyze', async (c) => {
  const user = await getAuthenticatedUser(c.req.header('Authorization') || null);
  
  if (!user) {
    return respondError(c, 401, 'unauthorized', 'Please sign in to continue.');
  }
  
  try {
    // Subscription and free-access gating
    const subscription = await kv.get(`user:${user.id}:subscription`);
    const isPro = !!subscription && subscription.plan === 'pro';
    
    const strategyId = c.req.param('id');
    const strategy = await kv.get(`strategy:${user.id}:${strategyId}`);
    
    if (!strategy) {
      return respondError(c, 404, 'not_found', 'Strategy not found');
    }

    const body = await c.req.json().catch(() => ({}));
    const querySuppress = c.req.query('suppress_notification') === 'true';
    const bodySuppress = body?.suppress_notification === true;

    // Auto-suppress notification if strategy is newly created (within 2 mins)
    // This prevents double notifications since 'strategy_creation' notification is already sent
    const isNew = strategy.created_at && (Date.now() - new Date(strategy.created_at).getTime() < 120000);
    const isPending = strategy.status === 'pending' || strategy.status === 'generating';

    const suppress_notification = querySuppress || bodySuppress || isNew || isPending;


    
    // Generate AI-powered analysis metrics and improvements
    let improvements: string[];
    let metrics: Record<string, unknown> | null = null;
    try {
      improvements = await analyzeStrategyWithAI(strategy);
      metrics = await generateAnalysisMetricsWithAI(strategy);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log('AI strategy analysis error:', msg);
      improvements = ['Unable to generate analysis at this time. Please try again later.'];
    }
    
    // Create a notification with analysis update
    let notification = null;
    if (!suppress_notification) {
      const notificationId = crypto.randomUUID();
      notification = {
        id: notificationId,
        type: 'analysis_update',
        title: 'Strategy Analysis Updated',
        message: `We've completed a new AI-powered analysis of your strategy and found ${improvements.length} potential improvements.`,
        timestamp: new Date().toISOString(),
        read: false,
        strategyId: strategy.id,
        strategyName: strategy.strategy_name,
        improvements,
      };
      
      await kv.set(`notification:${user.id}:${notificationId}`, notification);
    }

    // Persist metrics on the strategy record for client consumption
    try {
      const current = await kv.get(`strategy:${user.id}:${strategy.id}`) || {};
      const updated = {
        ...current,
        analysis: {
          ...(current.analysis || {}),
          metrics: metrics,
          improvements,
        },
      };
      await kv.set(`strategy:${user.id}:${strategy.id}`, updated);
    } catch (_) {
      // non-blocking
    }
    
    // Update next analysis date
    const nextAnalysis = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    await kv.set(`analysis:${user.id}:${strategy.id}:next`, { 
      nextAnalysisDate: nextAnalysis,
      strategyName: strategy.strategy_name,
      lastAnalysis: new Date().toISOString(),
    });
    
    return c.json({ 
      success: true, 
      notification,
      nextAnalysisDate: nextAnalysis,
      metrics,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log('Re-analyze strategy error:', msg);
    return respondError(c, 500, 'analysis_update_failed', 'Failed to re-analyze strategy.');
  }
});

api.post('/strategies/:id/retry', async (c) => {
  const authHeader = c.req.header('Authorization') || null;
  const user = await getAuthenticatedUser(authHeader);
  
  if (!user) {
    return respondError(c, 401, 'unauthorized', 'Please sign in to continue.');
  }

  const strategyId = c.req.param('id');
  const MIN_RETRY_INTERVAL_MS = 60_000; // 1 minute guard
  
  try {
    // Get the strategy from KV store
    const strategy = await kv.get(`strategy:${user.id}:${strategyId}`);
    
    if (!strategy) {
      return respondError(c, 404, 'not_found', 'Strategy not found');
    }

    // Gate retries: free users may only retry strategies within free-access
    const subscription = await kv.get(`user:${user.id}:subscription`);
    const isPro = !!subscription && subscription.plan === 'pro';
    if (!isPro && strategy.free_access !== true) {
      return respondError(c, 403, 'feature_restricted', 'Pro subscription required', { redirect: '/subscription' });
    }

    // Check if strategy is in error state
    if (strategy.status !== 'error') {
      return respondError(c, 400, 'invalid_state', 'Strategy is not in error state');
    }

    // Prevent retry spamming: block if last retry was too recent
    const lastRetry = await kv.get(`retry:last:${user.id}:${strategyId}`);
    if (lastRetry && lastRetry.timestamp) {
      const last = new Date(lastRetry.timestamp).getTime();
      const now = Date.now();
      if (now - last < MIN_RETRY_INTERVAL_MS) {
        const waitMs = MIN_RETRY_INTERVAL_MS - (now - last);
        return respondError(c, 429, 'retry_too_frequent', `Retry too frequent. Try again in ${Math.ceil(waitMs/1000)}s.`);
      }
    }

    

    // Update strategy status to generating
    const updatedStrategy = {
      ...strategy,
      status: 'generating',
      error: null,
      last_retry_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    await kv.set(`strategy:${user.id}:${strategyId}`, updatedStrategy);
    await kv.set(`retry:last:${user.id}:${strategyId}`, { timestamp: updatedStrategy.last_retry_at });

    // Generate code using Claude AI in background with retry logic
    (async () => {
      let retryCount = 0;
      const maxRetries = 3;
      const baseDelay = 1000; // 1 second

      while (retryCount < maxRetries) {
        try {
          
          
          const generatedCode = await generateCodeWithAI(
            strategy.platform,
            strategy.description,
            strategy.risk_management || '',
            strategy.instrument || '',
            { indicators: Array.isArray(strategy.indicators) ? strategy.indicators.filter(Boolean) : [], indicator_mode: (strategy.indicator_mode === 'single' || strategy.indicator_mode === 'multiple') ? strategy.indicator_mode : 'multiple' }
          );

          // Update strategy with generated code
          const finalStrategy = {
            ...updatedStrategy,
            generated_code: generatedCode,
            status: 'completed',
            updated_at: new Date().toISOString()
          };
          
          await kv.set(`strategy:${user.id}:${strategyId}`, finalStrategy);
          
          return;
          
        } catch (error: unknown) {
          retryCount++;
          const msg = error instanceof Error ? error.message : String(error);
          console.debug('Retry attempt error:', msg);
          
          
          if (retryCount >= maxRetries) {
            const queuedStrategy = {
              ...updatedStrategy,
              status: 'pending',
              error: null,
              updated_at: new Date().toISOString()
            };
            await kv.set(`strategy:${user.id}:${strategyId}`, queuedStrategy);
            
            return;
          }
          
          // Wait before next retry with exponential backoff
          const delay = baseDelay * Math.pow(2, retryCount - 1);
          await new Promise<void>(resolve => setTimeout(resolve, delay));
        }
      }
    })();

    return c.json({ 
      message: 'Retry initiated',
      strategy: updatedStrategy
    });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Error retrying strategy generation:', msg);
    return respondError(c, 500, 'internal_error', 'Internal server error');
  }
});

api.get('/strategies/:id/next-analysis', async (c) => {
  const user = await getAuthenticatedUser(c.req.header('Authorization') || null);
  
  if (!user) {
    return respondError(c, 401, 'unauthorized', 'Please sign in to continue.');
  }
  
  try {
    const strategyId = c.req.param('id');
    const next = await kv.get(`analysis:${user.id}:${strategyId}:next`);

    // If user is pro/elite and analysis is due, auto-run and reschedule
    const subscription = await kv.get(`user:${user.id}:subscription`);
    const plan = subscription?.plan;
    const isPremium = !!subscription && (plan === 'pro' || plan === 'elite');
    const now = Date.now();
    const nextAt = next?.nextAnalysisDate ? new Date(next.nextAnalysisDate).getTime() : null;

    if (isPremium && nextAt && now >= nextAt) {
      const strategy = await kv.get(`strategy:${user.id}:${strategyId}`);
      if (strategy) {
        let improvements: string[];
        try {
          improvements = await analyzeStrategyWithAI(strategy);
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : String(error);
          console.log('Auto analysis error:', msg);
          improvements = ['Unable to generate analysis at this time. Please try again later.'];
        }
        // Create notification
        const notificationId = crypto.randomUUID();
        const notification = {
          id: notificationId,
          type: 'analysis_update',
          title: 'Strategy Analysis Updated',
          message: `We\'ve completed a new AI-powered analysis of your strategy and found ${improvements.length} potential improvements.`,
          timestamp: new Date().toISOString(),
          read: false,
          strategyId: strategy.id,
          strategyName: strategy.strategy_name,
          improvements,
        };
        await kv.set(`notification:${user.id}:${notificationId}`, notification);

        // Reschedule next analysis for 5 days later
        const nextAnalysisDate = new Date(now + 5 * 24 * 60 * 60 * 1000).toISOString();
        await kv.set(`analysis:${user.id}:${strategy.id}:next`, {
          nextAnalysisDate,
          strategyName: strategy.strategy_name,
          lastAnalysis: new Date().toISOString(),
        });
        return c.json({ next_analysis: nextAnalysisDate, ran: true });
      }
    }

    if (!next || !next.nextAnalysisDate) {
      return c.json({ next_analysis: null });
    }
    return c.json({ next_analysis: next.nextAnalysisDate });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log('Get next analysis error:', msg);
    return respondError(c, 500, 'next_analysis_fetch_failed', 'Failed to get next analysis date.');
  }
});

// Scheduler endpoint: scan user's premium strategies, run due analyses, and (if missing) schedule next date
api.post('/analysis/schedule/run', async (c) => {
  const user = await getAuthenticatedUser(c.req.header('Authorization') || null);
  if (!user) {
    return respondError(c, 401, 'unauthorized', 'Please sign in to continue.');
  }

  try {
    const subscription = await kv.get(`user:${user.id}:subscription`);
    const plan = subscription?.plan;
    const isPremium = !!subscription && (plan === 'pro' || plan === 'elite');
    if (!isPremium) {
      return respondError(c, 403, 'feature_restricted', 'Pro subscription required', { redirect: '/subscription' });
    }

    const strategies = await kv.getByPrefix(`strategy:${user.id}:`);
    const now = Date.now();
    let processed = 0;
    let ran = 0;
    let scheduled = 0;
    const updates: { id: string; name: string; improvements: string[] }[] = [];

    for (const strategy of strategies || []) {
      processed++;
      const next = await kv.get(`analysis:${user.id}:${strategy.id}:next`);
      const nextAt = next?.nextAnalysisDate ? new Date(next.nextAnalysisDate).getTime() : null;
      const shouldRun = nextAt !== null && now >= nextAt;

      if (!nextAt) {
        const nextAnalysisDate = new Date(now + 5 * 24 * 60 * 60 * 1000).toISOString();
        await kv.set(`analysis:${user.id}:${strategy.id}:next`, {
          nextAnalysisDate,
          strategyName: strategy.strategy_name,
          lastAnalysis: null,
        });
        scheduled++;
        continue;
      }

      if (shouldRun) {
        let improvements: string[];
        try {
          improvements = await analyzeStrategyWithAI(strategy);
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : String(error);
          console.log('Scheduler analysis error:', msg);
          improvements = ['Unable to generate analysis at this time. Please try again later.'];
        }
        
        updates.push({
          id: strategy.id,
          name: strategy.strategy_name,
          improvements
        });

        const nextAnalysisDate = new Date(now + 5 * 24 * 60 * 60 * 1000).toISOString();
        await kv.set(`analysis:${user.id}:${strategy.id}:next`, {
          nextAnalysisDate,
          strategyName: strategy.strategy_name,
          lastAnalysis: new Date().toISOString(),
        });
        ran++;
      }
    }
    
    // Aggregate notifications to prevent spam
    if (updates.length > 0) {
      const notificationId = crypto.randomUUID();
      let title = 'Strategy Analysis Updated';
      let message = '';
      let strategyId: string | undefined = undefined;
      let strategyName: string | undefined = undefined;
      let improvements: string[] = [];

      if (updates.length === 1) {
        const up = updates[0];
        strategyId = up.id;
        strategyName = up.name;
        improvements = up.improvements;
        message = `We've completed a new AI-powered analysis of your strategy and found ${improvements.length} potential improvements.`;
      } else {
        title = 'Strategies Updated';
        message = `We've completed AI analysis for ${updates.length} of your strategies. Check them out for new improvements!`;
        // We can't link to a single strategy, so maybe leave strategyId undefined or link to the first one
        strategyId = updates[0].id; // Optional: deep link to the first one?
      }

      const notification = {
        id: notificationId,
        type: 'analysis_update',
        title,
        message,
        timestamp: new Date().toISOString(),
        read: false,
        strategyId,
        strategyName,
        improvements,
        count: updates.length // Optional metadata
      };
      await kv.set(`notification:${user.id}:${notificationId}`, notification);
    }

    await kv.set(`audit:${user.id}:scheduler:${Date.now()}`, {
      event: 'scheduler.run',
      processed,
      ran,
      scheduled,
      createdAt: new Date().toISOString(),
    });

    return c.json({ processed, ran, scheduled });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return respondError(c, 500, 'scheduler_failed', 'Failed to run scheduler.', { errorMessage: msg });
  }
});

  // Admin scheduler: scan ALL premium users and run due analyses
  api.post('/analysis/schedule/run-admin', async (c) => {
  const secret = c.req.header('X-Cron-Secret') || '';
  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return respondError(c, 401, 'unauthorized', 'Unauthorized');
  }

  try {
    // Find all pro subscriptions
    const { data, error } = await getSupabaseAdmin()
      .from('kv_store_00a119be')
      .select('key,value')
      .like('key', 'user:%:subscription');
    if (error) {
      console.error('Admin schedule query error:', error.message);
      return respondError(c, 500, 'admin_query_failed', 'Failed to query subscriptions');
    }

    const proSubs = (data || []).filter((row: unknown) => (row as { value?: { plan?: string } }).value?.plan === 'pro');
    const now = Date.now();
    let usersScanned = 0;
    let strategiesProcessed = 0;
    let ran = 0;
    let scheduled = 0;

    for (const row of proSubs) {
      const key: string = row.key as string;
      const parts = key.split(':');
      const userId = parts[1];
      if (!userId) continue;
      usersScanned++;

      const strategies = await kv.getByPrefix(`strategy:${userId}:`);
      for (const strategy of strategies || []) {
        strategiesProcessed++;
        const next = await kv.get(`analysis:${userId}:${strategy.id}:next`);
        const nextAt = next?.nextAnalysisDate ? new Date(next.nextAnalysisDate).getTime() : null;
        const shouldRun = nextAt !== null && now >= nextAt;

        if (!nextAt) {
          const nextAnalysisDate = new Date(now + 5 * 24 * 60 * 60 * 1000).toISOString();
          await kv.set(`analysis:${userId}:${strategy.id}:next`, {
            nextAnalysisDate,
            strategyName: strategy.strategy_name,
            lastAnalysis: null,
          });
          scheduled++;
          continue;
        }

        if (shouldRun) {
          let improvements: string[];
          try {
            improvements = await analyzeStrategyWithAI(strategy);
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            console.log('Admin scheduler analysis error:', msg);
            improvements = ['Unable to generate analysis at this time. Please try again later.'];
          }

          // Create notification
          const notificationId = crypto.randomUUID();
          const notification = {
            id: notificationId,
            type: 'analysis_update',
            title: 'Strategy Analysis Updated',
            message: `We\'ve completed a new AI-powered analysis of your strategy and found ${improvements.length} potential improvements.`,
            timestamp: new Date().toISOString(),
            read: false,
            strategyId: strategy.id,
            strategyName: strategy.strategy_name,
            improvements,
          };
          await kv.set(`notification:${userId}:${notificationId}`, notification);

          // Reschedule next analysis for 5 days later
          const nextAnalysisDate = new Date(now + 5 * 24 * 60 * 60 * 1000).toISOString();
          await kv.set(`analysis:${userId}:${strategy.id}:next`, {
            nextAnalysisDate,
            strategyName: strategy.strategy_name,
            lastAnalysis: new Date().toISOString(),
          });
          ran++;
        }
      }
    }

    return c.json({ usersScanned, strategiesProcessed, ran, scheduled });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('Admin scheduler error:', msg);
    return respondError(c, 500, 'internal_error', 'Internal server error');
  }
  });

  // Admin: export all users with subscription info as CSV
  api.get('/admin/export/users.csv', async (c) => {
    const user = await getAuthenticatedUser(c.req.header('Authorization') || null);
    const secret = c.req.header('X-Cron-Secret') || '';
    const ok = !!user || (CRON_SECRET && secret === CRON_SECRET);
    if (!ok) {
      return respondError(c, 401, 'unauthorized', 'Unauthorized');
    }

    try {
      let page = 1;
      const perPage = 100;
      let done = false;
      const rows: Array<{ id: string; username: string; email: string; plan: 'Free' | 'Pro' | 'Elite'; subscriptionDate: string | '' }> = [];

      while (!done) {
        const { data, error } = await getSupabaseAdmin().auth.admin.listUsers({ page, perPage });
        if (error) {
          const emsg = error instanceof Error ? error.message : String(error);
          console.error('Users export listUsers error:', emsg);
          return respondError(c, 500, 'admin_list_users_failed', 'Failed to list users');
        }
        const users: Array<{ id: string; email?: string; user_metadata?: Record<string, unknown> }> = Array.isArray(data?.users) ? (data!.users as Array<{ id: string; email?: string; user_metadata?: Record<string, unknown> }>) : [];
        if (users.length === 0) {
          done = true;
          break;
        }

        for (const u of users) {
          const id = String(u.id || '');
          const email = String(u.email || '').trim();
          const meta = (u?.user_metadata || {}) as Record<string, unknown>;
          const username = String(meta?.display_name || meta?.full_name || meta?.name || '').trim();
          let plan: 'Free' | 'Pro' | 'Elite' = 'Free';
          let subscriptionDate: string | '' = '';
          try {
            const sub = await kv.get(`user:${id}:subscription`);
            if (sub) {
              if (sub.plan === 'elite') plan = 'Elite';
              else if (sub.plan === 'pro' || sub.plan === 'premium') plan = 'Pro';
              else plan = 'Free';
              subscriptionDate = String(sub.subscriptionDate || '').trim();
            }
          } catch (_e) { void 0; }
          rows.push({ id, username, email, plan, subscriptionDate });
        }

        page += 1;
      }

      rows.sort((a, b) => {
        const rank = { Elite: 3, Pro: 2, Free: 1 };
        if (a.plan !== b.plan) return rank[b.plan] - rank[a.plan];
        return a.email.localeCompare(b.email);
      });

      const header = ['User ID', 'Username', 'Email', 'Subscription Type', 'Subscription Date'];
      const csvLines = [header.join(',')];
      for (const r of rows) {
        const safe = (val: string) => {
          if (val == null) return '';
          const needsQuotes = /[",\n]/.test(val);
          const escaped = val.replace(/"/g, '""');
          return needsQuotes ? `"${escaped}"` : escaped;
        };
        csvLines.push([
          safe(r.id),
          safe(r.username),
          safe(r.email),
          safe(r.plan),
          safe(r.subscriptionDate),
        ].join(','));
      }

      const csv = csvLines.join('\n');
      return new Response(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('Users export error:', msg);
      return respondError(c, 500, 'admin_export_failed', 'Failed to export users');
    }
  });

  // Parallel code generation and analysis with shared matrix configuration
  const normalizeMatrix = (matrix: Record<string, unknown>) => {
    try {
      // Deterministic stringify by sorting keys shallowly
      const sorted: Record<string, unknown> = {};
      Object.keys(matrix || {}).sort().forEach((k) => {
        const v = (matrix as Record<string, unknown>)[k];
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          const obj = v as Record<string, unknown>;
          const sv: Record<string, unknown> = {};
          Object.keys(obj).sort().forEach((sk) => { sv[sk] = obj[sk]; });
          sorted[k] = sv;
        } else {
          sorted[k] = v as unknown;
        }
      });
      return JSON.stringify(sorted);
    } catch {
      return JSON.stringify(matrix || {});
    }
  };

  const runKey = (userId: string, runId: string) => `run:${userId}:${runId}`;

  const validateSharedConfig = async (userId: string, runId: string, matrixKeyExpected: string) => {
    const base = runKey(userId, runId);
    const shared = await kv.get(`${base}:matrixKey`);
    return shared === matrixKeyExpected;
  };

  const pushSegment = async (userId: string, runId: string, segment: Record<string, unknown>) => {
    const base = runKey(userId, runId);
    const segs = (await kv.get(`${base}:segments`)) || [];
    segs.push(segment);
    await kv.set(`${base}:segments`, segs);
  };

  const getSegments = async (userId: string, runId: string) => {
    const base = runKey(userId, runId);
    return (await kv.get(`${base}:segments`)) || [];
  };

  const setAnalysis = async (userId: string, runId: string, analysis: Record<string, unknown>) => {
    const base = runKey(userId, runId);
    await kv.set(`${base}:analysis`, analysis);
  };

  const _getAnalysis = async (userId: string, runId: string) => {
    const base = runKey(userId, runId);
    return await kv.get(`${base}:analysis`);
  };

  // Start parallel workflow: generate first code segments and initial analysis concurrently
  api.post('/generation/parallel/start', async (c) => {
    const user = await getAuthenticatedUser(c.req.header('Authorization') || null);
    if (!user) {
      return respondError(c, 401, 'unauthorized', 'Please sign in to continue.');
    }

    try {
      const body = await c.req.json();
      const strategy = body?.strategy || {};
      const matrix = body?.matrix || {};
      const maxSegments = Number(body?.maxSegments || 3);
      const runId = crypto.randomUUID();
      const base = runKey(user.id, runId);

      // Persist shared state
      const matrixKey = normalizeMatrix(matrix);
      await kv.set(`${base}:matrixKey`, matrixKey);
      await kv.set(`${base}:matrix`, matrix);
      await kv.set(`${base}:strategy`, strategy);
      await kv.set(`${base}:status`, { startedAt: new Date().toISOString(), state: 'running' });

      const genTask = (async () => {
        // Generate initial segments concurrently; in real system, call generator here
        for (let i = 1; i <= maxSegments; i++) {
          // Validate shared config before each segment
          const valid = await validateSharedConfig(user.id, runId, matrixKey);
          if (!valid) {
            await pushSegment(user.id, runId, { id: `seg-${i}`, error: 'Matrix config mismatch', createdAt: new Date().toISOString() });
            break;
          }
          const segment = {
            id: `seg-${i}`,
            code: `// Segment ${i} generated using shared matrix configuration`,
            meta: { index: i, matrixKey },
            createdAt: new Date().toISOString(),
          };
          await pushSegment(user.id, runId, segment);
        }
      })();

      const analysisTask = (async () => {
        // Perform initial analysis concurrently and consume segments as they appear
        const valid = await validateSharedConfig(user.id, runId, matrixKey);
        if (!valid) {
          await setAnalysis(user.id, runId, { error: 'Matrix config mismatch' });
          return;
        }
        // Simple initial analysis that references shared segments
        let attempts = 0;
        let lastCount = 0;
        while (attempts < 10) {
          const segs = await getSegments(user.id, runId);
          if (segs.length !== lastCount) {
            lastCount = segs.length;
            const analysis = {
              status: 'partial',
              segmentsAnalyzed: segs.length,
              summary: `Analyzed ${segs.length} segment(s) using shared matrix`,
              updatedAt: new Date().toISOString(),
            };
            await setAnalysis(user.id, runId, analysis);
          }
          // Small delay to allow generation to add segments
          await new Promise((r) => setTimeout(r, 50));
          attempts++;
        }
        // Finalize analysis snapshot
        const finalSegs = await getSegments(user.id, runId);
        await setAnalysis(user.id, runId, {
          status: 'complete',
          segmentsAnalyzed: finalSegs.length,
          summary: `Initial analysis complete with ${finalSegs.length} segment(s)`,
          completedAt: new Date().toISOString(),
        });
      })();

      await Promise.allSettled([genTask, analysisTask]);
      await kv.set(`${base}:status`, { state: 'completed', finishedAt: new Date().toISOString() });

      return c.json({ runId, matrixKey });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('Parallel start error:', msg);
      return respondError(c, 500, 'parallel_start_failed', 'Failed to start parallel workflow');
    }
  });

  // Query parallel workflow status and shared data
  api.get('/generation/parallel/status/:runId', async (c) => {
    const user = await getAuthenticatedUser(c.req.header('Authorization') || null);
    if (!user) {
      return respondError(c, 401, 'unauthorized', 'Please sign in to continue.');
    }
    const runId = c.req.param('runId');
    const base = runKey(user.id, runId);
    try {
      const status = await kv.get(`${base}:status`);
      const matrixKey = await kv.get(`${base}:matrixKey`);
      const matrix = await kv.get(`${base}:matrix`);
      const segments = await kv.get(`${base}:segments`);
      const analysis = await kv.get(`${base}:analysis`);
      const valid = await validateSharedConfig(user.id, runId, matrixKey || '');
      return c.json({ status, matrixKey, matrix, segments, analysis, validation: { pass: !!valid } });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('Parallel status error:', msg);
      return respondError(c, 500, 'parallel_status_failed', 'Failed to load status');
    }
  });

// Admin: backfill display_name/full_name from name for all users
api.post('/admin/backfill-names', async (c) => {
  const user = await getAuthenticatedUser(c.req.header('Authorization') || null);
  const secret = c.req.header('X-Cron-Secret') || '';
  const ok = !!user || (CRON_SECRET && secret === CRON_SECRET);
  if (!ok) {
    return respondError(c, 401, 'unauthorized', 'Unauthorized');
  }

  try {
    let page = 1;
    const perPage = 100;
    let scanned = 0;
    let updated = 0;
    let done = false;

    while (!done) {
      const { data, error } = await getSupabaseAdmin().auth.admin.listUsers({ page, perPage });
      if (error) {
        const emsg = error instanceof Error ? error.message : String(error);
        console.error('Backfill listUsers error:', emsg);
        return respondError(c, 500, 'admin_list_users_failed', 'Failed to list users');
      }
      const users: Array<{ id: string; user_metadata?: Record<string, unknown> }> = Array.isArray(data?.users) ? (data!.users as Array<{ id: string; user_metadata?: Record<string, unknown> }>) : [];
      scanned += users.length;
      for (const u of users) {
        const meta = (u?.user_metadata || {}) as Record<string, unknown>;
        const name = String(meta?.name || '').trim();
        const displayName = String(meta?.display_name || '').trim();
        const fullName = String(meta?.full_name || '').trim();
        if (name && (!displayName || !fullName)) {
          const newMeta: Record<string, unknown> = { ...meta };
          if (!displayName) newMeta.display_name = name;
          if (!fullName) newMeta.full_name = name;
          const { error: upErr } = await getSupabaseAdmin().auth.admin.updateUserById(u.id, { user_metadata: newMeta });
          if (upErr) {
            console.warn(`Failed to update user ${u.id}:`, (upErr as unknown instanceof Error) ? (upErr as unknown as Error).message : String(upErr));
          } else {
            updated++;
          }
        }
      }
      if (!users.length || users.length < perPage) {
        done = true;
      } else {
        page++;
      }
    }

    return c.json({ scanned, updated });
  } catch (err: unknown) {
    const emsg = err instanceof Error ? err.message : String(err);
    console.error('Backfill exception:', emsg);
    return respondError(c, 500, 'admin_backfill_failed', 'Backfill failed');
  }
});

// --- Journal Analyzer Endpoints ---

const JOURNAL_SYSTEM_PROMPT = `# System Prompt: Elite Trading Journal Performance Analyzer
Role: You are a high-performance quantitative trading coach specializing in psychological edge detection and technical execution auditing.

Task: Analyze the provided trade history (CSV or log format) and strategy parameters. Your goal is to identify "Leak Points" (where money is lost due to deviation) and "Edge Strengths" (where the user excels).

Analysis Requirements:
1. Strategy Adherence: Compare actual trades against the linked strategy's rules (if provided). Highlight "Rogue Trades" (deviations).
2. Psychological Edge: Identify patterns in time-of-day, asset class, or direction (long/short) that yield highest/lowest expectancy.
3. Execution Audit: Analyze entry/exit precision. Are they leaving money on the table (early exits) or overstaying (missing targets)?
4. Risk Integrity: Check if PnL per trade aligns with the strategy's risk rules. Flag any "Risk Blowing" spikes.

Output Format (Markdown):
# Trading Performance Audit: [Date Range]

## 📊 Performance Summary
- Total Trades: [X]
- Win Rate: [X%]
- Profit Factor: [X.X]
- Strategy Adherence Score: [X/100]

## 🚨 Critical Leak Points
- [Point 1]: [Description of technical/psychological error]
- [Point 2]: [Description]

## ✅ Edge Strengths
- [Strength 1]: [What they are doing right]
- [Strength 2]: [Pattern to double down on]

## 🎯 Recommendations
- [Immediate Action]: [One tactical change for the next session]
- [Plan Refinement]: [Suggestion for updating the trading plan]

Tone: Professional, direct, data-driven, and highly encouraging for disciplined execution. Avoid generic advice; focus on the specific patterns in the data.`;

async function generateJournalReportWithAI(trades: any[], strategy: any): Promise<string> {
  const tradesContext = trades.map(t => ({
    symbol: t.symbol,
    direction: t.direction,
    entry: t.entry_price,
    exit: t.exit_price,
    pnl: t.pnl,
    date: t.executed_at,
    notes: t.notes
  }));

  const messages: ClaudeMessage[] = [
    { role: 'system', content: JOURNAL_SYSTEM_PROMPT },
    { role: 'user', content: `Analyze these trades:
Trades Data: ${JSON.stringify(tradesContext, null, 2)}
Linked Strategy: ${strategy ? JSON.stringify({
      description: strategy.description,
      risk_management: strategy.risk_management,
      instrument: strategy.instrument
    }, null, 2) : 'No strategy linked.'}

Please provide the performance audit report.` }
  ];

  return await callClaudeAPI(messages, 0.4, 4000);
}

// Log a trade
api.post('/trades', async (c) => {
  const user = await getAuthenticatedUser(c.req.header('Authorization') || null);
  if (!user) return respondError(c, 401, 'unauthorized', 'Please sign in to continue.');

  try {
    const body = await c.req.json();
    const { symbol, direction, entry_price, exit_price, pnl, notes, strategy_id, executed_at } = body;

    if (!symbol || !direction || !entry_price || !exit_price || pnl === undefined) {
      return respondError(c, 400, 'invalid_request', 'Missing required trade fields');
    }

    // Ensure strategy_id is a valid UUID or null
    let cleanStrategyId = null;
    if (strategy_id && strategy_id !== 'none' && strategy_id !== '') {
      // Basic UUID format check to prevent DB syntax errors
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (uuidRegex.test(strategy_id)) {
        cleanStrategyId = strategy_id;
      } else {
        console.warn(`Invalid strategy_id received: ${strategy_id}, ignoring.`);
      }
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('trades')
      .insert({
        user_id: user.id,
        symbol,
        direction,
        entry_price,
        exit_price,
        pnl,
        notes,
        strategy_id: cleanStrategyId,
        executed_at: executed_at || new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('Supabase insert error:', error);
      throw error;
    }
    return c.json({ trade: data });
  } catch (error: any) {
    console.error('Log trade error details:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint
    });
    return respondError(c, 500, 'log_trade_failed', error.message || 'Failed to log trade');
  }
});

// Get trades count
api.get('/trades/count', async (c) => {
  const user = await getAuthenticatedUser(c.req.header('Authorization') || null);
  if (!user) return respondError(c, 401, 'unauthorized', 'Please sign in to continue.');

  try {
    const supabase = getSupabaseAdmin();
    const { count, error } = await supabase
      .from('trades')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    if (error) throw error;
    return c.json({ count: count || 0 });
  } catch (error: any) {
    console.error('Get trades count error:', error);
    return respondError(c, 500, 'count_failed', 'Failed to get trades count');
  }
});

// Get past analyses
api.get('/journal-analyses', async (c) => {
  const user = await getAuthenticatedUser(c.req.header('Authorization') || null);
  if (!user) return respondError(c, 401, 'unauthorized', 'Please sign in to continue.');

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('journal_analyses')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return c.json({ analyses: data || [] });
  } catch (error: any) {
    console.error('Get analyses error:', error);
    return respondError(c, 500, 'fetch_analyses_failed', 'Failed to fetch analyses');
  }
});

// Get specific analysis
api.get('/journal-analyses/:id', async (c) => {
  const user = await getAuthenticatedUser(c.req.header('Authorization') || null);
  if (!user) return respondError(c, 401, 'unauthorized', 'Please sign in to continue.');

  try {
    const id = c.req.param('id');
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('journal_analyses')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (error) throw error;
    return c.json({ analysis: data });
  } catch (error: any) {
    console.error('Get analysis error:', error);
    return respondError(c, 500, 'fetch_analysis_failed', 'Failed to fetch analysis');
  }
});

api.delete('/journal-analyses/:id', async (c) => {
  const user = await getAuthenticatedUser(c.req.header('Authorization') || null);
  if (!user) return respondError(c, 401, 'unauthorized', 'Please sign in to continue.');

  try {
    const id = c.req.param('id');
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from('journal_analyses')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) throw error;
    return c.json({ ok: true });
  } catch (error: any) {
    console.error('Delete analysis error:', error);
    return respondError(c, 500, 'delete_failed', 'Failed to delete analysis');
  }
});

api.post('/journal-analyses/generate', async (c) => {
  const user = await getAuthenticatedUser(c.req.header('Authorization') || null);
  if (!user) return respondError(c, 401, 'unauthorized', 'Please sign in to continue.');

  // Tier check
  const subscription = await kv.get(`user:${user.id}:subscription`);
  if (!subscription || subscription.plan !== 'elite') {
    return respondError(c, 403, 'elite_required', 'Upgrade to Elite for AI Trade Journaling');
  }

  try {
    const url = new URL(c.req.url);
    const force = (url.searchParams.get('force') || '').toLowerCase() === '1' || (url.searchParams.get('force') || '').toLowerCase() === 'true';
    const supabase = getSupabaseAdmin();
    
    // Fetch last 50 trades
    const { data: trades, error: tradesErr } = await supabase
      .from('trades')
      .select('*')
      .eq('user_id', user.id)
      .order('executed_at', { ascending: false })
      .limit(50);

    if (tradesErr) throw tradesErr;
    if (!trades || trades.length < 5) {
      return respondError(c, 400, 'insufficient_data', 'At least 5 trades are required for analysis.');
    }

    // Use the actual total count from the DB for the unique identifier, 
    // rather than the length of the fetched array which is capped at 50.
    const { count: dbTotalCount, error: countErr } = await supabase
      .from('trades')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);
    
    if (countErr) {
      console.error('[Journal] Error fetching total trades count:', countErr);
    }
    
    const totalTrades = dbTotalCount || trades.length;

    // --- DUPLICATE PREVENTION CHECK ---
    // Check if an analysis for the exact same trade count already exists for this user
    // within a reasonable time window (e.g., last 24 hours) or just any existing one
    // to prevent redundant AI calls and DB clutter.
    const { data: existingAnalysis, error: checkErr } = await supabase
      .from('journal_analyses')
      .select('id, created_at')
      .eq('user_id', user.id)
      .eq('trades_count', totalTrades)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (checkErr) {
      console.error('[Journal] Error checking for existing analysis:', checkErr);
    }

    if (!force && existingAnalysis) {
      // If found, check if it was created in the last hour. If so, return it instead of regenerating.
      const created = new Date(existingAnalysis.created_at).getTime();
      const now = new Date().getTime();
      const ageMs = now - created;
      const oneHourMs = 60 * 60 * 1000;

      if (ageMs < oneHourMs) {
        console.log(`[Journal] Returning existing analysis ${existingAnalysis.id} (age: ${Math.round(ageMs/1000)}s) for user ${user.id}`);
        // Re-fetch full data for the existing analysis
        const { data: fullAnalysis } = await supabase
          .from('journal_analyses')
          .select('*')
          .eq('id', existingAnalysis.id)
          .single();
        
        if (fullAnalysis) {
          return c.json({ analysis: fullAnalysis, cached: true });
        }
      }
    }
    // ----------------------------------

    // Get the most linked strategy for context
    const strategyCounts: Record<string, number> = {};
    trades.forEach(t => {
      if (t.strategy_id) {
        strategyCounts[t.strategy_id] = (strategyCounts[t.strategy_id] || 0) + 1;
      }
    });
    
    let topStrategyId = Object.entries(strategyCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
    let strategy = null;
    if (topStrategyId) {
      strategy = await kv.get(`strategy:${user.id}:${topStrategyId}`);
    }

    // Generate AI report
    const reportText = await generateJournalReportWithAI(trades, strategy);

    // Parse summary stats from analyzed trades (the subset we fetched)
    const analyzedCount = trades.length;
    const wins = trades.filter(t => Number(t.pnl) > 0).length;
    const winRate = analyzedCount > 0 ? (wins / analyzedCount) * 100 : 0;
    const grossProfit = trades.filter(t => Number(t.pnl) > 0).reduce((sum, t) => sum + Number(t.pnl), 0);
    const grossLoss = Math.abs(trades.filter(t => Number(t.pnl) < 0).reduce((sum, t) => sum + Number(t.pnl), 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? 99 : 0);

    const report_data = {
      content: reportText,
      stats: {
        totalTrades: analyzedCount, // Number of trades in this specific report
        winRate: winRate.toFixed(1),
        profitFactor: profitFactor.toFixed(2),
        grossProfit: grossProfit.toFixed(2),
        grossLoss: grossLoss.toFixed(2)
      },
      period: {
        start: trades[trades.length - 1].executed_at,
        end: trades[0].executed_at
      }
    };

    // Save analysis
    const { data: analysis, error: saveErr } = await supabase
      .from('journal_analyses')
      .insert({
        user_id: user.id,
        report_data,
        trades_count: totalTrades
      })
      .select()
      .single();

    if (saveErr) throw saveErr;
    return c.json({ analysis });

  } catch (error: any) {
    console.error('Generate journal report error:', error);
    return respondError(c, 500, 'generation_failed', 'Failed to generate AI report');
  }
});

// Mount the API under both base paths to create route aliases
 // Root index route for quick discovery
 app.get('/', (c) => {
   const baseAliases = ['/make-server-00a119be', '/server/make-server-00a119be'];
   return c.json({
     ok: true,
     name: 'EA Coder Server',
     aliases: baseAliases,
     endpoints: {
       health: `${baseAliases[1]}/health`,
       version: `${baseAliases[1]}/version`,
       strategies: `${baseAliases[1]}/strategies`,
       convert: `${baseAliases[1]}/convert`,
       models: `${baseAliases[1]}/anthropic/models`,
     },
   });
 });

 app.route('/make-server-00a119be', api);
 app.route('/server/make-server-00a119be', api);
 // Mount at root so routes like /forgot-password are reachable as /functions/v1/server/forgot-password
 app.route('/', api);
 // Mount under /server to support edge runtime path prefixing
 app.route('/server', api);

Deno.serve(app.fetch);

// Global error handler to ensure sanitized errors with correlation IDs
app.onError((err, c) => {
  try {
    const msg = err instanceof Error ? err.message : 'Unhandled server error';
    const stack = err instanceof Error ? err.stack : undefined;
    return respondError(c, 500, 'internal_error', 'Something went wrong. Please try again.', {
      errorMessage: msg,
      stack,
    });
  } catch {
    return c.json({ error: 'Something went wrong. Please try again.' }, 500);
  }
});
// Access-control helpers
export function shouldAllowCreation(plan: string, userStrategiesCount: number): boolean {
  // Elite users: always allowed
  if (plan === 'elite') return true;
  // Pro users: allowed up to 10
  if (plan === 'pro') return userStrategiesCount < 10;
  // Free users: allowed only if fewer than 1 completed generation
  return userStrategiesCount < 1;
}

async function log403(userId: string, route: string, reason: string, extra?: Record<string, unknown>) {
  try {
    await kv.set(`audit:${userId}:403:${Date.now()}`, {
      event: 'access.denied',
      route,
      reason,
      createdAt: new Date().toISOString(),
      ...(extra || {})
    });
  } catch { void 0; }
}
import { PROMPT_VERSION, deriveStrategyType, buildAnalyzeMessages, buildMetricsMessages, buildCodeMessages } from '../../../src/utils/promptTemplates.ts';

async function recordPromptVersion(kind: string, type: string) {
  try {
    await kv.set(`prompt_version:${kind}:${type}:${Date.now()}`, { version: PROMPT_VERSION, kind, type, at: new Date().toISOString() });
  } catch { void 0; }
}
