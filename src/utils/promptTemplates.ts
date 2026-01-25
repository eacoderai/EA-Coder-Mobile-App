import { MULTI_CURRENCY_LABEL, MAJOR_PAIRS } from './backtestPayload.ts';

export type Strategy = {
  strategy_name?: string;
  description?: string;
  risk_management?: string;
  instrument?: string;
  analysis_instrument?: string;
  platform?: string;
  timeframe?: string;
  generated_code?: string;
  indicators?: string[];
  indicator_mode?: 'single' | 'multiple';
};

export type StrategyType =
  | 'trend_following'
  | 'mean_reversion'
  | 'breakout'
  | 'scalping'
  | 'grid_martingale'
  | 'news_event'
  | 'other';

export const PROMPT_VERSION = 'v2.0-strategy-diff';

function text(s?: string) {
  return (s || '').toLowerCase();
}

export function deriveStrategyType(s: Strategy): StrategyType {
  const d = text(s.description);
  const code = text(s.generated_code);
  const tf = text(s.timeframe);
  if (d.includes('scalp') || tf.includes('m1') || tf.includes('m5')) return 'scalping';
  if (d.includes('breakout') || d.includes('consolidation') || d.includes('range expansion')) return 'breakout';
  if (d.includes('trend') || d.includes('momentum') || d.includes('ma crossover') || code.includes('ma') || code.includes('ema') || code.includes('macd')) return 'trend_following';
  if (d.includes('mean reversion') || d.includes('reversion') || d.includes('bollinger') || d.includes('z-score') || code.includes('rsi') || code.includes('bollinger')) return 'mean_reversion';
  if (d.includes('grid') || d.includes('martingale') || code.includes('lot_multiplier')) return 'grid_martingale';
  if (d.includes('news') || d.includes('economic') || d.includes('event-driven')) return 'news_event';
  return 'other';
}

function instrumentLabel(s: Strategy) {
  const label = s.analysis_instrument || s.instrument || '';
  if (label === MULTI_CURRENCY_LABEL) return MAJOR_PAIRS.join(', ');
  return label || 'Not specified';
}

export function buildAnalyzeMessages(s: Strategy) {
  const type = deriveStrategyType(s);
  const instrument = instrumentLabel(s);
  const timeframe = s.timeframe || 'H1';
  const platform = s.platform || 'mql4';
  const indicators = Array.isArray(s.indicators) ? s.indicators.filter(Boolean) : [];
  const indicatorMode = s.indicator_mode || 'multiple';
  const system = `Version ${PROMPT_VERSION}. Provide instrument- and timeframe-specific improvements. Avoid generic phrasing. Enforce differentiation by referencing ${instrument} and ${timeframe} with ${platform} details.${indicators.length ? ` Include guidance tailored to selected indicators (${indicatorMode}): ${indicators.join(', ')}.` : ''}`;
  const typeFocus: Record<StrategyType, string> = {
    trend_following: 'Emphasize regime detection, HTF confirmation, moving average structures, momentum filters.',
    mean_reversion: 'Emphasize volatility bands, oversold/overbought logic, revert thresholds, session gating.',
    breakout: 'Emphasize consolidation detection, range breakout criteria, session timing, volatility expansion.',
    scalping: 'Emphasize spread/slippage caps, fast execution, micro-session filters, ATR-scaled stops.',
    grid_martingale: 'Emphasize risk caps, max steps, equity drawdown guards, lot sizing ceilings.',
    news_event: 'Emphasize event calendars, embargo windows, volatility spikes, gap handling.',
    other: 'Emphasize instrument/timeframe tailoring, platform-specific implementation details.'
  };
  const user = (
    `Analyze and return 4–6 unique, actionable improvements.\n` +
    `Name: ${s.strategy_name || 'Untitled'}\n` +
    `Platform: ${platform}\n` +
    `Instrument: ${instrument}\n` +
    `Timeframe: ${timeframe}\n` +
    `Type: ${type}\n` +
    `Description: ${s.description || 'Not provided'}\n` +
    `Risk: ${s.risk_management || 'Not specified'}\n` +
    `Code:\n` +
    `${(s.generated_code || '').substring(0, 2500) || 'Code not available'}\n\n` +
    `Differentiation:\n` +
    `${typeFocus[type]}\n` +
    `${indicators.length ? `Indicator-aware tuning: ${indicators.join(', ')} — recommend parameter ranges, filters, confirmations, and risk controls.\n` : ''}` +
    `Each suggestion must reference ${instrument} or ${timeframe} and ${platform} functions or APIs when relevant.\n` +
    `Avoid repeated phrasing. Keep each ≤ 140 chars. No duplicates.\n\n` +
    `Output:\n` +
    `Return ONLY a JSON array of strings.`
  );
  return [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ];
}

