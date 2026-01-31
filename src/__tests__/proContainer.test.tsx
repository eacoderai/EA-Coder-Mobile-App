import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { AnalyzeScreen } from '../components/AnalyzeScreen';
const wait = (ms = 0) => new Promise(r => setTimeout(r, ms));

vi.mock('../utils/api', async (orig) => {
  const mod: any = await orig();
  return {
    ...mod,
    apiFetch: vi.fn(async (path: string) => {
      if (path.includes('/strategies/mock-id') && !path.endsWith('/next-analysis') && !path.endsWith('/reanalyze')) {
        return { id: 'mock-id', strategy_name: 'Test', platform: 'mql4', analysis_instrument: 'EURUSD', code: 'print("hi")' } as any;
      }
      if (path.includes('/strategies/mock-id/next-analysis')) {
        const future = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
        return { next_analysis: future } as any;
      }
      if (path.endsWith('/subscription') || path.includes('/user/subscription')) {
        return { subscription: { plan: 'pro' } } as any;
      }
      if (path.endsWith('/usage')) {
        return { usage: { count: 0, remaining: 4, window: 'monthly' } } as any;
      }
      if (path.endsWith('/reanalyze')) {
        return { nextAnalysisDate: new Date().toISOString() } as any;
      }
      return {} as any;
    }),
  };
});

describe('Pro container containment', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class { observe(){} disconnect(){} } as any);
    window.localStorage.clear();
  });

  it('applies containment classes and wraps rows', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    root.render(<AnalyzeScreen strategyId="mock-id" onNavigate={() => {}} accessToken="tkn" isProUser={true} remainingGenerations={4} onGenerationCount={() => {}} tier="pro" hasActivePlan={true} />);
    let heading: HTMLHeadingElement | undefined;
    for (let i = 0; i < 30; i++) { await wait(50); heading = Array.from(container.querySelectorAll('h3')).find(h => h.textContent === 'Pro Analysis Active') as HTMLHeadingElement | undefined; if (heading) break; }
    expect(!!heading).toBe(true);
    const pro = heading?.closest('div');
    expect(pro?.className).toContain('flex-1');
    expect(pro?.className).toContain('relative');
    expect(pro?.className).toContain('min-w-0');
    const rows = Array.from(pro?.querySelectorAll('div.flex') || []);
    expect(rows.length).toBeGreaterThan(0);
    const hasWrappedRow = rows.some(r => r.className.includes('flex-wrap'));
    expect(hasWrappedRow).toBe(true);
    const pill = Array.from(container.querySelectorAll('div')).find(d => (d.getAttribute('aria-label') || '').includes('Coins available:')) as HTMLDivElement | undefined;
    expect(!!pill).toBe(true);
    expect(pill!.className).toContain('rounded-full');
    expect(pill!.className).toContain('shrink-0');
  });

  it('does not show overflow indicator initially', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    root.render(<AnalyzeScreen strategyId="mock-id" onNavigate={() => {}} accessToken="tkn" isProUser={true} remainingGenerations={4} onGenerationCount={() => {}} tier="pro" hasActivePlan={true} />);
    let heading: HTMLHeadingElement | undefined;
    for (let i = 0; i < 30; i++) { await wait(50); heading = Array.from(container.querySelectorAll('h3')).find(h => h.textContent === 'Pro Analysis Active') as HTMLHeadingElement | undefined; if (heading) break; }
    const pro = heading?.closest('div');
    expect(pro?.className.includes('ring-2')).toBe(false);
  });
});
