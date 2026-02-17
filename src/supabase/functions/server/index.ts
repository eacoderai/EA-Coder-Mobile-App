import { Hono } from 'npm:hono';
import { cors } from 'npm:hono/cors';
import { logger } from 'npm:hono/logger';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import * as kv from './kv_store.ts';
import Stripe from 'npm:stripe';

// Add Deno types for TypeScript
declare global {
  interface Window {
    Deno: {
      env: {
        get(key: string): string | undefined;
      };
      serve: any;
    };
  }
}

// Use global Deno or window.Deno depending on environment
const deno = typeof Deno !== 'undefined' ? Deno : (window as any).Deno;

const app = new Hono();

app.use('*', cors());
app.use('*', logger(console.log));

const supabase = createClient(
  deno.env.get('SUPABASE_URL') || '',
  deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
);

const STRIPE_SECRET = deno.env.get('STRIPE_SECRET') || '';
const STRIPE_WEBHOOK_SECRET = deno.env.get('STRIPE_WEBHOOK_SECRET') || '';
const STRIPE_WEBHOOK_SECRET_SUBSCRIPTION = deno.env.get('STRIPE_WEBHOOK_SECRET_SUBSCRIPTION') || '';
const stripe = STRIPE_SECRET ? new Stripe(STRIPE_SECRET, { apiVersion: '2022-11-15' }) : null;
const STRIPE_PRODUCT_FREE = 'free_tier';
const STRIPE_PRODUCT_PRO = deno.env.get('STRIPE_PRODUCT_PRO') || 'prod_TVwRNndzjnsRhB';
const STRIPE_PRODUCT_ELITE = deno.env.get('STRIPE_PRODUCT_ELITE') || '';
const STRIPE_PRODUCT_ELITE_MONTHLY = deno.env.get('STRIPE_PRODUCT_ELITE_MONTHLY') || '';
const STRIPE_PRODUCT_ELITE_YEARLY = deno.env.get('STRIPE_PRODUCT_ELITE_YEARLY') || '';
const STRIPE_PRODUCT_COINS = deno.env.get('STRIPE_PRODUCT_COINS') || 'prod_TVvcAdglsrNCH0';
const COINS_PAYMENT_LINK_ID = deno.env.get('COINS_PAYMENT_LINK_ID') || 'plink_1SYtnwE6fzafBWqMKL68bFqs';
const PRODUCT_INFO_SECRET = deno.env.get('PRODUCT_INFO_SECRET') || '';

// Claude/Anthropic API configuration (prefer ANTHROPIC_API_KEY with CLAUDE_API_KEY fallback)
const CLAUDE_API_KEY = deno.env.get('ANTHROPIC_API_KEY') || deno.env.get('CLAUDE_API_KEY') || (typeof Deno !== 'undefined' ? Deno.env.get('ANTHROPIC_API_KEY') || Deno.env.get('CLAUDE_API_KEY') : '') || '';
const CLAUDE_API_BASE = deno.env.get('CLAUDE_API_BASE') || (typeof Deno !== 'undefined' ? Deno.env.get('CLAUDE_API_BASE') : '') || 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = deno.env.get('CLAUDE_MODEL') || (typeof Deno !== 'undefined' ? Deno.env.get('CLAUDE_MODEL') : '') || 'claude-3-5-sonnet-20241022';

// Helper to verify user authentication
async function getAuthenticatedUser(authHeader: string | null) {
  if (!authHeader) {
    return null;
  }
  
  const token = authHeader.split(' ')[1];
  const { data: { user }, error } = await supabase.auth.getUser(token);
  
  if (error || !user) {
    return null;
  }
  
  return user;
}

async function encryptProductInfo(obj: any) {
  try {
    if (!PRODUCT_INFO_SECRET) return null;
    const enc = new TextEncoder();
    const secret = enc.encode(PRODUCT_INFO_SECRET);
    const keyData = await crypto.subtle.digest('SHA-256', secret);
    const key = await crypto.subtle.importKey('raw', keyData, 'AES-GCM', false, ['encrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = enc.encode(JSON.stringify(obj));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
    const b64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...Array.from(new Uint8Array(buf))));
    return { iv: b64(iv), data: b64(ct) };
  } catch (err) {
    console.error('[Encrypt] Error:', err);
    return null;
  }
}

async function setUserProductInfo(userId: string, prodId: string, planName: string) {
  try {
    const info = { prod_id: prodId, plan_name: planName };
    const enc = await encryptProductInfo(info);
    const update: any = { user_metadata: { product_info: info } };
    if (enc) update.user_metadata.product_info_enc = enc;
    await supabase.auth.admin.updateUserById(userId, update);
  } catch (err) {
    console.error('[UserUpdate] Error updating user metadata:', err);
  }
}

function clampCoinsAmountUsd(amountUsd: number): number {
  const n = Math.floor(Number(amountUsd));
  if (!isFinite(n)) return 0;
  return Math.max(1, Math.min(5, n));
}

function coinsFromUsd(amountUsd: number): number {
  const clamped = clampCoinsAmountUsd(amountUsd);
  return Math.floor(clamped * 10);
}

