import { describe, it, expect } from 'vitest';
import { buildCodeMessages, buildAnalyzeMessages, buildMetricsMessages } from '../utils/promptTemplates';

describe('Indicator-aware prompts', () => {
  it('includes indicators in code generation prompt', () => {
    const s = {
      strategy_name: 'Test',
      description: 'Uses RSI and MACD logic',
      instrument: 'EURUSD',
      timeframe: 'H1',
      platform: 'mql4',
      indicators: ['RSI', 'MACD'],
      indicator_mode: 'multiple',
    } as any;
    const msgs = buildCodeMessages('mql4', s);
    expect(Array.isArray(msgs)).toBe(true);
    const user = msgs.find(m => m.role === 'user')!.content;
    const system = msgs.find(m => m.role === 'system')!.content;
    expect(user).toContain('Indicators (multiple)');
    expect(user).toContain('RSI');
    expect(user).toContain('MACD');
    expect(user).toContain('Backtesting Matrix (MANDATORY)');
    expect(user).toContain('Documentation (MANDATORY)');
    expect(user).toContain('Initialize indicators properly');
    expect(system).toContain('Generate production-ready mql4 code');
  });

  it('includes indicators in analyze and metrics prompts', () => {
    const s = {
      strategy_name: 'Test',
      description: 'Mean reversion with RSI',
      instrument: 'GBPUSD',
      timeframe: 'M15',
      platform: 'pinescript',
      indicators: ['RSI'],
      indicator_mode: 'single',
    } as any;
    const analyze = buildAnalyzeMessages(s);
    const metrics = buildMetricsMessages(s);
    const analyzeSystem = analyze.find(m => m.role === 'system')!.content;
    const analyzeUser = analyze.find(m => m.role === 'user')!.content;
    expect(analyzeSystem).toMatch(/selected indicators \(single\): RSI/);
    expect(analyzeUser).toContain('Indicator-aware tuning');
    const metricsSystem = metrics.find(m => m.role === 'system')!.content;
    const metricsUser = metrics.find(m => m.role === 'user')!.content;
    expect(metricsSystem).toContain('Include indicator-tailored views for: RSI');
    expect(metricsUser).toContain('Backtesting matrix:');
  });
});

