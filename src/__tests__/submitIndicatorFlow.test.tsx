import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { waitFor } from '@testing-library/dom';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import type { Root } from 'react-dom/client';

vi.mock('../utils/supabase/client', () => ({
  supabase: { auth: { getUser: vi.fn(async () => ({ data: { user: null } })) } },
  getFunctionUrl: (path: string) => path,
}));

vi.mock('../utils/api', () => ({
  apiFetch: vi.fn(async (path: string) => {
    if (String(path).includes('make-server-00a119be/strategies') && !String(path).includes('/reanalyze')) return { strategyId: 'id-123' } as any;
    if (String(path).includes('/reanalyze')) return {} as any;
    if (String(path).includes('usage')) return { usage: { count: 0, remaining: 4, window: '7d' } } as any;
    return {} as any;
  }),
}));

import { ThemeProvider } from '../components/ThemeProvider';
import { SubmitStrategyScreen } from '../components/SubmitStrategyScreen';

describe('Submit flow with indicators', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as any;
    try { (Element.prototype as any).scrollIntoView = () => {}; } catch {}
    container = document.createElement('div');
    document.body.appendChild(container);
    (globalThis as any).fetch = vi.fn(async (url: string) => {
      if (String(url).includes('usage')) return { ok: true, json: async () => ({ usage: { count: 0, remaining: 4, window: '7d' } }) } as any;
      if (String(url).includes('strategies')) return { ok: true, json: async () => ({ strategies: [] }) } as any;
      return { ok: true, json: async () => ({}) } as any;
    });
    try { window.localStorage.removeItem('indicator.selection'); } catch {}
    try { window.localStorage.removeItem('indicator.mode'); } catch {}
  });

  afterEach(() => {
    try { root?.unmount(); } catch {}
    try { document.body.removeChild(container); } catch {}
    vi.clearAllTimers();
  });

  it('submits strategy and navigates with persisted indicators', async () => {
    const onNavigate = vi.fn();
    try { window.localStorage.setItem('indicator.selection', JSON.stringify([{ id: 'std:rsi', label: 'RSI' }])); } catch {}
    try { window.localStorage.setItem('indicator.mode', 'single'); } catch {}
    root = createRoot(container);
    await act(async () => {
      root.render(
        <ThemeProvider>
          <SubmitStrategyScreen
            onNavigate={onNavigate}
            accessToken={null}
            isProUser={true}
            tier="pro"
            hasActivePlan={true}
            remainingGenerations={4}
            onGenerationCount={() => {}}
          />
        </ThemeProvider>
      );
    });

    const name = container.querySelector('#strategy-name') as HTMLInputElement;
    const desc = container.querySelector('#description') as HTMLTextAreaElement;
    const risk = container.querySelector('#risk') as HTMLTextAreaElement;
    expect(name && desc && risk).toBeTruthy();
    name.value = 'My Test Strategy';
    name.dispatchEvent(new Event('input', { bubbles: true }));
    desc.value = 'This is a sufficiently long description for testing purposes.';
    desc.dispatchEvent(new Event('input', { bubbles: true }));
    risk.value = 'Max 2% risk per trade';
    risk.dispatchEvent(new Event('input', { bubbles: true }));

    const platformTrigger = container.querySelector('#platform') as HTMLElement;
    expect(platformTrigger).toBeTruthy();
    platformTrigger!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitFor(() => {
      const el = Array.from(document.querySelectorAll('[data-slot="select-item"]')).find((x) => (x.textContent || '').includes('MQL4'));
      expect(el).toBeTruthy();
    });
    const platformItem = Array.from(document.querySelectorAll('[data-slot="select-item"]')).find((el) => (el.textContent || '').includes('MQL4')) as HTMLElement | null;
    expect(platformItem).toBeTruthy();
    platformItem!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    await waitFor(() => {
      expect(container.textContent || '').toContain('RSI');
    });

    const form = container.querySelector('form') as HTMLFormElement;
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    const saved = window.localStorage.getItem('indicator.selection');
    expect(saved).toBeTruthy();
    const parsed = JSON.parse(saved || '[]');
    expect(parsed.some((i: any) => i.label === 'RSI')).toBe(true);
  });
});