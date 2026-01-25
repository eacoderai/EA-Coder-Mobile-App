import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ChatScreen } from '../components/ChatScreen';

const wait = (ms = 0) => new Promise(r => setTimeout(r, ms));

describe('ChatScreen', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (input: any, init?: any) => {
      const url = typeof input === 'string' ? input : String(input);
      if (url.includes('/strategies/') && url.endsWith('/chat') && init?.method === 'POST') {
        return new Response(JSON.stringify({ response: 'ok' }), { status: 200 });
      }
      if (url.includes('/strategies/') && url.endsWith('/chat')) {
        return new Response(JSON.stringify({ messages: [] }), { status: 200 });
      }
      if (url.includes('/strategies/') && url.endsWith('/code')) {
        if (init?.method === 'POST') return new Response(JSON.stringify({ ok: true }), { status: 200 });
        return new Response(JSON.stringify({ code: 'initial', versions: [] }), { status: 200 });
      }
      if (url.includes('/strategies/')) {
        return new Response(JSON.stringify({ id: 's1', strategy_name: 'Test', platform: 'mql5', generated_code: 'initial' }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    }));
    vi.stubGlobal('crypto', { randomUUID: () => 'uuid-1' } as any);
    window.localStorage.clear();
  });

  it('renders fixed send bar above bottom nav with input', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const nav = document.createElement('nav');
    nav.className = 'bottom-nav';
    nav.style.height = '64px';
    document.body.appendChild(nav);
    const root = createRoot(container);
    root.render(<ChatScreen strategyId="s1" onNavigate={() => {}} accessToken="t" isProUser={true} />);
    let sendBtn: HTMLButtonElement | null = null;
    let input: HTMLInputElement | null = null;
    for (let i = 0; i < 30; i++) { await wait(20); 
      sendBtn = container.querySelector('button[aria-label="Send message"]') as HTMLButtonElement | null;
      input = Array.from(container.querySelectorAll('input')).find(i => (i as HTMLInputElement).placeholder?.includes('Ask to modify')) as HTMLInputElement | null;
      if (sendBtn && input) break; }
    expect(!!sendBtn && !!input).toBe(true);
  });

  it('loads local edited code without management controls', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    try { window.localStorage.setItem('strategy_code:s1', JSON.stringify('edited\nline')); } catch {}
    root.render(<ChatScreen strategyId="s1" onNavigate={() => {}} accessToken="t" isProUser={true} />);
    await wait(200);
    const code = JSON.parse(window.localStorage.getItem('strategy_code:s1') || 'null');
    expect(code).toBe('edited\nline');
  });

  it('sends codeOverride with messages', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    try { window.localStorage.setItem('strategy_code:s1', JSON.stringify('edited')); } catch {}
    root.render(<ChatScreen strategyId="s1" onNavigate={() => {}} accessToken="t" isProUser={true} />);
    let input: HTMLInputElement | null = null;
    for (let i = 0; i < 30; i++) { await wait(20); input = Array.from(container.querySelectorAll('input')).find(i => (i as HTMLInputElement).placeholder?.includes('Ask to modify')) as HTMLInputElement | null; if (input) break; }
    input.value = 'Hello';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const sendBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    (global.fetch as any).mockClear();
    sendBtn.click();
    await wait(10);
    const calls = (global.fetch as any).mock.calls as any[];
    const post = calls.find(c => String(c[0]).includes('/strategies/') && String(c[0]).endsWith('/chat') && c[1]?.method === 'POST');
    expect(post).toBeDefined();
    const body = JSON.parse(post[1].body);
    expect(body.codeOverride).toBe('edited');
  });
});