// Helper to call Claude API
async function callClaudeAPI(messages: any[], temperature = 0.7, maxTokens = 4000) {
  try {
    console.log('=== Claude API Call Starting ===');
    console.log('API Key present:', !!CLAUDE_API_KEY);
    console.log('API Key length:', CLAUDE_API_KEY?.length || 0);
    console.log('Model:', CLAUDE_MODEL);
    console.log('Messages count:', messages.length);
    console.log('Temperature:', temperature);
    console.log('Max tokens:', maxTokens);

    if (!CLAUDE_API_KEY) {
      console.error('ERROR: Claude API key is not set');
      throw new Error('Claude API key is not configured. Please set CLAUDE_API_KEY in your environment variables.');
    }

    // Extract system message if present
    const systemMessages = messages.filter(msg => msg.role === 'system');
    const userMessages = messages.filter(msg => msg.role !== 'system');
    
    // Format messages for Claude API - ensure proper content structure
    const formattedMessages = userMessages.map(msg => ({
      role: msg.role,
      content: [{ type: 'text', text: msg.content }]
    }));

    const resolvedModel = (() => {
      let m = CLAUDE_MODEL || '';
      if (m.startsWith('anthropic/')) m = m.replace(/^anthropic\//, '');
      return m;
    })();
    const requestBody = {
      model: resolvedModel,
      messages: formattedMessages,
      system: systemMessages.length > 0 ? systemMessages[0].content : undefined,
      temperature,
      max_tokens: maxTokens,
    };

    console.log('Request body:', JSON.stringify(requestBody, null, 2));
    console.log(`Using Claude model: ${resolvedModel}`);
    console.log(`API endpoint: ${CLAUDE_API_BASE}`);

    const response = await fetch(CLAUDE_API_BASE, {
      method: 'POST',
      headers: {
        'anthropic-version': '2023-06-01',
        'x-api-key': CLAUDE_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    console.log('Response status:', response.status);
    console.log('Response ok:', response.ok);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Claude API error: ${response.status} - ${errorText}`);
      
      // Provide more helpful error messages based on status code
      if (response.status === 401) {
        throw new Error('Authentication failed: Invalid API key. Please check your CLAUDE_API_KEY.');
      } else if (response.status === 400) {
        throw new Error(`Bad request: ${errorText}`);
      } else if (response.status === 404) {
        throw new Error(`Model not found: ${resolvedModel}. Verify model availability and correct ID format (e.g., claude-3-5-sonnet-20241022).`);
      } else if (response.status === 429) {
        throw new Error('Rate limit exceeded. Please try again later.');
      } else {
        throw new Error(`Claude API error: ${response.status} - ${errorText}`);
      }
    }

    const data = await response.json();
    console.log('Response data structure:', Object.keys(data));
    
    if (!data.content || !data.content[0] || !data.content[0].text) {
      console.error('Unexpected API response structure:', JSON.stringify(data, null, 2));
      throw new Error('Unexpected API response structure. Please check the Claude API documentation for any changes.');
    }

    const content = data.content[0].text;
    console.log('Generated content length:', content?.length || 0);
    console.log('=== Claude API Call Success ===');
    
    return content;
  } catch (error: any) {
    console.log('=== Claude API Call Failed ===');
    console.log('Error type:', error.constructor.name);
    console.log('Error message:', error.message);
    console.log('Error stack:', error.stack);
    throw error;
  }
}

import { safeRedirectUrl, sendEmailResend, hashIdentity, consumeMagicToken } from './auth_utils.ts';

// Sign up endpoint
app.post('/make-server-00a119be/signup', async (c) => {
  try {
    const { email, password, name } = await c.req.json();
    
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: { name },
      email_confirm: true
    });
    
    if (error) {
      console.log('Signup error:', error);
      return c.json({ error: error.message }, 400);
    }
    
    try {
      const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({ type: 'magiclink', email });
      if (!linkErr && linkData) {
        const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><h1>Confirm your signup</h1><p>Hello ${name},</p><p>Click the button below to confirm and sign in:</p><a href="${linkData.action_link}" style="background:#1f2937;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Confirm and Sign In</a><p>This link expires in 24 hours.</p><p>EACoder AI</p></div>`;
        const ok = await sendEmailResend(email, 'Confirm your EACoder AI account', html);
        const emailHash = await hashIdentity(email);
        await kv.set(`audit:email:${Date.now()}:${emailHash}`, { event: ok ? 'magiclink_sent' : 'magiclink_send_failed', email_hash: emailHash, kind: 'signup' });
        if (!ok) {
          try {
            const { error: otpErr } = await (supabase as any).auth.signInWithOtp({ email });
            if (otpErr) {
              await kv.set(`audit:email:${Date.now()}:${emailHash}`, { event: 'otp_fallback_failed', email_hash: emailHash, message: String(otpErr?.message || otpErr) });
            }
          } catch (e: any) {
            await kv.set(`audit:email:${Date.now()}:${emailHash}`, { event: 'otp_fallback_exception', email_hash: emailHash, message: String(e?.message || e) });
          }
        }
      }
    } catch {}
    return c.json({ user: data.user });
  } catch (error: any) {
    console.log('Signup exception:', error);
    return c.json({ error: error.message || 'Signup failed' }, 500);
  }
});

app.post('/make-server-00a119be/forgot-password', async (c) => {
  try {
    const { email } = await c.req.json();
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!re.test(String(email || ''))) return c.json({ message: 'Invalid email' }, 400);
    const key = `rate:forgot:${await hashIdentity(email)}`;
    const rate = (await kv.get(key)) || { count: 0, timestamp: Date.now() };
    const now = Date.now();
    if (now - rate.timestamp < 3600000) {
      if (rate.count >= 3) return c.json({ message: 'Too many requests' }, 429);
      rate.count++;
    } else {
      rate.count = 1;
      rate.timestamp = now;
    }
    await kv.set(key, rate);
    const { data, error } = await supabase.auth.admin.generateLink({ type: 'recovery', email });
    if (!error && data) {
      const name = data.user.user_metadata?.name || 'User';
      const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><h1>Password Reset</h1><p>Hello ${name},</p><p>Click the button below to reset your password:</p><a href="${data.action_link}" style="background:#2563eb;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Reset Password</a><p>This link expires in 1 hour.</p><p>EACoder AI</p></div>`;
      const ok = await sendEmailResend(email, 'Password Reset', html);
      if (ok) return c.json({ message: 'Password reset email sent successfully.' });
    }
    const redirect = safeRedirectUrl('/');
    const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email, redirect ? { redirectTo: redirect } as any : undefined as any);
    if (resetErr) return c.json({ message: 'Failed to initiate password reset' }, 500);
    return c.json({ message: 'If the email exists, a reset message was sent.' });
  } catch (e: any) {
    return c.json({ message: e?.message || 'Failed' }, 500);
  }
});

app.post('/make-server-00a119be/magic/request', async (c) => {
  try {
    const { email } = await c.req.json();
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!re.test(String(email || ''))) return c.json({ message: 'Invalid email' }, 400);
    const rateKey = `rate:magic:${await hashIdentity(email)}`;
    const rate = (await kv.get(rateKey)) || { count: 0, timestamp: Date.now() };
    const now = Date.now();
    if (now - rate.timestamp < 3600000) {
      if (rate.count >= 3) return c.json({ message: 'Too many requests' }, 429);
      rate.count++;
    } else {
      rate.count = 1;
      rate.timestamp = now;
    }
    await kv.set(rateKey, rate);
    const { data, error } = await supabase.auth.admin.generateLink({ type: 'magiclink', email });
    if (error || !data) return c.json({ message: 'Failed to issue magic link' }, 500);
    const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><h1>Your Magic Link</h1><p>Hello,</p><p>Click to sign in:</p><a href="${data.action_link}" style="background:#111827;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Sign In</a><p>This link expires in 24 hours.</p><p>EACoder AI</p></div>`;
    const ok = await sendEmailResend(email, 'Your EACoder AI Magic Link', html);
    const emailHash2 = await hashIdentity(email);
    await kv.set(`audit:email:${Date.now()}:${emailHash2}`, { event: ok ? 'magiclink_sent' : 'magiclink_send_failed', email_hash: emailHash2, kind: 'request' });
    if (!ok) {
      try {
        const { error: otpErr } = await (supabase as any).auth.signInWithOtp({ email });
        if (otpErr) {
          await kv.set(`audit:email:${Date.now()}:${emailHash2}`, { event: 'otp_fallback_failed', email_hash: emailHash2, message: String(otpErr?.message || otpErr) });
        }
      } catch (e: any) {
        await kv.set(`audit:email:${Date.now()}:${emailHash2}`, { event: 'otp_fallback_exception', email_hash: emailHash2, message: String(e?.message || e) });
      }
    }
    return c.json({ message: ok ? 'Magic link sent.' : 'Magic link initiated via fallback.' });
  } catch (e: any) {
    return c.json({ message: e?.message || 'Failed' }, 500);
  }
});

app.get('/make-server-00a119be/magic/confirm', async (c) => {
  try {
    const url = new URL(c.req.url);
    const token = url.searchParams.get('token') || '';
    const action = await consumeMagicToken(token);
    return c.redirect(action);
  } catch (e: any) {
    return c.json({ message: e?.message || 'Failed' }, 500);
  }
});

app.get('/make-server-00a119be/auth/reset-callback', async (c) => {
  try {
    const url = new URL(c.req.url);
    const tokenHash = url.searchParams.get('token_hash') || '';
    const type = url.searchParams.get('type') || '';
    if (!tokenHash || !type) return c.redirect(safeRedirectUrl('/reset-password?status=error') || '/');
    const anon = createClient(deno.env.get('SUPABASE_URL') || '', deno.env.get('SUPABASE_ANON_KEY') || '');
    try {
      const { data, error } = await (anon as any).auth.verifyOtp({ type, token_hash: tokenHash });
      if (error) return c.redirect(safeRedirectUrl('/reset-password?status=expired') || '/');
      return c.redirect(safeRedirectUrl('/reset-password?status=success') || '/');
    } catch {
      return c.redirect(safeRedirectUrl('/reset-password?status=error') || '/');
    }
  } catch {
    return c.redirect(safeRedirectUrl('/reset-password?status=error') || '/');
  }
});

