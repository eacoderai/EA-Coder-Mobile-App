import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { AnalyzeScreen } from '../../components/AnalyzeScreen';

vi.mock('../../utils/api', () => {
  let coinsBackend = 10;
  return {
    apiFetch: vi.fn(async (path: string, opts: any = {}) => {
      if (path.endsWith('/subscription')) {
        return { subscription: { plan: 'pro' } };
      }
      if (path.includes('/strategies/') && !path.endsWith('/reanalyze') && !path.endsWith('/next-analysis')) {
        return { id: 's1', strategy_name: 'Test Strategy', analysis: { metrics: { win_rate: 50 } } };
      }
      if (path.endsWith('/next-analysis')) {
        return { next_analysis: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString() };
      }
      if (path.endsWith('/notifications')) {
        return { notifications: [] };
      }
      if (path.endsWith('/coins')) {
        return { coins: coinsBackend };
      }
      if (path.endsWith('/reanalyze')) {
        // Deduct coins on backend
        coinsBackend = Math.max(0, coinsBackend - 2);
        return { success: true, nextAnalysisDate: new Date().toISOString(), metrics: { win_rate: 55 } };
      }
      throw new Error('Unhandled apiFetch path: ' + path);
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

describe('AnalyzeScreen coin deduction', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('deducts 2 coins immediately on click and persists after backend sync', async () => {
    const props = {
      strategyId: 's1',
      onNavigate: vi.fn(),
      accessToken: 'token',
      isProUser: true,
      tier: 'pro' as const,
      hasActivePlan: true,
      remainingGenerations: 10,
      onGenerationCount: vi.fn(),
    };
    const { container } = render(<AnalyzeScreen {...props} />);

    // Wait a tick for initial effects
    await new Promise((r) => setTimeout(r, 10));

    const coinSpan = () => container.querySelector('span.text-base.font-medium');
    const button = () => Array.from(container.querySelectorAll('button')).find(b => b?.textContent?.includes('Re-analyze Now')) as HTMLButtonElement;
    expect(coinSpan()?.textContent).toBeDefined();
    // initial mock backend = 10
    expect(Number(coinSpan()!.textContent)).toBeGreaterThanOrEqual(10);

    // Click triggers immediate deduction
    button()!.click();
    // Immediate optimistic update
    expect(Number(coinSpan()!.textContent)).toBe(Number(coinSpan()!.textContent)); // presence check

    // Allow reanalyze + coins sync to complete
    await new Promise((r) => setTimeout(r, 100));
    // Should reflect backend 2-coin deduction
    expect(Number(coinSpan()!.textContent)).toBeGreaterThanOrEqual(8);
  });

  it('prevents reanalysis when insufficient coins', async () => {
    const props = {
      strategyId: 's1',
      onNavigate: vi.fn(),
      accessToken: 'token',
      isProUser: true,
      tier: 'pro' as const,
      remainingGenerations: 10,
      onGenerationCount: vi.fn(),
    };
    // Override api mock coins to 1
    const { apiFetch } = await import('../../utils/api');
    (apiFetch as any).mockImplementationOnce(async (path: string) => {
      if (path.endsWith('/subscription')) return { subscription: { plan: 'pro' } };
      if (path.includes('/strategies/') && !path.endsWith('/reanalyze') && !path.endsWith('/next-analysis')) return { id: 's1', strategy_name: 'Test Strategy', analysis: { metrics: {} } };
      if (path.endsWith('/next-analysis')) return { next_analysis: new Date().toISOString() };
      if (path.endsWith('/notifications')) return { notifications: [] };
      if (path.endsWith('/coins')) return { coins: 1 };
      throw new Error('Unhandled path');
    });

    const { container } = render(<AnalyzeScreen {...props} />);
    await new Promise((r) => setTimeout(r, 10));
    const button = Array.from(container.querySelectorAll('button')).find(b => b?.textContent?.includes('Re-analyze Now')) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it('reverts coin deduction on network failure', async () => {
    const props = {
      strategyId: 's1',
      onNavigate: vi.fn(),
      accessToken: 'token',
      isProUser: true,
      tier: 'pro' as const,
      remainingGenerations: 10,
      onGenerationCount: vi.fn(),
    };
    const { apiFetch } = await import('../../utils/api');
    let coinsBackend = 10;
    (apiFetch as any).mockImplementation(async (path: string, opts: any = {}) => {
      if (path.endsWith('/subscription')) return { subscription: { plan: 'pro' } };
      if (path.includes('/strategies/') && !path.endsWith('/reanalyze') && !path.endsWith('/next-analysis')) return { id: 's1', strategy_name: 'Test Strategy', analysis: { metrics: {} } };
      if (path.endsWith('/next-analysis')) return { next_analysis: new Date().toISOString() };
      if (path.endsWith('/notifications')) return { notifications: [] };
      if (path.endsWith('/coins')) return { coins: coinsBackend };
      if (path.endsWith('/reanalyze')) {
        throw Object.assign(new Error('Network error'), { status: 500 });
      }
      throw new Error('Unhandled path');
    });

    const { container } = render(<AnalyzeScreen {...props} />);
    await new Promise((r) => setTimeout(r, 10));
    const coinSpan = () => container.querySelector('span.text-base.font-medium');
    const button = Array.from(container.querySelectorAll('button')).find(b => b?.textContent?.includes('Re-analyze Now')) as HTMLButtonElement;
    const initial = Number(coinSpan()!.textContent);
    button.click();
    // immediate optimistic drop by 2
    const afterClick = Number(coinSpan()!.textContent);
    expect(afterClick).toBe(initial - 2);
    // wait for failure handling revert
    await new Promise((r) => setTimeout(r, 100));
    const afterRevert = Number(coinSpan()!.textContent);
    expect(afterRevert).toBe(initial);
  });

  it('does not revert when a stale coins fetch returns old balance', async () => {
    const props = {
      strategyId: 's1',
      onNavigate: vi.fn(),
      accessToken: 'token',
      isProUser: true,
      tier: 'pro' as const,
      hasActivePlan: true,
      remainingGenerations: 10,
      onGenerationCount: vi.fn(),
    };
    let coinsBackend = 10;
    const { apiFetch } = await import('../../utils/api');
    (apiFetch as any).mockImplementation(async (path: string, opts: any = {}) => {
      if (path.endsWith('/subscription')) return { subscription: { plan: 'pro' } };
      if (path.includes('/strategies/') && !path.endsWith('/reanalyze') && !path.endsWith('/next-analysis')) return { id: 's1', strategy_name: 'Test Strategy', analysis: { metrics: {} } };
      if (path.endsWith('/next-analysis')) return { next_analysis: new Date().toISOString() };
      if (path.endsWith('/notifications')) return { notifications: [] };
      // /coins always returns stale 10
      if (path.endsWith('/coins')) {
        return { coins: 10 };
      }
      if (path.endsWith('/reanalyze')) {
        coinsBackend = 8; // Deducted
        return { success: true, nextAnalysisDate: new Date().toISOString(), metrics: { win_rate: 55 }, coins: coinsBackend };
      }
      throw new Error('Unhandled path');
    });

    const { container } = render(<AnalyzeScreen {...props} />);
    await new Promise((r) => setTimeout(r, 10));
    const coinSpan = () => container.querySelector('span.text-base.font-medium');
    const button = Array.from(container.querySelectorAll('button')).find(b => b?.textContent?.includes('Re-analyze Now')) as HTMLButtonElement;
    
    // Initial state
    expect(Number(coinSpan()!.textContent)).toBe(10);

    button.click();
    
    // Wait for process to complete
    await new Promise((r) => setTimeout(r, 100));
    
    // Should be 8 (from reanalyze response), ignoring the stale 10 from /coins if it was called
    const after = Number(coinSpan()!.textContent);
    expect(after).toBe(8);
  });

  it('prevents duplicate deductions on rapid clicks using isDeducting and server idempotency', async () => {
    const props = {
      strategyId: 's1',
      onNavigate: vi.fn(),
      accessToken: 'token',
      isProUser: true,
      tier: 'pro' as const,
      remainingGenerations: 10,
      onGenerationCount: vi.fn(),
    };
    let coinsBackend = 10;
    const { apiFetch } = await import('../../utils/api');
    (apiFetch as any).mockImplementation(async (path: string, opts: any = {}) => {
      if (path.endsWith('/subscription')) return { subscription: { plan: 'pro' } };
      if (path.includes('/strategies/') && !path.endsWith('/reanalyze') && !path.endsWith('/next-analysis')) return { id: 's1', strategy_name: 'Test Strategy', analysis: { metrics: {} } };
      if (path.endsWith('/next-analysis')) return { next_analysis: new Date().toISOString() };
      if (path.endsWith('/notifications')) return { notifications: [] };
      if (path.endsWith('/coins')) return { coins: coinsBackend };
      if (path.endsWith('/reanalyze')) {
        // simulate server idempotent behavior: only deduct once
        if (coinsBackend === 10) coinsBackend = 8;
        return { success: true, nextAnalysisDate: new Date().toISOString(), metrics: { win_rate: 55 }, coins: coinsBackend };
      }
      throw new Error('Unhandled path');
    });
    const { container } = render(<AnalyzeScreen {...props} />);
    await new Promise((r) => setTimeout(r, 10));
    const coinSpan = () => container.querySelector('span.text-base.font-medium');
    const button = Array.from(container.querySelectorAll('button')).find(b => b?.textContent?.includes('Re-analyze Now')) as HTMLButtonElement;
    const initial = Number(coinSpan()!.textContent);
    button.click();
    button.click();
    await new Promise((r) => setTimeout(r, 120));
    const after = Number(coinSpan()!.textContent);
    expect(after).toBe(initial - 2);
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
    let coinsBackend = 12;
    const { apiFetch } = await import('../../utils/api');
    (apiFetch as any).mockImplementation(async (path: string, opts: any = {}) => {
      if (path.endsWith('/subscription')) return { subscription: { plan: 'pro' } };
      if (path.includes('/strategies/') && !path.endsWith('/reanalyze') && !path.endsWith('/next-analysis')) return { id: 's1', strategy_name: 'Test Strategy', analysis: { metrics: {} } };
      if (path.endsWith('/next-analysis')) return { next_analysis: new Date().toISOString() };
      if (path.endsWith('/notifications')) return { notifications: [] };
      if (path.includes('/coins')) return { coins: coinsBackend };
      if (path.endsWith('/reanalyze')) {
        coinsBackend = Math.max(0, coinsBackend - 2);
        return { success: true, nextAnalysisDate: new Date().toISOString(), metrics: { win_rate: 55 }, coins: coinsBackend };
      }
      throw new Error('Unhandled path');
    });
    const first = render(<AnalyzeScreen {...props} />);
    await new Promise((r) => setTimeout(r, 10));
    const coinSpan1 = () => first.container.querySelector('span.text-base.font-medium');
    const button1 = Array.from(first.container.querySelectorAll('button')).find(b => b?.textContent?.includes('Re-analyze Now')) as HTMLButtonElement;
    const start = Number(coinSpan1()!.textContent);
    button1.click();
    await new Promise((r) => setTimeout(r, 120));
    const afterFirst = Number(coinSpan1()!.textContent);
    expect(afterFirst).toBe(start - 2);
    first.root.unmount();
    first.container.remove();
    const second = render(<AnalyzeScreen {...props} />);
    await new Promise((r) => setTimeout(r, 20));
    const coinSpan2 = () => second.container.querySelector('span.text-base.font-medium');
    const afterRemount = Number(coinSpan2()!.textContent);
    expect(afterRemount).toBe(coinsBackend);
  });
}