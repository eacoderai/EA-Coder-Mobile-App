import { describe, it, expect } from 'vitest';
import { buildAnalyzeMessages, buildMetricsMessages, deriveStrategyType } from '../utils/promptTemplates';

const STOP = new Set([
  'analyze','return','json','array','strings','name','platform','instrument','timeframe','type','description','risk','code','constraints','output','provide','specific','actionable','unique','reference','avoid','duplicates','chars','version','produce','keys','types'
]);
function tokens(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9_\- ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => !STOP.has(t));
}

function jaccard(a: string, b: string) {
  const A = new Set(tokens(a));
  const B = new Set(tokens(b));
  const inter = new Set([...A].filter(x => B.has(x))).size;
  const union = new Set([...A, ...B]).size;
  return union === 0 ? 0 : inter / union;
}

function getUserContent(messages: any[]) {
  const m = messages.find((x) => x.role === 'user');
  return m?.content || '';
}

const samples = [
  { strategy_name: 'MA Trend', description: 'Trend-following with EMA crossover and momentum confirmation', instrument: 'EURUSD', timeframe: 'H1', platform: 'mql5' },
  { strategy_name: 'RSI Reversion', description: 'Mean reversion using RSI and Bollinger Bands on oversold/overbought', instrument: 'BTCUSD', timeframe: 'M15', platform: 'pinescript' },
  { strategy_name: 'Session Breakout', description: 'Breakout from Asian session consolidation with volatility expansion', instrument: 'GBPUSD', timeframe: 'M30', platform: 'mql4' },
  { strategy_name: 'Micro Scalper', description: 'Scalping with tight spreads and slippage caps using ATR stops', instrument: 'USDJPY', timeframe: 'M5', platform: 'mql4' },
  { strategy_name: 'Grid Risk', description: 'Grid entries with martingale sizing; hard caps to control risk', instrument: 'USDCAD', timeframe: 'H4', platform: 'mql5' },
  { strategy_name: 'News Filter', description: 'Event-driven trading skipping high-impact economic news windows', instrument: 'EURUSD', timeframe: 'H1', platform: 'pinescript' },
];

describe('Prompt differentiation', () => {
  it('derives distinct strategy types', () => {
    const types = samples.map((s) => deriveStrategyType(s as any));
    const set = new Set(types);
    expect(set.size).toBeGreaterThanOrEqual(5);
  });

  it('analyze prompts differ across types below threshold', () => {
    const msgs = samples.map((s) => buildAnalyzeMessages(s as any));
    const contents = msgs.map(getUserContent);
    const pairs = [
      [0,1],[0,2],[0,3],[0,4],[0,5],
      [1,2],[1,3],[1,4],[1,5],
      [2,3],[2,4],[2,5]
    ];
    for (const [i,j] of pairs) {
      const sim = jaccard(contents[i], contents[j]);
      expect(sim).toBeLessThan(0.65);
    }
  });

  it('metrics prompts include instrument and timeframe', () => {
    const s = samples[0] as any;
    const msgs = buildMetricsMessages(s);
    const user = getUserContent(msgs);
    expect(user.includes(s.instrument)).toBe(true);
    expect(user.toLowerCase().includes(s.timeframe.toLowerCase())).toBe(true);
  });
});