// Get all strategies for authenticated user
app.get('/make-server-00a119be/strategies', async (c) => {
  const user = await getAuthenticatedUser(c.req.header('Authorization'));
  
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  
  try {
    const strategies = await kv.getByPrefix(`strategy:${user.id}:`);
    
    // Sort by created_at descending
    const sorted = strategies.sort((a: any, b: any) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    
    return c.json({ strategies: sorted });
  } catch (error: any) {
    console.log('Get strategies error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Create new strategy
app.post('/make-server-00a119be/strategies', async (c) => {
  const user = await getAuthenticatedUser(c.req.header('Authorization'));
  
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  
  try {
    const { strategy_name, description, risk_management, instrument, platform, indicators, indicator_mode } = await c.req.json();
    
    const strategyId = crypto.randomUUID();
    
    const strategy = {
      id: strategyId,
      user_id: user.id,
      strategy_name: strategy_name || 'Untitled Strategy',
      description,
      risk_management: risk_management || '',
      instrument: instrument || '',
      platform,
      indicators: Array.isArray(indicators) ? indicators.filter(Boolean) : [],
      indicator_mode: (indicator_mode === 'single' || indicator_mode === 'multiple') ? indicator_mode : 'multiple',
      status: 'pending',
      generated_code: '',
      created_at: new Date().toISOString()
    };
    
    await kv.set(`strategy:${user.id}:${strategyId}`, strategy);
    
    // Generate code using Claude AI in background
    (async () => {
      try {
        const generatedCode = await generateCodeWithAI(platform, description, risk_management, instrument, { indicators: Array.isArray(indicators) ? indicators.filter(Boolean) : [], indicator_mode: (indicator_mode === 'single' || indicator_mode === 'multiple') ? indicator_mode : 'multiple' });
        strategy.status = 'generated';
        strategy.generated_code = generatedCode;
        await kv.set(`strategy:${user.id}:${strategyId}`, strategy);
      } catch (error: any) {
        console.log('AI code generation error for strategy', strategyId, ':', error);
        strategy.status = 'error';
        strategy.generated_code = `// ❌ Error generating code: ${error.message}
// 
// Debug Information:
// - API Key Status: ${CLAUDE_API_KEY ? 'Configured' : 'MISSING - Please set Claude API key'}
// - Platform: ${platform}
// - Timestamp: ${new Date().toISOString()}
// 
// Please check the server logs for more details and try again.
// If the problem persists, contact support.`;
        await kv.set(`strategy:${user.id}:${strategyId}`, strategy);
      }
    })();
    
    return c.json({ strategyId, message: 'Strategy submitted for AI code generation' });
  } catch (error: any) {
    console.log('Create strategy error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Get single strategy
app.get('/make-server-00a119be/strategies/:id', async (c) => {
  const user = await getAuthenticatedUser(c.req.header('Authorization'));
  
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  
  try {
    const strategyId = c.req.param('id');
    const strategy = await kv.get(`strategy:${user.id}:${strategyId}`);
    
    if (!strategy) {
      return c.json({ error: 'Strategy not found' }, 404);
    }
    
    return c.json(strategy);
  } catch (error: any) {
    console.log('Get strategy error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Get chat messages for strategy
app.get('/make-server-00a119be/strategies/:id/chat', async (c) => {
  const user = await getAuthenticatedUser(c.req.header('Authorization'));
  
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  
  try {
    const strategyId = c.req.param('id');
    const messages = await kv.getByPrefix(`chat:${user.id}:${strategyId}:`);
    
    // Sort by timestamp
    const sorted = messages.sort((a: any, b: any) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    
    return c.json({ messages: sorted });
  } catch (error: any) {
    console.log('Get chat messages error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Send chat message
app.post('/make-server-00a119be/strategies/:id/chat', async (c) => {
  const user = await getAuthenticatedUser(c.req.header('Authorization'));
  
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  
  try {
    const strategyId = c.req.param('id');
    const { message } = await c.req.json();
    
    // Save user message
    const userMsgId = crypto.randomUUID();
    const userMessage = {
      id: userMsgId,
      role: 'user',
      content: message,
      timestamp: new Date().toISOString()
    };
    await kv.set(`chat:${user.id}:${strategyId}:${userMsgId}`, userMessage);
    
    // Get strategy to access current code
    const strategy = await kv.get(`strategy:${user.id}:${strategyId}`);
    
    // Get chat history for context
    const chatHistory = await kv.getByPrefix(`chat:${user.id}:${strategyId}:`);
    const sortedHistory = chatHistory.sort((a: any, b: any) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    
    // Generate AI response using Claude
    let aiResponse: string;
    try {
      aiResponse = await generateChatResponse(message, strategy?.generated_code || '', strategy, sortedHistory);
    } catch (error: any) {
      console.log('AI chat response error:', error);
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
  } catch (error: any) {
    console.log('Send chat message error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Convert code
app.post('/make-server-00a119be/convert', async (c) => {
  const user = await getAuthenticatedUser(c.req.header('Authorization'));
  
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  
  try {
    const { code, from_lang, to_lang } = await c.req.json();
    
    // Convert code using Claude AI
    let convertedCode: string;
    try {
      convertedCode = await convertCodeWithAI(code, from_lang, to_lang);
    } catch (error: any) {
      console.log('AI code conversion error:', error);
      return c.json({ error: `Code conversion failed: ${error.message}` }, 500);
    }
    
    return c.json({ converted_code: convertedCode });
  } catch (error: any) {
    console.log('Convert code error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// AI-powered code generation function
async function generateCodeWithAI(platform: string, description: string, riskManagement: string, instrument: string, extras?: { indicators?: string[]; indicator_mode?: 'single' | 'multiple' }): Promise<string> {
  console.log('=== generateCodeWithAI Called ===');
  console.log('Platform:', platform);
  console.log('Description:', description);
  console.log('Risk Management:', riskManagement);
  console.log('Instrument:', instrument);

  const platformDetails = {
    mql5: {
      name: 'MetaTrader 5 (MQL5)',
      syntax: 'MQL5',
      template: '//+------------------------------------------------------------------+\n//|                                              AI Generated EA      |\n//+------------------------------------------------------------------+'
    },
    mql4: {
      name: 'MetaTrader 4 (MQL4)',
      syntax: 'MQL4',
      template: '// MQL4 EA - Generated by EA Coder'
    },
    pinescript: {
      name: 'TradingView (Pine Script)',
      syntax: 'Pine Script',
      template: '//@version=5\nstrategy("AI Generated Strategy", overlay=true)'
    }
  };

  const platformInfo = platformDetails[platform as keyof typeof platformDetails] || platformDetails.mql5;

  const systemPrompt = `You are an expert algorithmic trading developer specializing in ${platformInfo.name}. Generate production-ready, well-structured trading code that follows best practices. Include proper error handling, risk management, and clear comments.`;

  const userPrompt = `Generate a complete ${platformInfo.syntax} trading algorithm with the following specifications:

STRATEGY DESCRIPTION:
${description}

${riskManagement ? `RISK MANAGEMENT:
${riskManagement}` : ''}

${instrument ? `INSTRUMENT: ${instrument}` : ''}

REQUIREMENTS:
- Generate complete, production-ready code
- Include proper input parameters for customization
- Implement robust risk management
- Add clear comments explaining the logic
- Follow ${platformInfo.syntax} best practices
- Include error handling where appropriate
- Make the code modular and maintainable

Return ONLY the code, no explanations before or after.`;

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ];

  try {
    const strategy = { description, risk_management: riskManagement, instrument, platform, timeframe: platform === 'pinescript' ? '60' : 'H1', indicators: Array.isArray(extras?.indicators) ? extras!.indicators!.filter(Boolean) : [], indicator_mode: (extras?.indicator_mode === 'single' || extras?.indicator_mode === 'multiple') ? extras!.indicator_mode! : 'multiple' };
    const type = deriveStrategyType(strategy);
    const msgs = buildCodeMessages(platform, strategy);
    await recordPromptVersion('codegen', type);
    const raw = await callClaudeAPI(msgs, 0.25, 5000);
    return applyAttributionToCode(raw || '', platform).trim();
  } catch (error: any) {
    throw new Error(`Failed to generate code: ${error.message}`);
  }
}

function applyAttributionToCode(code: string, platform: string): string {
  const hasHeader = /EA Coder AI\s*-\s*All Rights Reserved/i.test(code);
  const hasCopyrightProp = /copyright\s*[:=]\s*"EA Coder AI"/i.test(code);
  const hasLinkProp = /link\s*[:=]\s*"eacoderai\.com"/i.test(code);
  const commentPrefix = (platform === 'pinescript' || platform === 'mql4' || platform === 'mql5' || platform === 'javascript' || platform === 'typescript' || platform === 'java' || platform === 'csharp') ? '// ' : '# ';
  const header = `${commentPrefix}Copyright © EA Coder AI - All Rights Reserved`;
  let props = '';
  switch (platform) {
    case 'mql4':
    case 'mql5':
      props = `string copyright = "EA Coder AI";\nstring link = "eacoderai.com";`;
      break;
    case 'pinescript':
      props = `var copyright = "EA Coder AI"\nvar link = "eacoderai.com"`;
      break;
    case 'python':
      props = `copyright = "EA Coder AI"\nlink = "eacoderai.com"`;
      break;
    case 'java':
      {
        const m = code.match(/class\s+\w+\s*\{/);
        if (m) {
          const idx = code.indexOf(m[0]) + m[0].length;
          const injected = `\n    public static final String COPYRIGHT = "EA Coder AI";\n    public static final String LINK = "eacoderai.com";\n`;
          code = code.slice(0, idx) + injected + code.slice(idx);
          props = '';
        } else {
          props = `public class Attribution { public static final String COPYRIGHT = "EA Coder AI"; public static final String LINK = "eacoderai.com"; }`;
        }
      }
      break;
    default:
      props = `export const copyright = "EA Coder AI";\nexport const link = "eacoderai.com";`;
  }
  const headerBlock = hasHeader ? '' : `${header}\n`;
  const propsBlock = (hasCopyrightProp && hasLinkProp) ? '' : `${props}\n`;
  return `${headerBlock}${propsBlock}${code}`;
}

// AI-powered chat response function
async function generateChatResponse(userMessage: string, currentCode: string, strategy: any, chatHistory: any[]): Promise<string> {
  const type = deriveStrategyType(strategy || {});
  const instrument = (strategy?.analysis_instrument || strategy?.instrument || 'Not specified');
  const timeframe = (strategy?.timeframe || 'H1');
  const platform = (strategy?.platform || 'mql4');
  const typeFocus: Record<string, string> = {
    trend_following: 'Regime detection, HTF confirmation, momentum-based edits',
    mean_reversion: 'Volatility bands, threshold tuning, session filters',
    breakout: 'Consolidation detection, breakout rules, volatility expansion',
    scalping: 'Spread/slippage caps, fast execution, ATR-based risk',
    grid_martingale: 'Strict caps, equity guards, lot ceilings',
    news_event: 'Embargo windows, calendars, gap/volatility handling',
    other: 'Tailor to instrument/timeframe specifics'
  };
  const systemPrompt = `You are Crizzy, EA Coder's Code Assistant. Always identify yourself as "Crizzy, EA Coder's Code Assistant" if asked about your name or identity. Do not claim to be Claude or Anthropic; avoid vendor branding in first-person statements.

You are an expert ${platform} assistant. Instrument: ${instrument}. Timeframe: ${timeframe}. Focus: ${typeFocus[type] || typeFocus.other}. Provide concise, implementable code edits and explanations.`;

  const messages: any[] = [{ role: 'system', content: systemPrompt }];

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
      messages.push({ role: msg.role, content: msg.content });
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
  const langMap: any = {
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

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ];

  const convertedCode = await callClaudeAPI(messages, 0.2, 4000);
  return applyAttributionToCode(convertedCode.trim(), toLang);
}

// AI-powered strategy analysis function
async function analyzeStrategyWithAI(strategy: any): Promise<string[]> {
  const type = deriveStrategyType(strategy);
  const messages = buildAnalyzeMessages(strategy);
  await recordPromptVersion('analyze', type);
  const response = await callClaudeAPI(messages, 0.7, 1000);
  
  try {
    // Try to parse as JSON array
    const improvements = JSON.parse(response.trim());
    if (Array.isArray(improvements)) {
      return improvements;
    }
  } catch {
    // If JSON parsing fails, try to extract suggestions from text
    const lines = response.split('\n').filter(line => line.trim().length > 0);
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

// AI-powered metrics generation function
async function generateAnalysisMetricsWithAI(strategy: any): Promise<Record<string, any>> {
  const type = deriveStrategyType(strategy);
  const messages = buildMetricsMessages(strategy);
  await recordPromptVersion('metrics', type);
  try {
    const response = await callClaudeAPI(messages, 0.5, 1200);
    const parsed = JSON.parse(response.trim());
    if (parsed && typeof parsed === 'object') return parsed;
  } catch (err) {
    // fall through to synthetic defaults
  }

  // Synthetic conservative defaults if AI parsing fails
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
app.get('/make-server-00a119be/subscription', async (c) => {
  const user = await getAuthenticatedUser(c.req.header('Authorization'));
  
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  
  try {
    const subscription = await kv.get(`user:${user.id}:subscription`);
    // Do not auto-initialize a plan; first-login users have no active plan
    return c.json({ subscription: subscription ?? null });
  } catch (error: any) {
    console.log('Get subscription error:', error);
    return c.json({ error: error.message }, 500);
  }
});

app.post('/make-server-00a119be/product-info/update', async (c) => {
  const user = await getAuthenticatedUser(c.req.header('Authorization'));
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  try {
    const { prod_id, plan_name } = await c.req.json();
    const pid = String(prod_id || '');
    const pn = String(plan_name || '').toLowerCase();
    const validPlan = pn === 'free' || pn === 'pro' || pn === 'elite' || pn === 'coins';
    const validPid = pid === STRIPE_PRODUCT_FREE || pid === STRIPE_PRODUCT_PRO || pid === STRIPE_PRODUCT_COINS || /^prod_[A-Za-z0-9]+$/.test(pid);
    if (!validPlan || !validPid) return c.json({ error: 'Invalid product info' }, 400);
    await setUserProductInfo(String(user.id), pid, pn);
    return c.json({ ok: true });
  } catch (error: any) {
    return c.json({ error: error?.message || 'Failed to update product info' }, 500);
  }
});

app.post('/make-server-00a119be/coins/allocate', async (c) => {
  const user = await getAuthenticatedUser(c.req.header('Authorization'));
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  try {
    const { amount_usd } = await c.req.json();
    const amtRaw = Number(amount_usd);
    if (!isFinite(amtRaw)) return c.json({ error: 'Amount must be numeric' }, 400);
    const amt = clampCoinsAmountUsd(amtRaw);
    if (amt <= 0) return c.json({ error: 'Amount must be between 1 and 5 USD' }, 400);
    const coins = coinsFromUsd(amt);
    await kv.set(`coins:pending:${user.id}`, { userId: user.id, amountUsd: amt, coins, prod_id: STRIPE_PRODUCT_COINS, at: new Date().toISOString() });
    return c.json({ amount_usd: amt, coins });
  } catch (error: any) {
    return c.json({ error: error?.message || 'Failed to allocate coins' }, 500);
  }
});

app.get('/make-server-00a119be/coins', async (c) => {
  const user = await getAuthenticatedUser(c.req.header('Authorization'));
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  try {
    const key = `coins:${user.id}`;
    const existing = await kv.get(key);
    const count = typeof existing?.count === 'number' ? existing.count : Number(existing) || 0;
    c.header('Cache-Control', 'no-store');
    return c.json({ coins: Math.max(0, count) });
  } catch (error: any) {
    return c.json({ error: error?.message || 'Failed to load coins' }, 500);
  }
});

app.get('/make-server-00a119be/debug/env/coins', async (c) => {
  const user = await getAuthenticatedUser(c.req.header('Authorization'));
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  try {
    return c.json({
      stripe_secret_present: !!STRIPE_SECRET,
      stripe_webhook_secret_present: !!STRIPE_WEBHOOK_SECRET,
      stripe_webhook_subscription_secret_present: !!STRIPE_WEBHOOK_SECRET_SUBSCRIPTION,
      product_coins_id: STRIPE_PRODUCT_COINS,
      product_pro_id: STRIPE_PRODUCT_PRO,
      product_elite_id: STRIPE_PRODUCT_ELITE,
      product_elite_monthly_id: STRIPE_PRODUCT_ELITE_MONTHLY,
      product_elite_yearly_id: STRIPE_PRODUCT_ELITE_YEARLY,
      coins_payment_link_id: COINS_PAYMENT_LINK_ID,
    });
  } catch (error: any) {
    return c.json({ error: error?.message || 'Failed to read env' }, 500);
  }
});

app.get('/make-server-00a119be/product-info/me', async (c) => {
  const user = await getAuthenticatedUser(c.req.header('Authorization'));
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  try {
    const { data, error } = await supabase.auth.admin.getUserById(String(user.id));
    if (error) return c.json({ error: 'Failed to load user' }, 500);
    const info = (data?.user?.user_metadata as any)?.product_info || null;
    return c.json({ product_info: info });
  } catch (error: any) {
    return c.json({ error: error?.message || 'Failed to load product info' }, 500);
  }
});

app.post('/make-server-00a119be/payments/webhook', async (c) => {
  if (!stripe || !STRIPE_WEBHOOK_SECRET) {
    return c.json({ received: false }, 500);
  }
  const sig = c.req.header('stripe-signature') || '';
  const payload = await c.req.text();
  let event: any;
  try {
    event = stripe.webhooks.constructEvent(payload, sig, STRIPE_WEBHOOK_SECRET);
  } catch {
    return c.json({ received: false }, 400);
  }
  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as any;
      if ((session as any)?.mode === 'subscription') {
        return c.json({ received: true });
      }
      let userId = (session.metadata && (session.metadata as any).user_id) || (session as any)?.client_reference_id || null;
      if (!userId) {
        const email = (session.customer_details as any)?.email || (session.customer_email as any) || null;
        if (email) {
          try {
            const { data, error } = await supabase.auth.admin.listUsers({ perPage: 200, page: 1 } as any);
            if (!error && Array.isArray(data?.users)) {
              const found = data.users.find((u: any) => String(u?.email || '').toLowerCase() === String(email).toLowerCase());
              userId = found?.id || null;
            }
          } catch {}
        }
      }
      if (!userId) return c.json({ received: true });
      let purpose = String((session.metadata as any)?.purpose || '');
      let productId: string | null = null;
      if (!purpose) {
        try {
          const items = await stripe.checkout.sessions.listLineItems(session.id, { limit: 10 });
          const first = Array.isArray(items?.data) ? items.data[0] : null;
          const priceId = first?.price?.id || null;
          if (priceId) {
            const price = await stripe.prices.retrieve(priceId);
            productId = typeof price?.product === 'string' ? price.product : (price?.product as any)?.id;
            if (productId) {
              // Prefer exact product ID match to avoid name-based ambiguity
              if (!purpose && productId === STRIPE_PRODUCT_COINS) purpose = 'coins';
              if (!purpose) {
                if (STRIPE_PRODUCT_ELITE && productId === STRIPE_PRODUCT_ELITE) purpose = 'elite';
                else if (STRIPE_PRODUCT_ELITE_MONTHLY && productId === STRIPE_PRODUCT_ELITE_MONTHLY) purpose = 'elite';
                else if (STRIPE_PRODUCT_ELITE_YEARLY && productId === STRIPE_PRODUCT_ELITE_YEARLY) purpose = 'elite';
              }
              if (!purpose && productId === STRIPE_PRODUCT_PRO) purpose = 'pro';
              
              try {
                const product = await stripe.products.retrieve(productId);
                const name = String((product as any)?.name || '').toLowerCase();
                if (!purpose && name.includes('coin')) purpose = 'coins';
                if (!purpose && name.includes('free')) purpose = 'free';
                if (!purpose && name.includes('elite')) purpose = 'elite';
                if (!purpose && name.includes('pro')) purpose = 'pro';
              } catch {}
            }
          }
        } catch {}
      }
      if (!purpose && COINS_PAYMENT_LINK_ID && String((session as any)?.payment_link || '') === COINS_PAYMENT_LINK_ID) {
        purpose = 'coins';
      }
      if (!purpose && typeof (session as any)?.amount_total === 'number') {
        const amt = Number((session as any).amount_total || 0);
        if (amt === 0) purpose = 'free';
      }
      if (purpose === 'free') {
        const subscription: any = { plan: 'free', subscriptionDate: new Date().toISOString() };
        await kv.set(`user:${userId}:subscription`, subscription);
        await kv.set(`session:${userId}:payment_complete`, { value: true, timestamp: new Date().toISOString() });
        await kv.set(`audit:${userId}:${event.id}`, { event: 'payments.checkout.completed', sessionId: session.id, createdAt: new Date().toISOString(), plan: 'free', status: 'completed' });
        await setUserProductInfo(String(userId), STRIPE_PRODUCT_FREE, 'free');
      } else if (purpose === 'coins') {
        const amountUsd = clampCoinsAmountUsd(Math.round(Number((session as any)?.amount_total || 0) / 100));
        const coins = coinsFromUsd(amountUsd);
        const key = `coins:${userId}`;
        const existing = await kv.get(key);
        const count = typeof existing?.count === 'number' ? existing.count : Number(existing) || 0;
        await kv.set(key, { count: count + coins, updated_at: new Date().toISOString() });
        await kv.set(`audit:coins_tx:${userId}:${event.id}`, { event: 'payments.checkout.completed', sessionId: session.id, createdAt: new Date().toISOString(), amountUsd, coins, prod_id: STRIPE_PRODUCT_COINS });
        await setUserProductInfo(String(userId), STRIPE_PRODUCT_COINS, 'coins');
      } else if (purpose === 'elite' || purpose === 'pro') {
        const expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        const subscription: any = { plan: purpose, subscriptionDate: new Date().toISOString(), expiryDate };
        await kv.set(`user:${userId}:subscription`, subscription);
        await kv.set(`session:${userId}:payment_complete`, { value: true, timestamp: new Date().toISOString() });
        const notificationId = crypto.randomUUID();
        const notification = { id: notificationId, type: 'subscription', title: purpose === 'elite' ? 'Welcome to Elite! 🚀' : 'Welcome to Pro! 🎉', message: 'Your weekly AI analysis updates are now active. We\'ll re-analyze your strategies every 5 days.', timestamp: new Date().toISOString(), read: false } as any;
        await kv.set(`notification:${userId}:${notificationId}`, notification);
        const strategies = await kv.getByPrefix(`strategy:${userId}:`);
        for (const strategy of strategies) {
          const nextAnalysis = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
          await kv.set(`analysis:${userId}:${strategy.id}:next`, { nextAnalysisDate: nextAnalysis, strategyName: strategy.strategy_name });
        }
        await kv.set(`audit:${userId}:${event.id}`, { event: 'payments.checkout.completed', sessionId: session.id, createdAt: new Date().toISOString(), plan: purpose, status: 'completed' });
        
        let prodIdToSet = productId || '';
        if (!prodIdToSet) {
           if (purpose === 'elite') {
             prodIdToSet = STRIPE_PRODUCT_ELITE || STRIPE_PRODUCT_ELITE_MONTHLY || STRIPE_PRODUCT_ELITE_YEARLY || '';
           } else if (purpose === 'pro') {
             prodIdToSet = STRIPE_PRODUCT_PRO;
           }
        }
        await setUserProductInfo(String(userId), prodIdToSet, purpose);
      }
    } else if (event.type === 'charge.succeeded') {
      const ch = event.data.object as any;
      let userId = (ch.metadata && (ch.metadata as any)?.user_id) || null;
      
      // Fallback: find user by email if not in metadata
      if (!userId) {
        const email = ch.receipt_email || ch.billing_details?.email || null;
        if (email) {
          try {
            const { data, error } = await supabase.auth.admin.listUsers({ perPage: 200, page: 1 } as any);
            if (!error && Array.isArray(data?.users)) {
              const found = data.users.find((u: any) => String(u?.email || '').toLowerCase() === String(email).toLowerCase());
              userId = found?.id || null;
            }
          } catch {}
        }
      }

      let purpose = String((ch.metadata as any)?.purpose || '');
      // Fallback: detect purpose from description if not in metadata
      if (!purpose) {
        const desc = String(ch.description || '').toLowerCase();
        if (desc.includes('elite')) purpose = 'elite';
        else if (desc.includes('coin')) purpose = 'coins';
        else if (desc.includes('pro plan') || desc.includes('pro tier') || desc === 'pro') purpose = 'pro';
      }

      if (userId && purpose === 'free') {
        const subscription: any = { plan: 'free', subscriptionDate: new Date().toISOString() };
        await kv.set(`user:${userId}:subscription`, subscription);
        await kv.set(`session:${userId}:payment_complete`, { value: true, timestamp: new Date().toISOString() });
        await kv.set(`audit:${userId}:${event.id}`, { event: 'charge.succeeded', payment_intent: ch.payment_intent, createdAt: new Date().toISOString(), plan: 'free', status: 'completed' });
        await setUserProductInfo(String(userId), STRIPE_PRODUCT_FREE, 'free');
      } else if (userId && purpose === 'coins') {
        const amountUsd = clampCoinsAmountUsd(Math.round(Number(ch?.amount || 0) / 100));
        const coins = coinsFromUsd(amountUsd);
        const key = `coins:${userId}`;
        const existing = await kv.get(key);
        const count = typeof existing?.count === 'number' ? existing.count : Number(existing) || 0;
        await kv.set(key, { count: count + coins, updated_at: new Date().toISOString() });
        await kv.set(`audit:coins_tx:${userId}:${event.id}`, { event: 'charge.succeeded', payment_intent: ch.payment_intent, createdAt: new Date().toISOString(), amountUsd, coins, prod_id: STRIPE_PRODUCT_COINS });
        await setUserProductInfo(String(userId), STRIPE_PRODUCT_COINS, 'coins');
      } else if (userId && (purpose === 'elite' || purpose === 'pro')) {
        const expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        const subscription: any = { plan: purpose, subscriptionDate: new Date().toISOString(), expiryDate };
        await kv.set(`user:${userId}:subscription`, subscription);
        await kv.set(`session:${userId}:payment_complete`, { value: true, timestamp: new Date().toISOString() });
        const notificationId = crypto.randomUUID();
        const notification = { id: notificationId, type: 'subscription', title: purpose === 'elite' ? 'Welcome to Elite! 🚀' : 'Welcome to Pro! 🎉', message: 'Your weekly AI analysis updates are now active. We\'ll re-analyze your strategies every 5 days.', timestamp: new Date().toISOString(), read: false } as any;
        await kv.set(`notification:${userId}:${notificationId}`, notification);
        const strategies = await kv.getByPrefix(`strategy:${userId}:`);
        for (const strategy of strategies) {
          const nextAnalysis = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
          await kv.set(`analysis:${userId}:${strategy.id}:next`, { nextAnalysisDate: nextAnalysis, strategyName: strategy.strategy_name });
        }
        await kv.set(`audit:${userId}:${event.id}`, { event: 'charge.succeeded', payment_intent: ch.payment_intent, createdAt: new Date().toISOString(), plan: purpose, status: 'completed' });
        
        let prodIdToSet = '';
        if (purpose === 'elite') {
          prodIdToSet = STRIPE_PRODUCT_ELITE || STRIPE_PRODUCT_ELITE_MONTHLY || STRIPE_PRODUCT_ELITE_YEARLY || '';
        } else if (purpose === 'pro') {
          prodIdToSet = STRIPE_PRODUCT_PRO;
        }
        
        await setUserProductInfo(String(userId), prodIdToSet, purpose);
      }
    }
    return c.json({ received: true });
  } catch {
    return c.json({ received: false }, 500);
  }
});

app.post('/make-server-00a119be/subscription/webhook', async (c) => {
  if (!stripe || !STRIPE_WEBHOOK_SECRET_SUBSCRIPTION) {
    return c.json({ received: false }, 500);
  }
  const sig = c.req.header('stripe-signature') || '';
  const payload = await c.req.text();
  let event: any;
  try {
    event = stripe.webhooks.constructEvent(payload, sig, STRIPE_WEBHOOK_SECRET_SUBSCRIPTION);
  } catch {
    return c.json({ received: false }, 400);
  }
  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as any;
      if ((session as any)?.mode !== 'subscription') {
        return c.json({ received: true });
      }
      let userId = (session.metadata && (session.metadata as any).user_id) || (session as any)?.client_reference_id || null;
      if (!userId) {
        const email = (session.customer_details as any)?.email || (session.customer_email as any) || null;
        if (email) {
          try {
            const { data, error } = await supabase.auth.admin.listUsers({ perPage: 200, page: 1 } as any);
            if (!error && Array.isArray(data?.users)) {
              const found = data.users.find((u: any) => String(u?.email || '').toLowerCase() === String(email).toLowerCase());
              userId = found?.id || null;
            }
          } catch {}
        }
      }
      if (!userId) return c.json({ received: true });
      
      let plan = String((session.metadata as any)?.purpose || '');
      let productId: string | null = null;
      
      // Attempt to retrieve line items to identify product
      try {
        const items = await stripe.checkout.sessions.listLineItems(session.id, { limit: 10 });
        const first = Array.isArray(items?.data) ? items.data[0] : null;
        if (first?.price?.product) {
          productId = typeof first.price.product === 'string' ? String(first.price.product) : ((first.price.product as any)?.id || null);
        }
      } catch (e) { console.error('Error fetching line items:', e); }

      if (productId) {
        // If plan is not set from metadata, deduce from product ID
        if (!plan) {
            if (STRIPE_PRODUCT_ELITE && productId === STRIPE_PRODUCT_ELITE) plan = 'elite';
            else if (STRIPE_PRODUCT_ELITE_MONTHLY && productId === STRIPE_PRODUCT_ELITE_MONTHLY) plan = 'elite';
            else if (STRIPE_PRODUCT_ELITE_YEARLY && productId === STRIPE_PRODUCT_ELITE_YEARLY) plan = 'elite';
            else if (productId === STRIPE_PRODUCT_PRO) plan = 'pro';
        }
        
        // If still not set, deduce from product name
        if (!plan) {
          try {
            const product = await stripe.products.retrieve(productId);
            const name = String(product?.name || '').toLowerCase();
            if (name.includes('elite')) plan = 'elite';
            else if (name.includes('pro')) plan = 'pro';
          } catch {}
        }
      }

      // Fallback: Check amount if plan is still unknown (Robustness against missing env vars/names)
      if (!plan && typeof (session as any)?.amount_total === 'number') {
         const amt = Number((session as any).amount_total);
         // Elite: $29 or $299
         if (amt === 2900 || amt === 29900) plan = 'elite';
         // Pro: $19 or $199
         else if (amt === 1900 || amt === 19900) plan = 'pro';
      }
      
      // Default to 'pro' ONLY if we still don't have a plan but we have a user (legacy behavior)
      // BUT ONLY if we didn't find a price match. If we found a price match for Elite, it would be set.
      // If we remove this default, we avoid accidental downgrades/wrong assignments.
      if (!plan) {
          // Log failure to KV for debugging
          try { await kv.set(`debug:webhook:fail:${session.id}`, { reason: 'Unknown plan', productId, amount: (session as any)?.amount_total }); } catch {}
          return c.json({ received: true }); // Do not proceed with update
      }

      const expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      const subscription: any = { plan, subscriptionDate: new Date().toISOString(), expiryDate };
      await kv.set(`user:${userId}:subscription`, subscription);
      await kv.set(`session:${userId}:payment_complete`, { value: true, timestamp: new Date().toISOString() });
      const notificationId = crypto.randomUUID();
      const notification = { id: notificationId, type: 'subscription', title: plan === 'elite' ? 'Welcome to Elite! 🚀' : 'Welcome to Pro! 🎉', message: 'Your weekly AI analysis updates are now active. We\'ll re-analyze your strategies every 5 days.', timestamp: new Date().toISOString(), read: false } as any;
      await kv.set(`notification:${userId}:${notificationId}`, notification);
      const strategies = await kv.getByPrefix(`strategy:${userId}:`);
      for (const strategy of strategies) {
        const nextAnalysis = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
        await kv.set(`analysis:${userId}:${strategy.id}:next`, { nextAnalysisDate: nextAnalysis, strategyName: strategy.strategy_name });
      }
      await kv.set(`audit:${userId}:${event.id}`, { event: 'checkout.completed', sessionId: session.id, createdAt: new Date().toISOString(), plan, status: 'completed' });
      
      let prodIdToSet = productId || '';
      if (!prodIdToSet) {
         if (plan === 'elite') {
           prodIdToSet = STRIPE_PRODUCT_ELITE || STRIPE_PRODUCT_ELITE_MONTHLY || STRIPE_PRODUCT_ELITE_YEARLY || '';
         } else if (plan === 'pro') {
           prodIdToSet = STRIPE_PRODUCT_PRO;
         }
      }
      await setUserProductInfo(String(userId), prodIdToSet, plan);
    } else if (event.type === 'invoice.payment_succeeded') {
      const inv = event.data.object as any;
      const userId = (inv.metadata && (inv.metadata as any).user_id) || null;
      if (userId) {
        let plan = String((inv.metadata && (inv.metadata as any).purpose) || '');
        let productId: string | null = null;
        if (inv.lines && inv.lines.data) {
           const first = inv.lines.data[0];
           if (first?.price?.product) {
               productId = typeof first.price.product === 'string' ? String(first.price.product) : ((first.price.product as any)?.id || null);
           }
        }
        
        if (productId) {
           if (!plan) {
               if (STRIPE_PRODUCT_ELITE && productId === STRIPE_PRODUCT_ELITE) plan = 'elite';
               else if (STRIPE_PRODUCT_ELITE_MONTHLY && productId === STRIPE_PRODUCT_ELITE_MONTHLY) plan = 'elite';
               else if (STRIPE_PRODUCT_ELITE_YEARLY && productId === STRIPE_PRODUCT_ELITE_YEARLY) plan = 'elite';
               else if (productId === STRIPE_PRODUCT_PRO) plan = 'pro';
           }
           
           if (!plan) {
               try {
                 const product = await stripe.products.retrieve(productId);
                 const name = String(product?.name || '').toLowerCase();
                 if (name.includes('elite')) plan = 'elite';
                 else if (name.includes('pro')) plan = 'pro';
               } catch {}
           }
        }

        // Fallback: Check amount if plan is still unknown (Robustness against missing env vars/names)
        if (!plan && typeof (inv as any)?.amount_paid === 'number') {
           const amt = Number((inv as any).amount_paid);
           // Elite: $29 or $299
           if (amt === 2900 || amt === 29900) plan = 'elite';
           // Pro: $19 or $199
           else if (amt === 1900 || amt === 19900) plan = 'pro';
        }

        if (!plan) {
            // Log failure to KV for debugging
            try { await kv.set(`debug:webhook:fail:${inv.id}`, { reason: 'Unknown plan', productId, amount: (inv as any)?.amount_paid }); } catch {}
            return c.json({ received: true });
        }
        
        const expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        const subscription: any = { plan, subscriptionDate: new Date().toISOString(), expiryDate };
        await kv.set(`user:${userId}:subscription`, subscription);
        await kv.set(`audit:${userId}:${event.id}`, { event: 'invoice.payment_succeeded', createdAt: new Date().toISOString(), plan, status: 'completed' });
        
        let prodIdToSet = productId || '';
        if (!prodIdToSet) {
           if (plan === 'elite') {
             prodIdToSet = STRIPE_PRODUCT_ELITE || STRIPE_PRODUCT_ELITE_MONTHLY || STRIPE_PRODUCT_ELITE_YEARLY || '';
           } else if (plan === 'pro') {
             prodIdToSet = STRIPE_PRODUCT_PRO;
           }
        }
        await setUserProductInfo(String(userId), prodIdToSet, plan);
      }
    } else if (event.type === 'invoice.payment_failed') {
      const inv = event.data.object as any;
      const userId = (inv.metadata && (inv.metadata as any).user_id) || null;
      if (userId) {
        await kv.set(`audit:${userId}:${event.id}`, { event: 'payment.failed', createdAt: new Date().toISOString(), plan: 'pro', status: 'failed', reason: inv?.hosted_invoice_url ? 'invoice_failed' : 'unknown' });
        const notificationId = crypto.randomUUID();
        const notification = { id: notificationId, type: 'payment', title: 'Payment Failed', message: 'Your Pro subscription payment failed.', timestamp: new Date().toISOString(), read: false } as any;
        await kv.set(`notification:${userId}:${notificationId}`, notification);
      }
    }
    return c.json({ received: true });
  } catch {
    return c.json({ received: false }, 500);
  }
});

// Upgrade subscription
app.post('/make-server-00a119be/subscription/upgrade', async (c) => {
  const user = await getAuthenticatedUser(c.req.header('Authorization'));
  
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  
  try {
    const { plan } = await c.req.json();
    
    const now = new Date().toISOString();
    const subscription: any = {
      plan,
      subscriptionDate: now,
    };
    // Only pro/elite plans carry an expiry, free remains open-ended
    if (plan === 'pro' || plan === 'elite') {
      subscription.expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days from now
    }

    await kv.set(`user:${user.id}:subscription`, subscription);
    try {
      if (plan === 'pro') await setUserProductInfo(String(user.id), STRIPE_PRODUCT_PRO, 'pro');
      if (plan === 'elite') {
         const eliteId = STRIPE_PRODUCT_ELITE || STRIPE_PRODUCT_ELITE_MONTHLY || STRIPE_PRODUCT_ELITE_YEARLY || '';
         await setUserProductInfo(String(user.id), eliteId, 'elite');
      }
      if (plan === 'free') await setUserProductInfo(String(user.id), STRIPE_PRODUCT_FREE, 'free');
    } catch {}
    
    // Create welcome notification for pro/elite users
    if (plan === 'pro' || plan === 'elite') {
      const notificationId = crypto.randomUUID();
      const title = plan === 'elite' ? 'Welcome to Elite! 🚀' : 'Welcome to Pro! 🎉';
      const notification = {
        id: notificationId,
        type: 'subscription',
        title,
        message: 'Your weekly AI analysis updates are now active. We\'ll re-analyze your strategies every 5 days.',
        timestamp: new Date().toISOString(),
        read: false,
      };
      await kv.set(`notification:${user.id}:${notificationId}`, notification);
      
      // Schedule analysis for existing strategies
      const strategies = await kv.getByPrefix(`strategy:${user.id}:`);
      for (const strategy of strategies) {
        const nextAnalysis = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(); // 5 days from now
        await kv.set(`analysis:${user.id}:${strategy.id}:next`, { 
          nextAnalysisDate: nextAnalysis,
          strategyName: strategy.strategy_name,
        });
      }
    }
    
    return c.json({ subscription });
  } catch (error: any) {
    console.log('Upgrade subscription error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Select/activate a plan explicitly (used for Free selection on first login)
app.post('/make-server-00a119be/subscription/select', async (c) => {
  const user = await getAuthenticatedUser(c.req.header('Authorization'));
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const { plan } = await c.req.json();
    if (plan !== 'free' && plan !== 'pro' && plan !== 'elite') {
      return c.json({ error: 'Invalid plan' }, 400);
    }
    const now = new Date().toISOString();
    const subscription: any = { plan, subscriptionDate: now };
    if (plan === 'pro' || plan === 'elite') {
      subscription.expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      // Mirror pro/elite notification behavior
      const notificationId = crypto.randomUUID();
      const notification = {
        id: notificationId,
        type: 'subscription',
        title: plan === 'elite' ? 'Welcome to Elite! 🚀' : 'Welcome to Pro! 🎉',
        message: 'Your weekly AI analysis updates are now active. We\'ll re-analyze your strategies every 5 days.',
        timestamp: new Date().toISOString(),
        read: false,
      };
      await kv.set(`notification:${user.id}:${notificationId}`, notification);
    }
    await kv.set(`user:${user.id}:subscription`, subscription);
    try {
      if (plan === 'elite') {
        const eliteId = STRIPE_PRODUCT_ELITE || STRIPE_PRODUCT_ELITE_MONTHLY || STRIPE_PRODUCT_ELITE_YEARLY || '';
        await setUserProductInfo(String(user.id), eliteId, 'elite');
      }
      if (plan === 'pro') await setUserProductInfo(String(user.id), STRIPE_PRODUCT_PRO, 'pro');
      if (plan === 'free') await setUserProductInfo(String(user.id), STRIPE_PRODUCT_FREE, 'free');
    } catch {}
    return c.json({ subscription });
  } catch (error: any) {
    console.log('Select subscription error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Get notifications
app.get('/make-server-00a119be/notifications', async (c) => {
  const user = await getAuthenticatedUser(c.req.header('Authorization'));
  
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  
  try {
    const notifications = await kv.getByPrefix(`notification:${user.id}:`);
    
    // Sort by timestamp descending
    const sorted = notifications.sort((a: any, b: any) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    
    return c.json({ notifications: sorted });
  } catch (error: any) {
    console.log('Get notifications error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Get unread notification count
app.get('/make-server-00a119be/notifications/unread-count', async (c) => {
  const user = await getAuthenticatedUser(c.req.header('Authorization'));
  
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  
  try {
    const notifications = await kv.getByPrefix(`notification:${user.id}:`);
    const unreadCount = notifications.filter((n: any) => !n.read).length;
    
    return c.json({ count: unreadCount });
  } catch (error: any) {
    console.log('Get unread count error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Mark notification as read
app.post('/make-server-00a119be/notifications/:id/read', async (c) => {
  const user = await getAuthenticatedUser(c.req.header('Authorization'));
  
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  
  try {
    const notificationId = c.req.param('id');
    const notification = await kv.get(`notification:${user.id}:${notificationId}`);
    
    if (notification) {
      notification.read = true;
      await kv.set(`notification:${user.id}:${notificationId}`, notification);
    }
    
    return c.json({ success: true });
  } catch (error: any) {
    console.log('Mark notification as read error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Delete notification
app.delete('/make-server-00a119be/notifications/:id', async (c) => {
  const user = await getAuthenticatedUser(c.req.header('Authorization'));
  
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  
  try {
    const notificationId = c.req.param('id');
    await kv.del(`notification:${user.id}:${notificationId}`);
    
    return c.json({ success: true });
  } catch (error: any) {
    console.log('Delete notification error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Trigger strategy re-analysis (pro only)
app.post('/make-server-00a119be/strategies/:id/reanalyze', async (c) => {
  const user = await getAuthenticatedUser(c.req.header('Authorization'));
  
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  
  try {
    const testUnlock = c.req.header('X-Test-Unlock') === '1';
    const payload = await c.req.json().catch(() => ({}));
    const txId = (payload && typeof payload.tx_id === 'string' && payload.tx_id) || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const txKey = `coin_tx:${user.id}:${txId}`;
    const seen = await kv.get(txKey);
    if (seen) {
      const coinKey = `coins:${user.id}`;
      const existing = await kv.get(coinKey) || { count: 0 };
      const current = Number(existing.count || 0);
      c.header('Cache-Control', 'no-store');
      return c.json({ success: true, coins: isFinite(current) ? current : 0 });
    }
    // Check subscription, but allow coin-paid manual reanalysis for all tiers
    const subscription = await kv.get(`user:${user.id}:subscription`);
    
    // Deduct coins for manual re-analysis (synchronous on server)
    const COIN_COST = 2;
    try {
      const coinKey = `coins:${user.id}`;
      const existing = await kv.get(coinKey) || { count: 0 };
      const current = Number(existing.count || 0);
      if (!isFinite(current) || current < COIN_COST) {
        c.header('Cache-Control', 'no-store');
        return c.json({ error: 'Insufficient coins' }, 402);
      }
      const next = Math.max(0, current - COIN_COST);
      await kv.set(coinKey, { count: next, updated_at: new Date().toISOString() });
      await kv.set(`audit:coins_tx:${user.id}:${Date.now()}`, { event: 'coins.deduct', amount: COIN_COST, before: current, after: next, createdAt: new Date().toISOString() });
      await kv.set(txKey, { processed: true, at: new Date().toISOString() });
      c.set('x-user-coins', String(next));
    } catch (coinErr: any) {
      console.log('Coin deduction error:', coinErr?.message || coinErr);
      return c.json({ error: 'Failed to deduct coins' }, 500);
    }
    
    const strategyId = c.req.param('id');
    const strategy = await kv.get(`strategy:${user.id}:${strategyId}`);
    
    if (!strategy) {
      return c.json({ error: 'Strategy not found' }, 404);
    }
    
    // Generate AI-powered analysis metrics and improvements
    let improvements: string[];
    let metrics: Record<string, any> | null = null;
    try {
      improvements = await analyzeStrategyWithAI(strategy);
      metrics = await generateAnalysisMetricsWithAI(strategy);
    } catch (error: any) {
      console.log('AI strategy analysis error:', error);
      improvements = ['Unable to generate analysis at this time. Please try again later.'];
    }
    
    // Create a notification with analysis update
    const notificationId = crypto.randomUUID();
    const notification = {
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
    
    const coinKey = `coins:${user.id}`;
    const existingCoins = await kv.get(coinKey) || { count: 0 };
    const coinsCount = Number(existingCoins.count || 0);
    c.header('Cache-Control', 'no-store');
    return c.json({ 
      success: true, 
      notification,
      nextAnalysisDate: nextAnalysis,
      metrics,
      coins: isFinite(coinsCount) ? coinsCount : 0,
    });
  } catch (error: any) {
    console.log('Re-analyze strategy error:', error);
    return c.json({ error: error.message }, 500);
  }
});

app.post('/make-server-00a119be/strategies/:id/retry', async (c) => {
  const authHeader = c.req.header('Authorization');
  const user = await getAuthenticatedUser(authHeader);
  
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const strategyId = c.req.param('id');
  
  try {
    // Get the strategy from KV store
    const strategy = await kv.get(`strategy:${user.id}:${strategyId}`);
    
    if (!strategy) {
      return c.json({ error: 'Strategy not found' }, 404);
    }

    // Check if strategy is in error state
    if (strategy.status !== 'error') {
      return c.json({ error: 'Strategy is not in error state' }, 400);
    }

    console.log(`Retrying code generation for strategy ${strategyId}`);

    // Update strategy status to generating
    const updatedStrategy = {
      ...strategy,
      status: 'generating',
      error: null,
      updated_at: new Date().toISOString()
    };
    
    await kv.set(`strategy:${user.id}:${strategyId}`, updatedStrategy);

    // Generate code using Claude AI in background with retry logic
    (async () => {
      let retryCount = 0;
      const maxRetries = 3;
      const baseDelay = 1000; // 1 second

      while (retryCount < maxRetries) {
        try {
          console.log(`Retry attempt ${retryCount + 1} for strategy ${strategyId}`);
          
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
          console.log(`Strategy ${strategyId} retry successful`);
          return;
          
        } catch (error) {
          retryCount++;
          console.error(`Retry attempt ${retryCount} failed for strategy ${strategyId}:`, error);
          
          if (retryCount >= maxRetries) {
            // Final failure - update strategy with error
            const errorStrategy = {
              ...updatedStrategy,
              status: 'error',
              error: `Generation failed after ${maxRetries} retries: ${error.message}`,
              updated_at: new Date().toISOString()
            };
            
            await kv.set(`strategy:${user.id}:${strategyId}`, errorStrategy);
            console.error(`Strategy ${strategyId} retry failed permanently`);
            return;
          }
          
          // Wait before next retry with exponential backoff
          const delay = baseDelay * Math.pow(2, retryCount - 1);
          console.log(`Waiting ${delay}ms before retry ${retryCount + 1}`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    })();

    return c.json({ 
      message: 'Retry initiated',
      strategy: updatedStrategy
    });

  } catch (error) {
    console.error('Error retrying strategy generation:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

app.get('/make-server-00a119be/strategies/:id/next-analysis', async (c) => {
  const user = await getAuthenticatedUser(c.req.header('Authorization'));
  
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  
  try {
    const strategyId = c.req.param('id');
    const next = await kv.get(`analysis:${user.id}:${strategyId}:next`);
    if (!next || !next.nextAnalysisDate) {
      return c.json({ next_analysis: null });
    }
    return c.json({ next_analysis: next.nextAnalysisDate });
  } catch (error: any) {
    console.log('Get next analysis error:', error);
    return c.json({ error: error.message }, 500);
  }
});

Deno.serve(app.fetch);
import { PROMPT_VERSION, deriveStrategyType, buildAnalyzeMessages, buildMetricsMessages, buildCodeMessages } from '../../../utils/promptTemplates';
async function recordPromptVersion(kind: string, type: string) {
  try {
    await kv.set(`prompt_version:${kind}:${type}:${Date.now()}`, { version: PROMPT_VERSION, kind, type, at: new Date().toISOString() });
  } catch {}
}
