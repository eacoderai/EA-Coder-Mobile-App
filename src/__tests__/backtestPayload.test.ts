import { describe, it, expect } from 'vitest';
import { buildBacktestPayload, MAJOR_PAIRS, THREE_YEARS_MS } from '../utils/backtestPayload';

describe('backtest payload builder', () => {
  it('builds multi-currency payload when no instrument is selected', () => {
    const end = new Date('2025-01-01T00:00:00.000Z');
    const start = new Date('2022-01-01T00:00:00.000Z');
    const payload = buildBacktestPayload('RSI(14) rules', undefined, start, end);
    expect(payload).toHaveProperty('backtest');
    expect(payload.backtest.pairs).toEqual(MAJOR_PAIRS);
    expect(payload.backtest.start).toEqual(start.toISOString());
    expect(payload.backtest.end).toEqual(end.toISOString());
    expect(payload.backtest.metrics).toEqual([
      'sharpe', 'max_drawdown', 'win_rate', 'equity_curve', 'trade_log'
    ]);
    expect(payload.backtest.rules_hint).toContain('RSI');
  });

  it('builds single-currency payload when instrument is selected', () => {
    const end = new Date('2025-01-01T00:00:00.000Z');
    const start = new Date('2022-01-01T00:00:00.000Z');
    const payload = buildBacktestPayload('EMA cross', 'USDJPY', start, end);
    expect(payload.backtest.pairs).toEqual(['USDJPY']);
  });

  it('supports 3-year default period via shared constant', () => {
    const end = new Date();
    const start = new Date(end.getTime() - THREE_YEARS_MS);
    const payload = buildBacktestPayload('Any', undefined, start, end);
    const diffMs = new Date(payload.backtest.end).getTime() - new Date(payload.backtest.start).getTime();
    // Allow small rounding differences
    expect(Math.abs(diffMs - THREE_YEARS_MS)).toBeLessThan(24 * 60 * 60 * 1000);
  });
});