export function buildStrategyAnalysisPrompt(s: Strategy) {
  const name = s?.strategy_name || 'Untitled Strategy';
  const desc = s?.description || '';
  const risk = s?.risk_management || '';
  const selected = s?.analysis_instrument || s?.instrument;
  const instrument = selected === MULTI_CURRENCY_LABEL
    ? MAJOR_PAIRS.join(', ')
    : (selected || 'EURUSD');
  const platform = s?.platform || 'mql4';
  const period = (s as any)?.backtest_period || '3 Years';
  const timeframe = s?.timeframe || 'H1';
  const codePresent = !!(s?.generated_code || (s as any)?.code);
  return (
    `You are an expert quant and trading strategy analyst. ` +
    `Analyze the following strategy and produce realistic but conservative backtest metrics and AI recommendations. ` +
    `Context:\n` +
    `- Name: ${name}\n` +
    `- Description: ${desc}\n` +
    `- Risk Management: ${risk}\n` +
    `- Instrument: ${instrument}\n` +
    `- Platform: ${platform}\n` +
    `- Timeframe: ${timeframe}\n` +
    `- Backtest Period: ${period}\n` +
    `- Code Available: ${codePresent ? 'yes' : 'no'}\n\n` +
    `Output strictly in JSON with exactly these keys and types. Do not include any extra keys, commentary, or nulls.\n` +
    `- win_rate: number (0-100, percent)\n` +
    `- total_trades: integer\n` +
    `- winning_trades: integer\n` +
    `- losing_trades: integer\n` +
    `- average_win: string (e.g., '1.2%' or '85 pips')\n` +
    `- average_loss: string (e.g., '0.8%' or '40 pips')\n` +
    `- largest_win: string (same unit as average_win)\n` +
    `- largest_loss: string (same unit as average_loss)\n` +
    `- profit_loss_ratio: number (e.g., 1.5)\n` +
    `- profit_factor: number (e.g., 1.8)\n` +
    `- max_drawdown: number (0-100, percent)\n` +
    `- expected_return: number (0-100, annualized percent)\n` +
    `- avg_trade_duration: string (e.g., '2h 30m')\n` +
    `- volatility: number (0-100, percent)\n` +
    `- trade_frequency: string (e.g., '3 trades/week')\n` +
    `- avg_holding_time: string (e.g., '1d 4h')\n` +
    `- sharpe_ratio: number\n` +
    `- sortino_ratio: number\n` +
    `- recovery_factor: number\n` +
    `- consecutive_losses: integer\n` +
    `- bull_market_performance: string (short summary)\n` +
    `- bull_market_score: number (0-100)\n` +
    `- bear_market_performance: string (short summary)\n` +
    `- bear_market_score: number (0-100)\n` +
    `- volatile_market_performance: string (short summary)\n` +
    `- volatile_market_score: number (0-100)\n` +
    `- improvements: string[] (3-8 concise recommendations)\n\n` +
    `Ensure numbers are plain JSON numbers (no '%' signs), except fields ` +
    `explicitly defined as strings. Keep units consistent between average/large win/loss.`
  );
}

