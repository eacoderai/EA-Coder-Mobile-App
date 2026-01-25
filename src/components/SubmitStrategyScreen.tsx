import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { ArrowLeft, HelpCircle, Loader2, Send, X, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { ScrollArea } from "./ui/scroll-area";
import { projectId, publicAnonKey } from '../utils/supabase/info';
import { toast } from "../utils/tieredToast";
import { getFunctionUrl } from '../utils/supabase/client';
import { Popover, PopoverTrigger, PopoverContent } from "./ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "./ui/command";
import { Badge } from "./ui/badge";
import { Switch } from "./ui/switch";
import { Tier, TIER_LIMITS } from "../types/user";

interface SubmitStrategyScreenProps {
  onNavigate: (screen: string, strategyId?: string) => void;
  accessToken: string | null;
  tier: Tier;
  remainingGenerations: number;
  onGenerationCount: (kind: 'code' | 'analysis') => void;
}

const STRATEGY_EXAMPLES = [
  {
    title: "RSI Oversold/Overbought",
    description: "Buy when RSI(14) < 30, sell when RSI(14) > 70. Use 50 pip stop loss and 100 pip take profit.",
    risk: "Max 2% risk per trade"
  },
  {
    title: "Moving Average Crossover",
    description: "Buy when EMA(9) crosses above EMA(21). Sell when EMA(9) crosses below EMA(21).",
    risk: "Stop loss at recent swing low/high, 1:2 risk-reward ratio"
  },
  {
    title: "Breakout Strategy",
    description: "Buy when price breaks above the previous day's high with volume confirmation. Exit at 3% profit or 1.5% loss.",
    risk: "Position size based on ATR"
  },
  {
    title: "MACD + Bollinger Bands",
    description: "Buy when MACD crosses above signal line AND price touches lower Bollinger Band. Sell at upper band.",
    risk: "Fixed 30 pip stop loss"
  }
];

const INSTRUMENTS = [
  MULTI_CURRENCY_LABEL,
  "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD",
  "XAUUSD (Gold)", "BTCUSD", "US30", "SPX500", "NGAS"
];

const PLATFORMS = [
  { value: "mql4", label: "MQL4 (MetaTrader 4)" },
  { value: "mql5", label: "MQL5 (MetaTrader 5)" },
  { value: "pinescript", label: "Pine Script v5 (TradingView)" }
];

import { addLocalNotification } from '../utils/notifications';
import { apiFetch } from '../utils/api';
import { buildBacktestPayload, MAJOR_PAIRS, THREE_YEARS_MS, MULTI_CURRENCY_LABEL } from '../utils/backtestPayload';
import type { StrategyCreateRequest, StrategyCreateResponse } from '../types/analysis';
export function SubmitStrategyScreen({ onNavigate, accessToken, tier, remainingGenerations, onGenerationCount }: SubmitStrategyScreenProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [generationAttempts, setGenerationAttempts] = useState(0);
  const chartRef = useRef<HTMLDivElement | null>(null);
  const [formData, setFormData] = useState({
    strategyName: "",
    description: "",
    riskManagement: "",
    instrument: MULTI_CURRENCY_LABEL,
    platform: ""
  });
  type IndicatorOption = { id: string; label: string; custom?: boolean };
  type IndicatorMode = 'single' | 'multiple';
  const TOP_INDICATORS: string[] = [
    "RSI",
    "MACD",
    "Bollinger Bands",
    "SMA",
    "EMA",
    "Stochastic",
    "ATR",
    "Ichimoku Cloud",
    "VWAP",
    "Parabolic SAR",
    "ADX",
    "CCI"
  ];
  const [indicatorMode, setIndicatorMode] = useState<IndicatorMode>('multiple');
  const [selectedIndicators, setSelectedIndicators] = useState<IndicatorOption[]>([]);
  const [indicatorOpen, setIndicatorOpen] = useState(false);
  const [customInputActive, setCustomInputActive] = useState(false);
  const [customText, setCustomText] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);
  const [usage, setUsage] = useState<{ count: number; remaining: number; window: string } | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [strategiesCount, setStrategiesCount] = useState<number | null>(null);
  const [examplesOpen, setExamplesOpen] = useState(false);
  const [showLimitBanner, setShowLimitBanner] = useState(false);

  // --- Backtesting helpers --- //
  // Use shared constant for default backtest window
  const endDate = useMemo(() => new Date(), []);
  const startDate = useMemo(() => new Date(Date.now() - THREE_YEARS_MS), []);


  function ema(values: number[], period: number): number[] {
    if (period <= 1 || period > values.length) return Array(values.length).fill(NaN);
    const k = 2 / (period + 1);
    const emaArr: number[] = [];
    let prev = values[0];
    emaArr.push(prev);
    for (let i = 1; i < values.length; i++) {
      const cur = values[i] * k + prev * (1 - k);
      emaArr.push(cur);
      prev = cur;
    }
    return emaArr;
  }

  function rsi(values: number[], period = 14): number[] {
    const rsis: number[] = Array(values.length).fill(NaN);
    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
      const diff = values[i] - values[i - 1];
      if (diff >= 0) gains += diff; else losses -= diff;
    }
    let avgGain = gains / period;
    let avgLoss = losses / period;
    rsis[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + (avgGain / avgLoss)));
    for (let i = period + 1; i < values.length; i++) {
      const diff = values[i] - values[i - 1];
      const gain = Math.max(diff, 0);
      const loss = Math.max(-diff, 0);
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
      const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
      rsis[i] = 100 - (100 / (1 + rs));
    }
    return rsis;
  }

  type PriceBar = { date: string; close: number };

  async function fetchHistorical(pair: string, startISO: string, endISO: string): Promise<PriceBar[]> {
    // Try server endpoint first (if present), then fallback
    try {
      const data = await apiFetch<any>('server/make-server-00a119be/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { pair, start: startISO, end: endISO },
        accessToken,
        retries: 0,
      });
      if (Array.isArray(data?.prices)) {
        return data.prices.map((p: any) => ({ date: String(p.date), close: Number(p.close) })).filter((p: any) => isFinite(p.close));
      }
    } catch (err) {
      // Non-blocking; proceed to fallback
      console.warn('[Backtest] Server history fetch failed, trying fallback', err);
    }
    // Fallback: simple synthetic series to maintain responsiveness in absence of server data
    const bars: PriceBar[] = [];
    const start = new Date(startISO);
    const end = new Date(endISO);
    const days = Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
    let price = 1.0 + Math.random() * 0.5; // synthetic base
    for (let i = 0; i < days; i++) {
      const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
      // random walk with mean reversion
      const drift = (Math.random() - 0.5) * 0.01;
      price = Math.max(0.2, price * (1 + drift));
      bars.push({ date: d.toISOString().slice(0, 10), close: Number(price.toFixed(4)) });
    }
    return bars;
  }

  function parseStrategyDescription(desc: string) {
    const lower = desc.toLowerCase();
    const isRSI = lower.includes('rsi');
    const rsiPeriodMatch = lower.match(/rsi\s*\(?\s*(\d{1,3})\s*\)?/);
    const rsiPeriod = rsiPeriodMatch ? Number(rsiPeriodMatch[1]) : 14;
    const oversold = lower.includes('below 30') || lower.includes('< 30');
    const overbought = lower.includes('above 70') || lower.includes('> 70');
    const isEMACross = lower.includes('ema') && lower.includes('cross');
    const emaFastMatch = lower.match(/ema\s*\(?\s*(\d{1,3})\s*\)?/);
    const emaFast = emaFastMatch ? Number(emaFastMatch[1]) : 9;
    const emaSlowMatch = lower.match(/ema\s*\(?\s*(\d{1,3})\s*\)?[^\d]*(\d{1,3})/);
    const emaSlow = emaSlowMatch ? Number(emaSlowMatch[2]) : 21;
    return { isRSI, rsiPeriod, oversold, overbought, isEMACross, emaFast, emaSlow };
  }

  function parseRiskFractionFromText(riskText: string | undefined): number {
    if (!riskText) return 0.1;
    const m = riskText.match(/(\d+(?:\.\d+)?)\s*%/);
    if (m) {
      const pct = Number(m[1]);
      if (isFinite(pct) && pct > 0 && pct <= 100) return pct / 100;
    }
    return 0.1;
  }

  function profitFactor(trades: Array<{ pnl: number }>): number {
    let gains = 0, losses = 0;
    for (const t of trades) {
      if (t.pnl >= 0) gains += t.pnl; else losses += Math.abs(t.pnl);
    }
    if (losses === 0) return Infinity;
    return gains / losses;
  }

  // Normal CDF approximation without Math.erf (Abramowitz-Stegun 7.1.26)
  function normalCDF(x: number): number {
    const sign = x < 0 ? -1 : 1;
    const absX = Math.abs(x) / Math.sqrt(2);
    const t = 1 / (1 + 0.3275911 * absX);
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429;
    const erfApprox = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);
    const erfVal = sign * erfApprox;
    return 0.5 * (1 + erfVal);
  }

  function tStatisticAndPValue(returns: number[]): { t: number; p: number } {
    const n = returns.length;
    if (n < 2) return { t: 0, p: 1 };
    const mean = returns.reduce((a, b) => a + b, 0) / n;
    const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (n - 1);
    const std = Math.sqrt(variance || 0);
    const t = std === 0 ? 0 : mean / (std / Math.sqrt(n));
    const absT = Math.abs(t);
    const p = 2 * (1 - normalCDF(absT));
    return { t: Number(t.toFixed(2)), p: Number(p.toFixed(4)) };
  }

  async function backtestPair(pair: string, bars: PriceBar[], desc: string, riskText?: string, opts?: { maxTrades?: number; costPct?: number }) {
    const prices = bars.map(b => b.close);
    const strategy = parseStrategyDescription(desc);
    const emaFastArr = strategy.isEMACross ? ema(prices, strategy.emaFast) : [];
    const emaSlowArr = strategy.isEMACross ? ema(prices, strategy.emaSlow) : [];
    const rsiArr = strategy.isRSI ? rsi(prices, strategy.rsiPeriod) : [];

    const trades: Array<{ pair: string; entryDate: string; exitDate: string; entryPrice: number; exitPrice: number; pnl: number; returnPct: number; }> = [];
    let equity = 10000;
    const equityCurve: { date: string; equity: number }[] = [];
    let position: { side: 'long' | 'flat'; entryPrice: number; entryIndex: number } = { side: 'flat', entryPrice: 0, entryIndex: 0 };
    const sizeFraction = parseRiskFractionFromText(riskText);
    const transactionCostPct = opts?.costPct ?? 0.05; // 0.05% combined spread+slippage default
    const maxTrades = opts?.maxTrades ?? 1000;

    for (let i = 1; i < bars.length; i++) {
      const price = bars[i].close;
      let buySignal = false;
      let sellSignal = false;
      if (strategy.isEMACross && i < emaFastArr.length && i < emaSlowArr.length) {
        const prevFast = emaFastArr[i - 1];
        const prevSlow = emaSlowArr[i - 1];
        const curFast = emaFastArr[i];
        const curSlow = emaSlowArr[i];
        if (prevFast < prevSlow && curFast > curSlow) buySignal = true;
        if (prevFast > prevSlow && curFast < curSlow) sellSignal = true;
      }
      if (strategy.isRSI && i < rsiArr.length) {
        const r = rsiArr[i];
        if (strategy.oversold && r < 30) buySignal = true;
        if (strategy.overbought && r > 70) sellSignal = true;
      }
      // Default momentum fallback
      if (!strategy.isEMACross && !strategy.isRSI) {
        const prev = bars[i - 1].close;
        buySignal = price > prev * 1.002;
        sellSignal = price < prev * 0.998;
      }

      if (position.side === 'flat' && buySignal) {
        position = { side: 'long', entryPrice: price, entryIndex: i };
      } else if (position.side === 'long' && sellSignal) {
        const entry = position.entryPrice;
        const grossReturnPct = ((price - entry) / entry) * 100;
        const netReturnPct = grossReturnPct - transactionCostPct;
        const pnl = (netReturnPct / 100) * equity * sizeFraction;
        const returnPct = netReturnPct;
        trades.push({ pair, entryDate: bars[position.entryIndex].date, exitDate: bars[i].date, entryPrice: entry, exitPrice: price, pnl, returnPct });
        equity += pnl;
        position = { side: 'flat', entryPrice: 0, entryIndex: 0 };
        if (trades.length >= maxTrades) break;
      }
      equityCurve.push({ date: bars[i].date, equity });
      // Yield removed to satisfy build constraints; keep loop tight
    }
    // Close any open position at the end
    if (position.side === 'long') {
      const price = bars[bars.length - 1].close;
      const entry = position.entryPrice;
      const grossReturnPct = ((price - entry) / entry) * 100;
      const netReturnPct = grossReturnPct - transactionCostPct;
      const pnl = (netReturnPct / 100) * equity * sizeFraction;
      const returnPct = netReturnPct;
      trades.push({ pair, entryDate: bars[position.entryIndex].date, exitDate: bars[bars.length - 1].date, entryPrice: entry, exitPrice: price, pnl, returnPct });
      equity += pnl;
      equityCurve.push({ date: bars[bars.length - 1].date, equity });
    }

    // Metrics
    const returns = equityCurve.map((_, idx) => {
      if (idx === 0) return 0;
      const prev = equityCurve[idx - 1].equity;
      const cur = equityCurve[idx].equity;
      return (cur - prev) / prev;
    });
    const avg = returns.reduce((a, b) => a + b, 0) / (returns.length || 1);
    const variance = returns.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / (returns.length || 1);
    const std = Math.sqrt(variance);
    const sharpe = std === 0 ? 0 : (avg * Math.sqrt(252)) / std; // daily approximation
    let peak = equityCurve[0]?.equity || 10000;
    let maxDrawdown = 0;
    for (const pt of equityCurve) {
      peak = Math.max(peak, pt.equity);
      const dd = (peak - pt.equity) / peak;
      maxDrawdown = Math.max(maxDrawdown, dd);
    }
    const wins = trades.filter(t => t.pnl > 0).length;
    const winRatePct = trades.length ? (wins / trades.length) * 100 : 0;
    const totalReturnPct = equityCurve.length ? ((equityCurve[equityCurve.length - 1].equity / (equityCurve[0].equity || 10000)) - 1) * 100 : 0;
    const pf = profitFactor(trades);
    const { t, p } = tStatisticAndPValue(returns);

    return {
      equityCurve,
      trades,
      metrics: {
        sharpe: Number(sharpe.toFixed(2)),
        maxDrawdownPct: Number((maxDrawdown * 100).toFixed(2)),
        winRatePct: Number(winRatePct.toFixed(2)),
        totalReturnPct: Number(totalReturnPct.toFixed(2)),
        profitFactor: Number((pf === Infinity ? 9999 : pf).toFixed(2)),
        tStatistic: t,
        pValue: p,
      }
    };
  }

  function sliceBars(bars: PriceBar[], startIdx: number, endIdx: number): PriceBar[] {
    return bars.slice(startIdx, endIdx);
  }

  async function walkForwardTest(pair: string, bars: PriceBar[], desc: string, riskText?: string) {
    const days = bars.length;
    const windowTrain = 180; // ~6 months
    const windowTest = 90;   // ~3 months
    const windows: Array<{ start: number; trainEnd: number; end: number }> = [];
    let idx = 0;
    while (idx + windowTrain + windowTest <= days) {
      windows.push({ start: idx, trainEnd: idx + windowTrain, end: idx + windowTrain + windowTest });
      idx += windowTest;
    }
    const results: Array<{ window: number; trades: number; returnPct: number; sharpe: number }> = [];
    for (let w = 0; w < windows.length; w++) {
      const { trainEnd, end } = windows[w];
      const testBars = sliceBars(bars, trainEnd, end);
      if (testBars.length < 60) continue;
      const res = await backtestPair(pair, testBars, desc, riskText, { maxTrades: 1000, costPct: 0.05 });
      results.push({ window: w + 1, trades: res.trades.length, returnPct: res.metrics.totalReturnPct, sharpe: res.metrics.sharpe });
    }
    return results;
  }

  // Backtest runs automatically as part of analysis trigger (non-blocking, server-driven)

  // Normalize instrument display labels to canonical symbols for server/code generation
  function normalizeInstrument(raw: string | undefined): string | undefined {
    if (!raw) return undefined;
    const trimmed = raw.trim();
    if (trimmed === MULTI_CURRENCY_LABEL) return MULTI_CURRENCY_LABEL;
    // Strip any parenthetical notes or trailing descriptors, keep the base symbol
    const parenIdx = trimmed.indexOf('(');
    const spaceIdx = trimmed.indexOf(' ');
    const cutIdx = parenIdx >= 0 ? parenIdx : (spaceIdx >= 0 ? spaceIdx : -1);
    const symbol = cutIdx >= 0 ? trimmed.slice(0, cutIdx).trim() : trimmed;
    return symbol;
  }

  function renderEquityChart(curve: { date: string; equity: number }[]) {
    if (!curve || curve.length === 0) return null;
    const width = 640;
    const height = 160;
    const minEq = Math.min(...curve.map(c => c.equity));
    const maxEq = Math.max(...curve.map(c => c.equity));
    const pad = 8;
    const scaleX = (i: number) => pad + (i / (curve.length - 1)) * (width - 2 * pad);
    const scaleY = (eq: number) => pad + (1 - (eq - minEq) / (maxEq - minEq || 1)) * (height - 2 * pad);
    let d = '';
    curve.forEach((c, i) => {
      const x = scaleX(i);
      const y = scaleY(c.equity);
      d += (i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`);
    });
    return (
      <svg width={width} height={height} className="rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <path d={d} fill="none" stroke="#2563eb" strokeWidth={2} />
      </svg>
    );
  }

  function exportCSV() {
    if (!backtestResults) return;
    const lines: string[] = [];
    lines.push('Pair,Entry Date,Exit Date,Entry Price,Exit Price,PNL,Return %');
    for (const t of backtestResults.trades) {
      lines.push(`${t.pair},${t.entryDate},${t.exitDate},${t.entryPrice},${t.exitPrice},${t.pnl},${t.returnPct}`);
    }
    lines.push('');
    const m = backtestResults.metrics;
    lines.push(`Sharpe,${m.sharpe}`);
    lines.push(`Max Drawdown %,${m.maxDrawdownPct}`);
    lines.push(`Win Rate %,${m.winRatePct}`);
    lines.push(`Total Return %,${m.totalReturnPct}`);
    if (m.profitFactor !== undefined) lines.push(`Profit Factor,${m.profitFactor}`);
    if (m.tStatistic !== undefined) lines.push(`t-Statistic,${m.tStatistic}`);
    if (m.pValue !== undefined) lines.push(`p-Value,${m.pValue}`);
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backtest_${formData.instrument || 'multi'}_${startDate.toISOString().slice(0,10)}_${endDate.toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Removed JS-based glass style to use Tailwind classes for theme support
  // const glassCardStyle: React.CSSProperties = { ... };

  const fetchUsage = async () => {
    if (!accessToken) {
      setUsage(null);
      return;
    }
    setUsageLoading(true);
    try {
      const data = await apiFetch<any>('make-server-00a119be/usage', {
        accessToken,
        retries: 1,
      });
      if (data?.usage) {
        setUsage(data.usage);
      }
    } catch (err) {
      console.warn('[Usage] Failed to fetch usage', err);
    } finally {
      setUsageLoading(false);
    }
  };

  const fetchStrategiesCount = async () => {
    if (!accessToken) {
      setStrategiesCount(null);
      return;
    }
    try {
      const data = await apiFetch<any>('make-server-00a119be/strategies', {
        accessToken,
        retries: 1,
      });
      const list = Array.isArray(data?.strategies) ? data.strategies : [];
      setStrategiesCount(list.length);
    } catch (err) {
      console.warn('[Submit] Failed to fetch strategies count', err);
    }
  };

  function normalizeIndicatorLabel(label: string): string {
    return label.trim();
  }

  function validateCustomIndicator(text: string): string | null {
    const t = text.trim();
    if (t.length < 3) return "Must be at least 3 characters";
    if (t.length > 40) return "Must be at most 40 characters";
    if (!/^[A-Za-z0-9\s().%\-]+$/.test(t)) return "Only letters, numbers, spaces and ().%-";
    const exists = selectedIndicators.some(i => i.label.toLowerCase() === t.toLowerCase());
    if (exists) return "Already selected";
    return null;
  }

  function addIndicator(label: string, custom = false) {
    const normalized = normalizeIndicatorLabel(label);
    if (!normalized) return;
    const exists = selectedIndicators.some(i => i.label.toLowerCase() === normalized.toLowerCase());
    if (exists) return;
    const next: IndicatorOption = { id: `${custom ? 'custom' : 'std'}:${normalized.toLowerCase()}`, label: normalized, custom };
    setSelectedIndicators(prev => indicatorMode === 'single' ? [next] : [...prev, next]);
    setIndicatorOpen(false);
    setCustomInputActive(false);
    setCustomText("");
    setCustomError(null);
  }

  function removeIndicator(id: string) {
    setSelectedIndicators(prev => prev.filter(i => i.id !== id));
  }

  useEffect(() => {
    try {
      const key = 'reset-indicators-on-new-strategy';
      const flag = typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
      if (flag) {
        setSelectedIndicators([]);
        setIndicatorMode('multiple');
        try { if (typeof window !== 'undefined') window.localStorage.removeItem('indicator.selection'); } catch {}
        try { if (typeof window !== 'undefined') window.localStorage.removeItem('indicator.mode'); } catch {}
        try { if (typeof window !== 'undefined') window.localStorage.removeItem(key); } catch {}
      }
    } catch {}
  }, []);

  useEffect(() => {
    const modeRaw = (() => { try { return typeof window !== 'undefined' ? window.localStorage.getItem('indicator.mode') : null; } catch { return null; } })();
    const selRaw = (() => { try { return typeof window !== 'undefined' ? window.localStorage.getItem('indicator.selection') : null; } catch { return null; } })();
    if (modeRaw === 'single' || modeRaw === 'multiple') setIndicatorMode(modeRaw as IndicatorMode);
    if (selRaw) {
      try {
        const parsed = JSON.parse(selRaw);
        if (Array.isArray(parsed)) setSelectedIndicators(parsed.filter(Boolean));
      } catch {}
    }
  }, []);

  useEffect(() => {
    try { if (typeof window !== 'undefined') window.localStorage.setItem('indicator.mode', indicatorMode); } catch {}
  }, [indicatorMode]);

  useEffect(() => {
    try { if (typeof window !== 'undefined') window.localStorage.setItem('indicator.selection', JSON.stringify(selectedIndicators)); } catch {}
  }, [selectedIndicators]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Gate users based on tier limits
    const limit = TIER_LIMITS[tier].generations;
    const effectiveCount = (usage && typeof usage.count === 'number') ? usage.count : strategiesCount;

    if (limit !== Infinity && effectiveCount !== null && effectiveCount >= limit) {
      if (tier === 'free') {
        toast.error('Free limit reached — upgrade for more.', {
          audience: 'basic',
          tag: 'limit_reached'
        } as any);
        setTimeout(() => onNavigate('subscription'), 1000);
      } else {
        setShowLimitBanner(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      return;
    }
    
    if (!formData.strategyName.trim()) {
      toast.error("Please enter a strategy name");
      return;
    }

    if (formData.description.length < 20) {
      toast.error("Strategy description must be at least 20 characters");
      return;
    }
    
    if (!formData.riskManagement.trim()) {
      toast.error("Please provide risk management details");
      return;
    }

    if (!formData.instrument) {
      toast.error("Please select an instrument");
      return;
    }

    if (!formData.platform) {
      toast.error("Please select a platform");
      return;
    }
    
    setIsLoading(true);
    setGenerationAttempts((n) => n + 1);

    try {
      const normalizedInstrument = normalizeInstrument(formData.instrument);
      const instrumentForCode = (normalizedInstrument && normalizedInstrument !== MULTI_CURRENCY_LABEL)
        ? normalizedInstrument
        : MAJOR_PAIRS.join(', ');
      const payload: StrategyCreateRequest = {
        strategy_name: formData.strategyName || 'Untitled Strategy',
        description: formData.description,
        risk_management: formData.riskManagement,
        instrument: instrumentForCode,
        analysis_instrument: normalizedInstrument,
        platform: formData.platform,
        indicators: selectedIndicators.map(i => i.label),
        indicator_mode: indicatorMode,
      };
      console.log('[Generate] Request start', {
        path: 'make-server-00a119be/strategies',
        accessTokenPresent: !!accessToken,
        accessTokenLength: accessToken?.length || 0,
        accessTokenPreview: accessToken ? `${accessToken.substring(0, 20)}...` : 'null',
        payload,
      });
      const data = await apiFetch<StrategyCreateResponse>('make-server-00a119be/strategies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        accessToken,
        retries: 1,
      });
      console.log('[Generate] Parsed JSON', data);
      // Count a code generation for basic users
      onGenerationCount('code');

      // Navigate to the code result screen with the generated strategy ID
      toast.success("Strategy submitted. Generating code in background...");

      // Trigger background analysis immediately (non-blocking) with robust retries/backoff
      try {
        const analysisPayload = buildBacktestPayload(
          formData.description,
          normalizeInstrument(formData.instrument || undefined),
          startDate,
          endDate
        );

        // localStorage guard to avoid duplicate triggers across screens
        const flagKey = `analysis_started:${data.strategyId}`;
        const markStarted = () => {
          try { if (typeof window !== 'undefined') window.localStorage.setItem(flagKey, String(Date.now())); } catch {}
        };
        const alreadyStarted = (() => {
          try { return typeof window !== 'undefined' && !!window.localStorage.getItem(flagKey); } catch { return false; }
        })();

        const attemptDelays = [0, 20000, 40000, 60000]; // much longer backoff to avoid timeout-induced retries
        const triggerAttempt = async (attempt: number) => {
          try {
            console.log('[Analyze][Auto] Trigger attempt', { attempt, strategyId: data.strategyId });
            // Pass suppress_notification in both query and body for robustness
            await apiFetch('make-server-00a119be/strategies/' + data.strategyId + '/reanalyze?suppress_notification=true', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: {
                ...analysisPayload,
                suppress_notification: true
              },
              accessToken,
              retries: 0,
            });
            markStarted();
            onGenerationCount('analysis');
          } catch (err) {
            console.warn('[Analyze][Auto] Attempt failed', { attempt, err });
            if (attempt + 1 < attemptDelays.length) {
              const delay = attemptDelays[attempt + 1];
              setTimeout(() => { triggerAttempt(attempt + 1); }, delay);
            }
          }
        };

        if (!alreadyStarted) {
          // Fire-and-forget; do not await to keep code generation flow non-blocking
          setTimeout(() => { triggerAttempt(0); }, attemptDelays[0]);
        } else {
          console.log('[Analyze][Auto] Skipping; analysis already flagged started');
        }
      } catch (err) {
        console.warn('[Analyze][Auto] Failed to schedule analysis', err);
      }

      onNavigate('code', data.strategyId);
    } catch (error: any) {
      console.error('[Generate] Exception', { errorMessage: error?.message, error });
      if (error?.status === 403) {
        const msg = 'You have reached your strategy creation limit. Upgrade to Pro for 10 generations or Elite for unlimited access.';
        // Auto-redirect to subscription when free limit reached
        setTimeout(() => onNavigate('subscription'), 1200);
      } else if (typeof error?.message === 'string' && error.message.includes('Free tier limit reached — upgrade to continue')) {
        // Seamless redirect
        setTimeout(() => onNavigate('subscription'), 1200);
      } else {
        toast.error(error?.message || 'Failed to submit strategy');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Fetch lifetime usage for basic users
    fetchUsage();
    fetchStrategiesCount();
  }, [accessToken]);

  // Removed auto-redirect on visiting this screen to avoid duplicate/early redirects.

  const fillExample = (example: typeof STRATEGY_EXAMPLES[0]) => {
    setFormData({
      ...formData,
      description: example.description,
      riskManagement: example.risk
    });
    setExamplesOpen(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-black flex flex-col">
      {/* Header */}
      <div className="bg-white dark:bg-black border-b border-gray-200 dark:border-white/10 p-4 pb-5 sticky top-0 z-10 mb-4">
        <div className="max-w-md sm:max-w-lg md:max-w-xl lg:max-w-2xl xl:max-w-3xl mx-auto flex items-center">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onNavigate('home')}
            className="mr-3 text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-white/10"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Submit Strategy</h1>
            <p className="text-xs text-gray-500 dark:text-white/70">Describe your trading idea</p>
          </div>
        </div>
      </div>

      {/* Form */}
        <div className="app-container flex-1 px-[9px] py-4 safe-nav-pad">
        {/* Removed basic plan usage banner */}
        {showLimitBanner && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
            <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-medium text-red-900 dark:text-red-100">Limit Reached</h3>
              <p className="text-sm text-red-800 dark:text-red-200 mt-1">
                Monthly strategy creation limit reached, Upgrade to Elite for unlimited strategy creations or wait till counter refreshes.
              </p>
              <div className="mt-3 flex gap-3">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="bg-white dark:bg-gray-800 border-red-200 hover:bg-red-50 text-red-700"
                  onClick={() => onNavigate('subscription', 'plan-elite')}
                >
                  Upgrade to Elite
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-red-700 hover:bg-red-100 hover:text-red-900"
                  onClick={() => setShowLimitBanner(false)}
                >
                  Dismiss
                </Button>
              </div>
            </div>
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <Card className="border border-white/40 dark:border-white/20 shadow-xl rounded-[30px] bg-white/20 backdrop-blur-xl dark:bg-gray-900">
            <CardHeader>
              <CardTitle className="text-gray-900 dark:text-white">Strategy Details</CardTitle>
              <CardDescription className="text-gray-500 dark:text-gray-400">
                Describe your trading strategy in plain English
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="strategy-name" className="text-gray-900 dark:text-white">Strategy Name *</Label>
                <Input
                  id="strategy-name"
                  placeholder="e.g., My RSI Strategy"
                  value={formData.strategyName}
                  onChange={(e) => setFormData({ ...formData, strategyName: e.target.value })}
                  required
                  className="rounded-[24px] bg-white/20 backdrop-blur-md border-gray-200/50 shadow-sm hover:bg-white/40 focus:bg-white/60 transition-all duration-200 dark:bg-gray-800 dark:border-gray-700 text-gray-900 dark:text-white placeholder:text-gray-500"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="description" className="text-gray-900 dark:text-white">Strategy Description *</Label>
                  <Dialog open={examplesOpen} onOpenChange={setExamplesOpen}>
                    <DialogTrigger asChild>
                      <Button variant="ghost" size="sm" type="button" className="text-gray-900 dark:text-white hover:text-gray-700 dark:hover:text-white/90 hover:bg-gray-100 dark:hover:bg-white/10">
                        <HelpCircle className="w-4 h-4 mr-1" />
                        Examples
                      </Button>
                    </DialogTrigger>
        <DialogContent className="max-w-md sm:max-w-lg md:max-w-xl">
                      <DialogHeader>
                        <DialogTitle>Strategy Examples</DialogTitle>
                        <DialogDescription>
                          Click to use any example as a template
                        </DialogDescription>
                      </DialogHeader>
                      <ScrollArea className="h-[400px] pr-4">
                        <div className="space-y-3">
                          {STRATEGY_EXAMPLES.map((example, index) => (
                            <Card
                              key={index}
                              className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                              onClick={() => fillExample(example)}
                            >
                              <CardHeader className="pb-2">
                                <CardTitle className="text-sm">{example.title}</CardTitle>
                              </CardHeader>
                              <CardContent className="text-xs text-gray-600 dark:text-gray-400">
                                <p className="mb-2">{example.description}</p>
                                <p className="text-blue-600 dark:text-blue-400">
                                  Risk: {example.risk}
                                </p>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </ScrollArea>
                    </DialogContent>
                  </Dialog>
                </div>
                <Textarea
                  id="description"
                  placeholder="Example: Buy when RSI(14) is below 30 and price is above 200-period EMA. Sell when RSI goes above 70. Use 50 pip stop loss and 100 pip take profit."
                  rows={6}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  required
                  className="rounded-[24px] bg-white/20 backdrop-blur-md border-gray-200/50 shadow-sm hover:bg-white/40 focus:bg-white/60 transition-all duration-200 dark:bg-gray-800 dark:border-gray-700 text-gray-900 dark:text-white placeholder:text-gray-500"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Minimum 20 characters ({formData.description.length}/20)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="risk" className="text-gray-900 dark:text-white">Risk Management *</Label>
                <Textarea
                  id="risk"
                  placeholder="e.g., Max 2% risk per trade, trailing stop of 30 pips"
                  rows={3}
                  value={formData.riskManagement}
                  onChange={(e) => setFormData({ ...formData, riskManagement: e.target.value })}
                  required
                  className="rounded-[24px] bg-white/20 backdrop-blur-md border-gray-200/50 shadow-sm hover:bg-white/40 focus:bg-white/60 transition-all duration-200 dark:bg-gray-800 dark:border-gray-700 text-gray-900 dark:text-white placeholder:text-gray-500"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="instrument" className="text-gray-900 dark:text-white">Instrument *</Label>
                <Select
                  value={formData.instrument}
                  onValueChange={(value) => setFormData({ ...formData, instrument: value })}
                >
                  <SelectTrigger id="instrument" className="rounded-[24px] bg-white/20 backdrop-blur-md border-gray-200/50 shadow-sm hover:bg-white/40 focus:bg-white/60 transition-all duration-200 dark:bg-gray-800 dark:border-gray-700 text-gray-900 dark:text-white">
                    <SelectValue placeholder="Select instrument" />
                  </SelectTrigger>
                  <SelectContent>
                    {INSTRUMENTS.map((instrument) => (
                      <SelectItem key={instrument} value={instrument}>
                        {instrument}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="platform" className="text-gray-900 dark:text-white">Platform *</Label>
                <Select
                  value={formData.platform}
                  onValueChange={(value) => setFormData({ ...formData, platform: value })}
                  required
                >
                  <SelectTrigger id="platform" className="rounded-[24px] bg-white/20 backdrop-blur-md border-gray-200/50 shadow-sm hover:bg-white/40 focus:bg-white/60 transition-all duration-200 dark:bg-gray-800 dark:border-gray-700 text-gray-900 dark:text-white">
                    <SelectValue placeholder="Select platform" />
                  </SelectTrigger>
                  <SelectContent>
                    {PLATFORMS.map((platform) => {
                      const isLocked = (platform.value === 'mql4' && !TIER_LIMITS[tier].mql4) ||
                                       (platform.value === 'pinescript' && !TIER_LIMITS[tier].pine);
                      const suffix = isLocked ? (platform.value === 'pinescript' ? ' (Elite)' : ' (Pro+)') : '';
                      
                      return (
                        <SelectItem key={platform.value} value={platform.value} disabled={isLocked}>
                          {platform.label}{suffix}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card className="border border-white/40 dark:border-white/20 shadow-xl rounded-[30px] bg-white/20 backdrop-blur-xl dark:bg-gray-900">
            <CardHeader>
              <CardTitle className="text-gray-900 dark:text-white">Indicators (Optional)</CardTitle>
              <CardDescription className="text-gray-500 dark:text-gray-400">
                Select one or more indicators to guide generation
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="indicator" className="text-gray-900 dark:text-white">Select Indicator</Label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 dark:text-gray-400">Multiple</span>
                  <Switch
                    checked={indicatorMode === 'multiple'}
                    onCheckedChange={(checked) => setIndicatorMode(checked ? 'multiple' : 'single')}
                  />
                </div>
              </div>
              <Popover open={indicatorOpen} onOpenChange={setIndicatorOpen}>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" className="w-full justify-between bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Select Indicator">
                    <span className="truncate">
                      {selectedIndicators.length === 0 ? 'Choose indicator' : indicatorMode === 'single' ? selectedIndicators[0]?.label : `${selectedIndicators.length} selected`}
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-[var(--radix-select-trigger-width)]">
                  <Command>
                    <CommandInput placeholder="Search indicators" />
                    <CommandList>
                      <CommandEmpty>No results</CommandEmpty>
                      <CommandGroup heading="Popular">
                        {TOP_INDICATORS.map((ind) => (
                          <CommandItem key={ind} onSelect={() => addIndicator(ind)}>
                            {ind}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                      <CommandGroup heading="Custom">
                        <CommandItem onSelect={() => setCustomInputActive(true)}>Custom Indicator</CommandItem>
                      </CommandGroup>
                    </CommandList>
                    {customInputActive && (
                      <div className="border-t p-2 space-y-2">
                        <Input
                          placeholder="Enter custom indicator"
                          value={customText}
                          onChange={(e) => {
                            setCustomText(e.target.value);
                            setCustomError(null);
                          }}
                          aria-invalid={!!customError}
                        />
                        {customError && (
                          <p className="text-xs text-destructive">{customError}</p>
                        )}
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            onClick={() => {
                              const err = validateCustomIndicator(customText);
                              if (err) { setCustomError(err); return; }
                              addIndicator(customText, true);
                            }}
                          >
                            Add
                          </Button>
                          <Button type="button" variant="ghost" onClick={() => { setCustomInputActive(false); setCustomText(""); setCustomError(null); }}>Cancel</Button>
                        </div>
                      </div>
                    )}
                  </Command>
                </PopoverContent>
              </Popover>
              {selectedIndicators.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedIndicators.map((ind) => (
                    <Badge key={ind.id} variant="outline" className="px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white border-gray-200 dark:border-gray-700">
                      <span>{ind.label}</span>
                      <button
                        type="button"
                        aria-label={`Remove ${ind.label}`}
                        className="ml-1 inline-flex items-center justify-center"
                        onClick={() => removeIndicator(ind.id)}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Button
            type="submit"
            className="w-full"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating Code...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Generate Expert Advisor
              </>
            )}
          </Button>

          <Card className="border border-gray-200 dark:border-white/20 shadow-sm rounded-lg bg-gray-50 dark:bg-gray-800">
            <CardContent className="p-4">
              <p className="text-xs text-gray-600 dark:text-gray-300">
                <strong>Note:</strong> After you click Generate, you’ll go straight to the code screen while generation runs in the background (usually 10–15 seconds).
              </p>
            </CardContent>
          </Card>

          {/* Backtesting UI removed; backtesting now runs automatically during analysis generation */}
        </form>
      </div>
    </div>
  );
}
