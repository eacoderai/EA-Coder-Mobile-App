import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { waitFor } from '@testing-library/dom';
import { createRoot } from 'react-dom/client';
import { AnalyzeScreen } from '../components/AnalyzeScreen';

vi.mock('../utils/api', async () => {
  return {
    apiFetch: vi.fn(async (path: string, _opts: any) => {
      if (path.includes('/strategies/') && path.endsWith('/next-analysis')) {
        return { next_analysis: new Date(Date.now() + 86400000).toISOString() };
      }
      if (path.includes('/strategies/') && !path.endsWith('/next-analysis') && !path.endsWith('/reanalyze')) {
        return {
          strategy_name: 'Test Strategy',
          instrument: 'EURUSD',
          platform: 'mql4',
          description: 'Mock desc',
          analysis: {
            metrics: {
              win_rate: 55,
              total_trades: 100,
              profit_factor: 1.6,
              max_drawdown: 12,
              expected_return: 18,
            },
            improvements: [
              'Tighten stop loss by 10%',
              'Avoid low-liquidity hours',
              'Increase sample size',
            ],
          },
        };
      }
      if (path.endsWith('/notifications')) {
        return {
          notifications: [
            {
              type: 'analysis_update',
              strategyId: 'mock-id',
              improvements: ['Calibrate risk per trade', 'Use ATR-based stops'],
              timestamp: new Date().toISOString(),
            },
          ],
        };
      }
      if (path.endsWith('/subscription')) {
        return { subscription: { plan: 'pro' } };
      }
      if (path.endsWith('/usage')) {
        return { usage: { count: 1, remaining: 3, window: '7d' } };
      }
      if (path.endsWith('/reanalyze')) {
        return { nextAnalysisDate: new Date().toISOString() };
      }
      return {};
    }),
  };
});

describe('AnalyzeScreen integration', () => {
  let container: HTMLDivElement;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('renders metrics and recommendations from API', async () => {
    const root = createRoot(container);
    root.render(
      <AnalyzeScreen
        strategyId="mock-id"
        accessToken="token"
        isProUser={true}
        tier="pro"
        remainingGenerations={4}
        onNavigate={() => {}}
        onGenerationCount={() => {}}
      />
    );

    // Allow effects to run
    await waitFor(() => {
      expect(container.textContent).toContain('Performance Metrics');
      expect(container.textContent).toContain('Win Rate');
    });
    // From improvements
    expect(container.textContent).toMatch(/Calibrate risk per trade|Tighten stop loss/);
  });

it('shows loading indicator initially', async () => {
    const root = createRoot(container);
    root.render(
      <AnalyzeScreen
        strategyId="mock-id"
        accessToken="token"
        isProUser={true}
        tier="pro"
        remainingGenerations={4}
        onNavigate={() => {}}
        onGenerationCount={() => {}}
      />
    );
    await waitFor(() => {
      expect(container.textContent).toContain('Loading analysis...');
    });
  });
});