export function buildCodeMessages(platform: string, s: Strategy) {
  const type = deriveStrategyType(s);
  const instrument = instrumentLabel(s);
  const timeframe = s.timeframe || 'H1';
  const name = s.strategy_name || 'Untitled Strategy';
  const system = `Version ${PROMPT_VERSION}. Generate production-ready ${platform} code tailored to ${instrument} on ${timeframe}. Avoid generic templates.`;
  const indicators = Array.isArray(s.indicators) ? s.indicators.filter(Boolean) : [];
  const indicatorMode = s.indicator_mode || 'multiple';
  const indicatorSpecs: Record<string, { params: string; scenarios: string; metrics: string; visuals: string }> = {
    'RSI': { params: 'period:int=14, oversold:int=30, overbought:int=70', scenarios: 'oversold<30, overbought>70, divergence, bull/bear regimes', metrics: 'signal hit-rate, avg return after cross, time-in-zone, zone drawdown', visuals: 'RSI line, 30/70 bands, cross markers' },
    'MACD': { params: 'fast:int=12, slow:int=26, signal:int=9', scenarios: 'line cross, zero-line cross, histogram momentum', metrics: 'cross success rate, histogram trend strength, post-cross PnL', visuals: 'MACD/Signal lines, histogram bars' },
    'Bollinger Bands': { params: 'length:int=20, stdev:float=2.0', scenarios: 'band touch, squeeze, expansion', metrics: 'touch reversion rate, squeeze breakout performance', visuals: 'upper/lower bands, basis line' },
    'SMA': { params: 'length:int=50', scenarios: 'price cross, multi-SMA alignment', metrics: 'cross win-rate, alignment persistence', visuals: 'SMA line overlay' },
    'EMA': { params: 'length:int=21', scenarios: 'price cross, EMA slope, multi-EMA crossover', metrics: 'slope-conditioned returns, crossover effectiveness', visuals: 'EMA line overlay' },
    'Stochastic': { params: 'k:int=14, d:int=3, smooth:int=3, overbought:int=80, oversold:int=20', scenarios: 'K/D cross, zone entries, divergence', metrics: 'zone exit success rate, K/D cross returns', visuals: '%K/%D lines, 20/80 zones' },
    'ATR': { params: 'length:int=14', scenarios: 'volatility regimes (low/high), stop scaling', metrics: 'ATR-scaled stops drawdown, regime-conditioned win-rate', visuals: 'ATR line' },
    'Ichimoku Cloud': { params: 'tenkan:int=9, kijun:int=26, senkou:int=52', scenarios: 'cloud breaks, lagging span confirmation', metrics: 'cloud break performance, lagging span filter impact', visuals: 'cloud fill, tenkan/kijun lines' },
    'VWAP': { params: 'session:string=auto', scenarios: 'reversion to VWAP, deviation bands', metrics: 'reversion success rate, distance-from-VWAP returns', visuals: 'VWAP line with bands' },
    'Parabolic SAR': { params: 'step:float=0.02, max:float=0.2', scenarios: 'trend continuation switches, choppy false signals', metrics: 'switch success rate, chop false signal rate', visuals: 'SAR dots overlay' },
    'ADX': { params: 'length:int=14, threshold:int=25', scenarios: 'trend strength regimes, filter for entries', metrics: 'returns conditioned on ADX>threshold', visuals: 'ADX line' },
    'CCI': { params: 'length:int=20, thresholds:int=±100', scenarios: 'threshold crosses, divergence', metrics: 'cross-conditioned returns, time-above/below thresholds', visuals: 'CCI line with ±100 bands' },
  };
  const normalizedIndicators = indicators.map((x) => String(x).trim()).filter((x) => !!x);
  const indicatorBlocks = normalizedIndicators.map((name) => {
    const spec = indicatorSpecs[name] || { params: 'custom:string', scenarios: 'author-defined', metrics: 'author-defined', visuals: 'author-defined' };
    return `- ${name}: params(${spec.params}); scenarios(${spec.scenarios}); metrics(${spec.metrics}); visuals(${spec.visuals})`;
  }).join('\n');
  const focus: Record<StrategyType, string> = {
    trend_following: 'Use momentum and MA structures, regime detection, HTF confirmation.',
    mean_reversion: 'Use volatility bands, thresholds, session filters, reversion logic.',
    breakout: 'Use consolidation detection, range breakout rules, session timing.',
    scalping: 'Use spread/slippage caps, fast execution, ATR-scaled risk controls.',
    grid_martingale: 'Apply strict caps, lot ceilings, equity guards, step limits.',
    news_event: 'Honor embargo windows, event calendars, volatility spike handling.',
    other: 'Tailor entries/exits and risk controls to instrument/timeframe.'
  };
  const user = (
    `Name: ${name}\n` +
    `Instrument: ${instrument}\n` +
    `Timeframe: ${timeframe}\n` +
    `Type: ${type}\n` +
    `Description:\n` +
    `${s.description || ''}\n\n` +
    `Risk:\n` +
    `${s.risk_management || ''}\n\n` +
    (normalizedIndicators.length ? (
      `Indicators (${indicatorMode}):\n` +
      `${indicatorBlocks}\n\n` +
      `Backtesting Matrix (MANDATORY):\n` +
      `- Cover indicator scenarios above across bull/bear/volatile regimes\n` +
      `- Report tailored metrics per indicator (hit-rate, post-signal returns, drawdown, time-in-zone, momentum)\n` +
      `- Use conservative assumptions\n\n` +
      `Documentation (MANDATORY):\n` +
      `- Add a brief doc header explaining each selected indicator’s role and parameter effects on entries/exits, risk, and visuals\n\n`
    ) : '') +
    `Requirements:\n` +
    `${focus[type]}\n` +
    `Expose inputs for key parameters. Include robust risk handling. Follow platform best practices.\n` +
    (normalizedIndicators.length ? `Initialize indicators properly, handle parameters safely, render visuals, and compute relevant stats.\n` : '') +
    `Attribution (MANDATORY, language-appropriate):\n` +
    `1) Top-of-file header comment: // Copyright © EA Coder AI - All Rights Reserved (use correct comment style e.g., // or #).\n` +
    `2) Define module-level properties with exact names and values:\n` +
    `   - copyright = "EA Coder AI"\n` +
    `   - link = "eacoderai.com"\n` +
    `   Use idiomatic declarations per language (e.g., MQL string globals; Pine 'var'; JS/TS exported const; Python top-level vars; Java static final fields inside the main class).\n` +
    `Place them at a logical top-level location so code compiles.\n` +
    `Return ONLY the full code.`
  );
  return [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ];
}

