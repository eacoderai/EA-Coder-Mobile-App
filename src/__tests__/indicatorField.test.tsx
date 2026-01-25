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
    if (String(path).includes('usage')) return { usage: { count: 0, remaining: 4, window: '7d' } } as any;
    if (String(path).includes('/strategies') && !String(path).includes('/reanalyze')) return { strategyId: 'test-strat-id' } as any;
    if (String(path).includes('/reanalyze')) return {} as any;
    return {} as any;
  }),
}));

import { ThemeProvider } from '../components/ThemeProvider';
import { SubmitStrategyScreen } from '../components/SubmitStrategyScreen';

describe('Indicator field', () => {
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

  it('renders preselected indicators and supports removal', async () => {
    const onNavigate = vi.fn();
    try { window.localStorage.setItem('indicator.selection', JSON.stringify([{ id: 'std:rsi', label: 'RSI' }])); } catch {}
    try { window.localStorage.setItem('indicator.mode', 'multiple'); } catch {}
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

    await waitFor(() => {
      expect(container.textContent || '').toContain('RSI');
    });

    const removeBtn = Array.from(container.querySelectorAll('button')).find((b) => (b.getAttribute('aria-label') || '').includes('Remove RSI')) as HTMLButtonElement | null;
    expect(removeBtn).toBeTruthy();
    removeBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await waitFor(() => {
      expect(container.textContent || '').not.toContain('RSI');
    });
  });

  it('persists selections between mounts', async () => {
    const onNavigate = vi.fn();
    try { window.localStorage.setItem('indicator.selection', JSON.stringify([{ id: 'custom:supertrend', label: 'SuperTrend', custom: true }])); } catch {}
    try { window.localStorage.setItem('indicator.mode', 'multiple'); } catch {}
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
    await waitFor(() => {
      expect(container.textContent || '').toContain('SuperTrend');
    });
    try { root?.unmount(); } catch {}
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
    await waitFor(() => {
      expect(container.textContent || '').toContain('SuperTrend');
    });
  });
});