import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { AnalyzeScreen } from '../components/AnalyzeScreen';

vi.mock('../utils/api', () => {
  let coinsBackend = 12;
  return {
    apiFetch: vi.fn(async (path: string, opts: any = {}) => {
      if (path.endsWith('/subscription')) return { subscription: { plan: 'pro' } };
      if (path.includes('/strategies/') && !path.endsWith('/reanalyze') && !path.endsWith('/next-analysis')) return { id: 's1', strategy_name: 'Test Strategy', analysis: { metrics: {} } };
      if (path.endsWith('/next-analysis')) return { next_analysis: new Date().toISOString() };
      if (path.endsWith('/notifications')) return { notifications: [] };
      if (path.includes('/coins')) return { coins: coinsBackend };
      if (path.endsWith('/reanalyze')) {
        coinsBackend = Math.max(0, coinsBackend - 2);
        return { success: true, nextAnalysisDate: new Date().toISOString(), metrics: { win_rate: 55 }, coins: coinsBackend };
      }
      throw new Error('Unhandled path: ' + path);
    }),
  };
});

function render(ui: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  root.render(ui);
  return { container, root };
}

describe('AnalyzeScreen coins persistence', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('persists deducted coins after remount/refresh', async () => {
    const props = {
      strategyId: 's1',
      onNavigate: vi.fn(),
      accessToken: 'token',
      isProUser: true,
      tier: 'pro' as const,
      remainingGenerations: 10,
      onGenerationCount: vi.fn(),
    };
    const first = render(<AnalyzeScreen {...props} />);
    await new Promise((r) => setTimeout(r, 10));
    const coinSpan1 = () => first.container.querySelector('span.text-base.font-medium');
    const button1 = Array.from(first.container.querySelectorAll('button')).find(b => b?.textContent?.includes('Re-analyze Now')) as HTMLButtonElement;
    const start = Number(coinSpan1()!.textContent);
    button1.click();
    await new Promise((r) => setTimeout(r, 150));
    const afterFirst = Number(coinSpan1()!.textContent);
    expect(afterFirst).toBe(start - 2);
    first.root.unmount();
    first.container.remove();
    const second = render(<AnalyzeScreen {...props} />);
    await new Promise((r) => setTimeout(r, 20));
    const coinSpan2 = () => second.container.querySelector('span.text-base.font-medium');
    const afterRemount = Number(coinSpan2()!.textContent);
    expect(afterRemount).toBe(afterFirst);
  });
});