export function buildMetricsMessages(s: Strategy) {
  const type = deriveStrategyType(s);
  const instrument = instrumentLabel(s);
  const timeframe = s.timeframe || 'H1';
  const platform = s.platform || 'mql4';
  const period = (s as any).backtest_period || '3 Years';
  const codePresent = !!s.generated_code;
  const indicators = Array.isArray(s.indicators) ? s.indicators.filter(Boolean) : [];
  const metricFocus: Record<StrategyType, string> = {
    trend_following: 'Include regime-change sensitivity and momentum persistence notes.',
    mean_reversion: 'Include band touch frequency and reversion horizon metrics.',
    breakout: 'Include consolidation length and post-breakout volatility expansion metrics.',
    scalping: 'Include spread/slippage assumptions and micro-duration trade metrics.',
    grid_martingale: 'Include max steps, equity drawdown guards, lot ceilings constraints.',
    news_event: 'Include embargo window impact and spike-volatility handling metrics.',
    other: 'Include instrument/timeframe-tailored risk and performance notes.'
  };
  const system = `Version ${PROMPT_VERSION}. Produce conservative, instrument-aware metrics. Include ${instrument}, ${timeframe}, ${platform}. Focus: ${metricFocus[type]}${indicators.length ? `; Include indicator-tailored views for: ${indicators.join(', ')}` : ''}`;
  const user = (
    `Name: ${s.strategy_name || 'Untitled'}
` +
    `Description: ${s.description || ''}
` +
    `Risk: ${s.risk_management || ''}
` +
    `Instrument: ${instrument}
` +
    `Platform: ${platform}
` +
    `Timeframe: ${timeframe}
` +
    `Backtest Period: ${period}
` +
    `Type: ${type}
` +
    `Code Available: ${codePresent ? 'yes' : 'no'}

` +
    `${indicators.length ? `Backtesting matrix: consider bull/bear/volatile regimes and indicator-specific states (e.g., RSI zones, MACD crosses). Report conservative values.\n` : ''}` +
    `Output strictly JSON with keys and types:
` +
    `win_rate:number,total_trades:integer,winning_trades:integer,losing_trades:integer,average_win:string,average_loss:string,largest_win:string,largest_loss:string,profit_loss_ratio:number,profit_factor:number,max_drawdown:number,expected_return:number,avg_trade_duration:string,volatility:number,trade_frequency:string,avg_holding_time:string,sharpe_ratio:number,sortino_ratio:number,recovery_factor:number,consecutive_losses:integer,bull_market_performance:string,bull_market_score:number,bear_market_performance:string,bear_market_score:number,volatile_market_performance:string,volatile_market_score:number`
  );
  return [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ];
}
