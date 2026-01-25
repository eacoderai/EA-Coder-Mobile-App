import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { Progress } from "./ui/progress";
import { ArrowLeft, TrendingUp, TrendingDown, Activity, DollarSign, Loader2, Crown, Clock, Sparkles, Info, Coins, Lock, X } from "lucide-react";
import { MAJOR_PAIRS, MULTI_CURRENCY_LABEL } from '../utils/backtestPayload';
import { projectId } from '../utils/supabase/info';
import { toast } from "../utils/tieredToast";
import { getFunctionUrl } from '../utils/supabase/client';
import { apiFetch } from '../utils/api';
import { buildStrategyAnalysisPrompt } from '../utils/promptTemplates';
import { supabase } from '../utils/supabase/client';
import type { StrategyRecord, AnalysisNotification } from '../types/analysis';

import { Tier, TIER_LIMITS } from '../types/user';

interface AnalyzeScreenProps {
  strategyId?: string;
  onNavigate: (screen: string) => void;
  accessToken: string | null;
  tier: Tier;
  remainingGenerations: number;
  onGenerationCount: (kind: 'code' | 'analysis') => void;
}

import { RestrictedBanner } from './RestrictedBanner';
import { Tooltip, TooltipTrigger, TooltipContent } from './ui/tooltip';
import { addLocalNotification } from '../utils/notifications';
import { logSuppressedLimitToast } from '../utils/limits';
import { NotificationBell } from "./ui/NotificationBell";
export function AnalyzeScreen({ strategyId, onNavigate, accessToken, tier, remainingGenerations, onGenerationCount }: AnalyzeScreenProps) {
  const [strategy, setStrategy] = useState<StrategyRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // subscription state removed in favor of tier prop
  const [nextAnalysis, setNextAnalysis] = useState<string | null>(null);
  const [isReanalyzing, setIsReanalyzing] = useState(false);
  const [usage, setUsage] = useState<{ count: number; remaining: number; window: string } | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [analysisImprovements, setAnalysisImprovements] = useState<string[] | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [showEliteReanalyzeBanner, setShowEliteReanalyzeBanner] = useState(false);
  const processingQueue = useRef(false);
  const queuedAnalysis = useRef<(() => Promise<void>)[]>([]);
  const autoTriggeredRef = useRef(false);
  const nextAnalysisTimeoutRef = useRef<number | null>(null);
  const proContainerRef = useRef<HTMLDivElement | null>(null);
  const [hasOverflow, setHasOverflow] = useState(false);
  const [coins, setCoins] = useState<number>(() => {
    try {
      if (typeof window !== 'undefined') {
        const stored = window.localStorage.getItem('ea:coins');
        const n = Number(stored);
        return isFinite(n) && n >= 0 ? n : 0;
      }
    } catch {}
    return 0;
  });
  const [isDeducting, setIsDeducting] = useState(false);
  const [coinPulse, setCoinPulse] = useState(false);
  const coinBadgeRef = useRef<HTMLDivElement | null>(null);
  const lastCoinTxRef = useRef<{ before: number; after: number; at: number } | null>(null);
  const coinsLockUntilRef = useRef<number>(0);
  const isCoinOpInFlight = useRef(false);
  const COIN_COST_REANALYZE = 2;
  const COINS_STORAGE_KEY = 'ea:coins';
  const COIN_TX_STORAGE_KEY = 'ea:lastCoinTx';
  const readStoredCoins = (): number | null => {
    try {
      if (typeof window === 'undefined') return null;
      const raw = window.localStorage.getItem(COINS_STORAGE_KEY);
      if (!raw) return null;
      const n = Number(raw);
      return isFinite(n) && n >= 0 ? n : null;
    } catch { return null; }
  };
  const writeStoredCoins = (value: number) => {
    try {
      if (typeof window === 'undefined') return;
      window.localStorage.removeItem(COINS_STORAGE_KEY);
      window.localStorage.removeItem(COIN_TX_STORAGE_KEY);
      window.localStorage.setItem(COINS_STORAGE_KEY, String(Math.max(0, Number(value) || 0)));
    } catch {}
  };
  const readStoredTx = (): { before: number; after: number; at: number } | null => {
    try {
      if (typeof window === 'undefined') return null;
      const raw = window.localStorage.getItem(COIN_TX_STORAGE_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== 'object') return null;
      const before = Number(obj.before);
      const after = Number(obj.after);
      const at = Number(obj.at);
      if (!isFinite(before) || !isFinite(after) || !isFinite(at)) return null;
      return { before, after, at };
    } catch { return null; }
  };
  const writeStoredTx = (tx: { before: number; after: number; at: number }) => {
    try {
      if (typeof window === 'undefined') return;
      window.localStorage.setItem(COIN_TX_STORAGE_KEY, JSON.stringify({
        before: Math.max(0, Number(tx.before) || 0),
        after: Math.max(0, Number(tx.after) || 0),
        at: Number(tx.at) || Date.now(),
      }));
    } catch {}
  };

  const formatPercent = (v: unknown): string => {
    if (v === null || v === undefined) return '—';
    const n0 = typeof v === 'string' ? parseFloat(v) : Number(v);
    if (!isFinite(n0)) return '—';
    const n1 = n0 <= 1 ? n0 * 100 : n0;
    const n = Math.max(0, Math.min(100, n1));
    const str = n >= 10 ? n.toFixed(0) : n.toFixed(2);
    return `${str}%`;
  };

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
      if (data?.usage) setUsage(data.usage);
    } catch (err) {
      console.warn('[Usage] Failed to fetch usage', err);
    } finally {
      setUsageLoading(false);
    }
  };

  useEffect(() => {
    if (strategyId) {
      loadStrategy();
      // loadSubscription removed
      loadNextAnalysis();
      fetchUsage();
      fetchLatestAnalysis();
    } else {
      setIsLoading(false);
    }
  }, [strategyId]);

  useEffect(() => {
    const el = proContainerRef.current;
    if (!el) return;
    const measure = () => {
      const overflow = (el.scrollWidth > el.clientWidth) || (el.scrollHeight > el.clientHeight);
      setHasOverflow(overflow);
      try { console.log(overflow ? '[ProContainer] Overflow detected' : '[ProContainer] No overflow'); } catch {}
    };
    measure();
    let ro: ResizeObserver | null = null;
    let mo: MutationObserver | null = null;
    try {
      ro = new ResizeObserver(measure);
      ro.observe(el);
      mo = new MutationObserver(measure);
      mo.observe(el, { childList: true, subtree: true, attributes: true });
    } catch {}
    const id = window.setInterval(measure, 1000);
    return () => {
      window.clearInterval(id);
      try { if (ro) ro.disconnect(); if (mo) mo.disconnect(); } catch {}
    };
  }, [proContainerRef]);

  const fetchCoins = async () => {
    if (!accessToken) return;
    // Prevent overwriting optimistic updates or authoritative server responses
    if (isCoinOpInFlight.current) return;
    if (Date.now() < coinsLockUntilRef.current) return;
    
    try {
      const data = await apiFetch<any>(`make-server-00a119be/coins?t=${Date.now()}`, { accessToken, retries: 1 });
      const n = Number(data?.coins || 0);
      const safe = isFinite(n) && n >= 0 ? n : 0;
      setCoins(safe);
      writeStoredCoins(safe);
    } catch (_) {}
  };

  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(COINS_STORAGE_KEY);
        window.localStorage.removeItem(COIN_TX_STORAGE_KEY);
        window.localStorage.removeItem('payment_pending');
      }
    } catch {}
    fetchCoins();
  }, [accessToken]);

  useEffect(() => {
    const onVis = () => {
      if (typeof document !== 'undefined' && !document.hidden) {
        fetchCoins();
      }
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVis);
    }
    return () => {
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVis);
      }
    };
  }, [accessToken]);

  // Poll next analysis and auto-run when due (premium only)
  useEffect(() => {
    if (!strategyId || tier === 'free') return;
    const interval = setInterval(async () => {
      const due = nextAnalysis ? new Date(nextAnalysis).getTime() <= Date.now() : false;
      if (due && !processingQueue.current) {
        queueAnalysisTask(async () => {
          // Hitting next-analysis will auto-run on the server if due
          await loadNextAnalysis();
          await fetchLatestAnalysis();
          await loadStrategy();
          try { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('ea:analysis_update', { detail: { strategyId } })); } catch {}
        });
        processAnalysisQueue();
      }
    }, 60000); // check every 60s
    return () => clearInterval(interval);
  }, [strategyId, tier, nextAnalysis]);

  useEffect(() => {
    if (nextAnalysisTimeoutRef.current) {
      clearTimeout(nextAnalysisTimeoutRef.current);
      nextAnalysisTimeoutRef.current = null;
    }
    const isProUser = tier !== 'free';
    if (!strategyId || !isProUser || !nextAnalysis) return;
    const msUntilDue = new Date(nextAnalysis).getTime() - Date.now();
    const delay = Math.max(0, msUntilDue);
    nextAnalysisTimeoutRef.current = window.setTimeout(() => {
      if (processingQueue.current) return;
      queueAnalysisTask(async () => {
        await loadNextAnalysis();
        await fetchLatestAnalysis();
        await loadStrategy();
        try { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('ea:analysis_update', { detail: { strategyId } })); } catch {}
      });
      processAnalysisQueue();
    }, delay);
    return () => {
      if (nextAnalysisTimeoutRef.current) {
        clearTimeout(nextAnalysisTimeoutRef.current);
        nextAnalysisTimeoutRef.current = null;
      }
    };
  }, [nextAnalysis, tier, strategyId]);

  useEffect(() => {
    if (!strategyId || !strategy) return;
    const hasImprovements = Array.isArray(analysisImprovements) && analysisImprovements.length > 0;
    const hasMetrics = (
      strategy?.win_rate !== undefined ||
      strategy?.profit_factor !== undefined ||
      strategy?.max_drawdown !== undefined ||
      strategy?.expected_return !== undefined
    );
    if ((!hasImprovements || !hasMetrics) && !analysisLoading && !processingQueue.current && !autoTriggeredRef.current) {
      autoTriggeredRef.current = true;
      queueAnalysisTask(async () => {
        await triggerReanalysisInternal(false);
        await fetchLatestAnalysis();
      });
      processAnalysisQueue();
    }
  }, [strategy, strategyId, analysisImprovements, analysisLoading]);

  const loadStrategy = async () => {
    try {
      console.log('[Analyze] LoadStrategy start', { strategyId });
      const data = await apiFetch<any>(`make-server-00a119be/strategies/${strategyId}`, {
        accessToken,
        retries: 1,
      });
      const metrics = data?.analysis?.metrics;
      const enriched = metrics && typeof metrics === 'object' ? { ...data, ...metrics } : data;
      setStrategy(enriched);
      if (Array.isArray(data?.analysis?.improvements)) {
        setAnalysisImprovements(data.analysis.improvements);
      }
    } catch (error) {
      console.error('Failed to load strategy:', error);
      const status = (error as any)?.status;
      if (status === 404) {
        toast.error('Strategy not found');
      } else if (status === 401) {
        toast.error('Unauthorized – please sign in again');
      } else if (status) {
        toast.error(`Failed to load strategy (${status})`);
      } else {
        toast.error('Failed to load strategy');
      }
      // No development fallbacks: rely on backend responses only
    } finally {
      setIsLoading(false);
    }
  };

  const fetchLatestAnalysis = async () => {
    if (!accessToken || !strategyId) return;
    setAnalysisLoading(true);
    setAnalysisError(null);
    try {
      const data = await apiFetch<any>('make-server-00a119be/notifications', {
        accessToken,
        retries: 1,
      });
      const items = Array.isArray(data?.notifications) ? data.notifications : Array.isArray(data) ? data : [];
      const latest = items
        .filter((n: AnalysisNotification) => n?.type === 'analysis_update' && String(n?.strategyId) === String(strategyId))
        .sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
      if (latest && Array.isArray(latest.improvements)) {
        setAnalysisImprovements(latest.improvements);
      }
    } catch (e: any) {
      setAnalysisError(e?.message || 'Failed to load analysis');
    } finally {
      setAnalysisLoading(false);
    }
  };

  const queueAnalysisTask = (task: () => Promise<void>) => {
    queuedAnalysis.current.push(task);
  };

  const processAnalysisQueue = async () => {
    if (processingQueue.current) return;
    processingQueue.current = true;
    try {
      while (queuedAnalysis.current.length) {
        const task = queuedAnalysis.current.shift();
        if (!task) continue;
        await task();
      }
    } finally {
      processingQueue.current = false;
    }
  };

  const loadNextAnalysis = async () => {
    if (!accessToken || !strategyId) return;
    
    try {
      console.log('[Analyze] LoadNextAnalysis start', { strategyId });
      const data = await apiFetch<any>(`make-server-00a119be/strategies/${strategyId}/next-analysis`, {
        accessToken,
        retries: 1,
      });
      setNextAnalysis(data.next_analysis);
    } catch (error) {
      console.error('Error loading next analysis:', error);
    }
  };

  const handleTriggerReanalysis = async () => {
    if (tier !== 'elite') {
      setShowEliteReanalyzeBanner(true);
      return;
    }

    // Check usage limits for Elite users (though usually unlimited)
    if (remainingGenerations <= 0) {
      toast.error('Monthly limit reached — upgrade to Elite for more.', { audience: 'upgrade-to-elite', tag: 'limit_reached' });
      // We don't return here? Wait, if limit reached, we should return unless it's just a warning.
      // Logic in SubmitStrategyScreen was strict. Here we probably want to block.
      // But let's check if remainingGenerations applies to analysis?
      // App.tsx incrementGeneration(kind) -> analysis runs don't consume generation limit usually?
      // App.tsx: 
      // if (kind === 'code') { ... check limit ... }
      // It seems analysis might not consume the 'generations' limit, or maybe it does?
      // In App.tsx: incrementGeneration updates usage. 
      // But TIER_LIMITS says 'generations: 10'. Usually refers to code generation.
      // Re-analysis might be separate or unlimited for Pro?
      // Old code: 
      // if (!hasPremium) { if (remainingGenerations <= 0) { block } }
      // It implies free users were blocked by generation limit.
      // But Pro/Elite usually have different limits.
      // Let's assume for now we check remainingGenerations if it's relevant.
      // If TIER_LIMITS.pro.generations refers to Strategies Created, does Analysis count?
      // Usually Analysis is separate. But let's look at how it was.
      // The old code blocked basic users if remainingGenerations <= 0.
      // For now, I'll assume Pro users can re-analyze unless blocked by something else.
      // But wait, the previous code had:
      // if (!hasPremium) { ... } else { if (remainingGenerations <= 0) logSuppressed... }
      // This implies Premium users were NOT blocked by remainingGenerations <= 0, just logged.
      // So Pro/Elite should not be blocked by generation count for analysis.
      
      // Let's just log suppressed limit for Pro/Elite if they are at 0, but allow it.
      // actually, if tier is Pro, and they have 10 generations, maybe they are fine.
      // Let's stick to the previous behavior: paid users are not blocked by generation count here.
    }
    
    if (remainingGenerations <= 0) {
       // Log for analytics
       logSuppressedLimitToast('AnalyzeScreen.handleTriggerReanalysis', 4, 4, true);
    }

    if (isDeducting || isReanalyzing) {
      try { console.log('[Coins] Deduction prevented due to in-flight process'); } catch {}
      return;
    }
    const current = coins;
    if (current < COIN_COST_REANALYZE) {
      toast.error('Insufficient coins');
      try { console.warn('[Coins] Insufficient balance', { current, cost: COIN_COST_REANALYZE }); } catch {}
      return;
    }

    setIsReanalyzing(true);
    setIsDeducting(true);
    isCoinOpInFlight.current = true;
    
    // Optimistic coin deduction so the span updates immediately
    try {
      setCoins((c) => {
        const next = Math.max(0, Number(c) - COIN_COST_REANALYZE);
        if (next === 0) {
          try { toast.error('No coins remaining'); } catch {}
        }
        try { console.log('[Coins] Optimistic deduction', { before: Number(c), after: next, cost: COIN_COST_REANALYZE }); } catch {}
        lastCoinTxRef.current = { before: Number(c), after: next, at: Date.now() };
        writeStoredCoins(next);
        writeStoredTx(lastCoinTxRef.current);
        return next;
      });
    } catch {}
    try {
      await triggerReanalysisInternal(true);
      if (!coinBadgeRef.current) {
        try { console.warn('[Coins] Coin badge element not found'); } catch {}
      }
      setCoinPulse(true);
      setTimeout(() => setCoinPulse(false), 600);
    } catch (error) {
      console.error('Failed to trigger re-analysis:', error);
      toast.error('Failed to trigger re-analysis');
      // Do not revert locally; instead re-sync from server for authoritative balance
      isCoinOpInFlight.current = false;
      try { await fetchCoins(); } catch {}
    } finally {
      setIsReanalyzing(false);
      setIsDeducting(false);
      isCoinOpInFlight.current = false;
    }
  };

  const triggerReanalysisInternal = async (notifyUI: boolean) => {
    setAnalysisLoading(true);
    setAnalysisError(null);
    try {
      const before = Number(coins);
      const txId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const data = await apiFetch<any>(`make-server-00a119be/strategies/${strategyId}/reanalyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          analysis_prompt: buildStrategyAnalysisPrompt(strategy || {}),
          strategy_context: {
            strategy_id: strategyId,
            strategy_name: strategy?.strategy_name || 'Untitled Strategy',
            description: strategy?.description || '',
            risk_management: strategy?.risk_management || '',
            instrument: (strategy?.analysis_instrument === MULTI_CURRENCY_LABEL)
              ? MAJOR_PAIRS.join(', ')
              : (strategy?.analysis_instrument || strategy?.instrument || 'EURUSD'),
            platform: strategy?.platform || 'mql4',
            backtest_period: strategy?.backtest_period || '3 Years',
            timeframe: strategy?.timeframe || 'H1'
          },
          attach_prompt: true
          , tx_id: txId
        },
        accessToken,
        retries: 1,
      });
      setNextAnalysis(data.nextAnalysisDate || nextAnalysis || null);
      onGenerationCount('analysis');
      if (typeof data?.coins === 'number' && isFinite(Number(data.coins))) {
        const after = Math.max(0, Number(data.coins));
        lastCoinTxRef.current = { before, after, at: Date.now() };
        try { console.log('[Coins] Server authoritative balance', { before, after }); } catch {}
        setCoins(after);
        coinsLockUntilRef.current = Date.now() + 60000;
        writeStoredCoins(after);
        writeStoredTx(lastCoinTxRef.current);
      }
      if (notifyUI) {
        toast.success('Analysis complete!');
      }
      // Pull latest recommendations and refreshed strategy metrics
      await fetchLatestAnalysis();
      await loadStrategy();
      await loadNextAnalysis();
    } catch (err: any) {
      setAnalysisError(err?.message || 'Failed to trigger analysis');
      if (notifyUI) toast.error('Failed to trigger re-analysis');
    }
    setAnalysisLoading(false);
  };

  const purchaseCoins = async (amountUsd: number = 5) => {
    if (!accessToken) {
      toast.error('Please sign in to purchase coins');
      return;
    }
    try {
      const amtNum = Math.floor(Number(amountUsd));
      if (!isFinite(amtNum)) throw new Error('Enter a valid number between 1 and 5');
      const amt = Math.max(1, Math.min(5, amtNum));
      const base = (import.meta.env as any).VITE_COINS_PAYMENT_LINK_URL || 'https://buy.stripe.com/test_7sY6oH5wi6tW08m1rubsc03';
      const parts = accessToken.split('.');
      let userId: string | null = null;
      try {
        if (parts.length >= 2) {
          const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
          userId = payload?.sub ? String(payload.sub) : null;
        }
      } catch {}
      let email: string | null = null;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        email = (session as any)?.user?.email || null;
      } catch {}
      let url = base;
      try {
        let token = accessToken;
        if (!token) {
          const { data: { session } } = await supabase.auth.getSession();
          token = session?.access_token || null;
        }
        if (token) {
          const allocUrl = getFunctionUrl('make-server-00a119be/coins/allocate');
          await fetch(allocUrl, { method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ amount_usd: amt }) });
          
          // Optimistic update before redirect to prevent reversion on return
          const newCoins = coins + amt;
          setCoins(newCoins);
          writeStoredCoins(newCoins);
          if (typeof window !== 'undefined') {
            window.localStorage.setItem('ea:coins_lock', (Date.now() + 60000).toString());
          }

          const apiUrl = getFunctionUrl('make-server-00a119be/product-info/update');
          await fetch(apiUrl, { method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ prod_id: 'prod_TVvcAdglsrNCH0', plan_name: 'coins' }) });
        }
      } catch {}
      const params: string[] = [];
      if (userId) params.push(`client_reference_id=${encodeURIComponent(userId)}`);
      if (email) params.push(`prefilled_email=${encodeURIComponent(email)}`);
      if (params.length > 0) url = `${base}?${params.join('&')}`;
      window.location.href = url;
    } catch (e: any) {
      toast.error(e?.message || 'Failed to open payment link');
    }
  };

  const glassCardStyle: React.CSSProperties = {
    backdropFilter: 'blur(10px)',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    border: '1px solid rgba(255, 255, 255, 0.18)',
    borderRadius: '25px',
    boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.37)',
  };

  const renderMetricCard = (
    icon: React.ReactNode,
    title: string,
    value: string | number,
    subtitle: string,
    positive?: boolean
  ) => (
    <Card className="mt-8" style={glassCardStyle}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="bg-purple-100 dark:bg-purple-900/40 p-2 rounded-lg">
            {icon}
          </div>
          {positive !== undefined && (
            positive ? (
              <TrendingUp className="w-5 h-5 text-green-600" />
            ) : (
              <TrendingDown className="w-5 h-5 text-red-600" />
            )
          )}
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-2xl mb-1 text-gray-900 dark:text-white">{value}</p>
        <p className="text-sm text-gray-900 dark:text-white">{title}</p>
        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{subtitle}</p>
      </CardContent>
    </Card>
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Loading analysis...</p>
        </div>
      </div>
    );
  }

  return (
    <AnalyzeErrorBoundary>
    <div className="min-h-screen bg-background flex flex-col">
      {/* Gating removed: basic users can view analysis even at limit */}
      {/* Header */}
      <div
        className="sticky top-0 z-50 bg-gradient-to-r from-blue-600 to-blue-800 text-white p-6 rounded-b-[30px]"
        style={{ borderBottomLeftRadius: 30, borderBottomRightRadius: 30 }}
      >
        <div className="app-container flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onNavigate('home')}
              className="mr-1 text-white hover:bg-white/10"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-lg text-white">Strategy Analysis</h1>
              <p className="text-xs text-blue-100">
                Simulated backtest metrics
              </p>
            </div>
            {tier && (
              <Badge variant="outline" className="ml-2">
                {tier === 'free' ? 'Free Plan' : tier === 'pro' ? 'Pro' : 'Elite'}
              </Badge>
            )}
          </div>
          <NotificationBell accessToken={accessToken} onNavigate={onNavigate} />
        </div>
      </div>

      <div className="flex-1 app-container w-full px-[9px] pt-3 safe-nav-pad overflow-x-hidden flex flex-col min-h-0 space-y-4">
        {/* Removed quota banners */}

        {!strategyId ? (
          <Card style={glassCardStyle}>
            <CardContent className="p-8 text-center">
              <Activity className="w-12 h-12 text-blue-600 mx-auto mb-4" />
              <h3 className="text-lg mb-2 text-gray-900 dark:text-white">No Strategy Selected</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Select a strategy from the home screen to view analysis
              </p>
              <Button
                onClick={() => onNavigate('home')}
                className="px-6"
                style={{ borderRadius: '24px', width: '120px', height: '48px' }}
              >
                Go to Home
              </Button>
            </CardContent>
          </Card>
        ) : !strategy ? (
          <Card style={glassCardStyle}>
            <CardContent className="p-8 text-center">
              <p className="text-gray-600 dark:text-gray-400">Strategy not found</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Pro Weekly Analysis Banner */}
            {tier !== 'free' && nextAnalysis && (
              <Card className="bg-gradient-to-r from-blue-600 to-purple-600 border-none">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="bg-white/20 p-2 rounded-lg">
                      <Crown className="w-5 h-5 text-white" />
                    </div>
                    <div ref={proContainerRef} className={`relative flex-1 min-w-0 ${hasOverflow ? 'ring-2 ring-red-500/60' : ''}`}>

                      <h3 className="text-white mb-1">Pro Analysis Active</h3>
                      
                      {showEliteReanalyzeBanner && createPortal(
                        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4 animate-in fade-in duration-200">
                          <div 
                            className="max-w-sm w-full p-6 relative animate-in zoom-in-95 hover:scale-[1.02]"
                            style={{
                              borderRadius: '25px',
                              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
                              backdropFilter: 'blur(16px)',
                              WebkitBackdropFilter: 'blur(16px)',
                              border: '1px solid rgba(255, 255, 255, 0.2)',
                              transition: 'all 0.3s ease',
                              background: 'linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.05))'
                            }}
                          >
                            <button 
                              onClick={() => setShowEliteReanalyzeBanner(false)}
                              className="absolute right-4 top-4 text-gray-300 hover:text-white"
                            >
                              <X className="w-6 h-6" />
                            </button>
                            
                            <div className="flex flex-col items-center text-center">
                              <div className="w-16 h-16 bg-blue-600/20 rounded-full flex items-center justify-center mb-4 backdrop-blur-sm">
                                 <Crown className="w-8 h-8 text-blue-400" />
                              </div>
                              
                              <h3 className="text-xl font-bold text-white mb-2">
                                Elite Feature
                              </h3>
                              
                              <p className="text-gray-200 mb-6">
                                To enjoy manual re-analysis anytime, upgrade to elite and analyze your strategy again based on recent historical data anytime you wish.
                              </p>
                              
                              <Button 
                                className="w-full bg-gradient-to-r from-blue-600 to-blue-800 hover:from-blue-700 hover:to-blue-900 text-white font-medium py-6"
                                onClick={() => {
                                  setShowEliteReanalyzeBanner(false);
                                  onNavigate('subscription', 'plan-elite');
                                }}
                                style={{ borderRadius: '30px' }}
                              >
                                Upgrade to Elite
                              </Button>
                              
                              <button 
                                className="mt-4 text-sm text-gray-300 hover:text-white hover:underline"
                                onClick={() => setShowEliteReanalyzeBanner(false)}
                              >
                                Maybe Later
                              </button>
                            </div>
                          </div>
                        </div>,
                        document.body
                      )}

                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <p className="text-blue-100 text-sm">
                          Next automated update in {Math.ceil((new Date(nextAnalysis).getTime() - Date.now()) / (1000 * 60 * 60 * 24))} days
                        </p>
                      </div>
                      {tier !== 'free' && nextAnalysis && (
                        <Badge variant="outline" className="bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 flex items-center gap-1 shrink-0 mb-2">
                          <Clock className="w-3.5 h-3.5" />
                          Next: {new Date(nextAnalysis).toLocaleDateString()}
                        </Badge>
                      )}
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          onClick={handleTriggerReanalysis}
                          disabled={isReanalyzing || isDeducting || (tier === 'elite' && coins < COIN_COST_REANALYZE)}
                          aria-disabled={isReanalyzing || isDeducting || (tier === 'elite' && coins < COIN_COST_REANALYZE)}
                          aria-label={isReanalyzing ? 'Analyzing' : 'Re-analyze Now'}
                          className="bg-white text-blue-600 hover:bg-blue-50 text-sm h-8"
                          style={{ borderRadius: '9999px', paddingLeft: 14, paddingRight: 14 }}
                        >
                          {isReanalyzing ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Analyzing...
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-4 h-4 mr-2" />
                              Re-analyze Now
                            </>
                          )}
                        </Button>
                        {tier === 'elite' && (
                          <>
                            <div
                              ref={coinBadgeRef}
                              className="flex items-center gap-2 select-none px-2 py-1 rounded-full bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800/40 transition-colors shrink-0"
                              aria-live="polite"
                              aria-label={`Coins available: ${coins}`}
                            >
                              <Coins className={`${coinPulse ? 'text-yellow-600 animate-pulse' : 'text-yellow-600 dark:text-yellow-300'} w-5 h-5`} />
                              <span className={`${coinPulse ? 'text-yellow-600 dark:text-yellow-300' : 'text-gray-900 dark:text-white'} text-base font-medium`}>{coins}</span>
                            </div>
                            <Button
                              onClick={() => purchaseCoins(5)}
                              aria-label="Get Coins"
                              variant="ghost"
                              className="bg-white text-blue-600 hover:bg-blue-50 rounded-full h-12 w-12 leading-tight"
                            >
                              <span className="text-[10px] font-medium flex flex-col items-center justify-center">
                                <span>Get</span>
                                <span>Coins</span>
                              </span>
                            </Button>
                          </>
                        )}
                        {/* Badge moved above under header */}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Upgrade Banner for Free Users - Removed as it is redundant with the locked content card */}


            {/* Strategy Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {strategy.strategy_name || 'Untitled Strategy'}
                </CardTitle>
                <CardDescription className="flex items-center gap-2">
                  <Badge variant="outline">{(strategy.platform || 'MQL4').toUpperCase()}</Badge>
                  <span>
                    {strategy.analysis_instrument === MULTI_CURRENCY_LABEL
                      ? 'Multi-instrument'
                      : (strategy.analysis_instrument || strategy.instrument || 'Multi-instrument')}
                  </span>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  {strategy.description}
                </p>
              </CardContent>
            </Card>

            {/* Analysis Content - Hidden for Free Users */}
            {tier !== 'free' ? (
              <>
                {/* Performance Metrics */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg text-gray-900 dark:text-white">Performance Metrics</h2>
                    <Badge variant="outline" className="bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300">
                      {strategy.backtest_period || "3 Years"}
                    </Badge>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    {renderMetricCard(
                      <TrendingUp className="w-5 h-5 text-blue-600" />,
                      "Win Rate",
                      formatPercent(strategy?.win_rate),
                      `Based on ${strategy?.total_trades ?? '—'} trades`,
                      (strategy?.win_rate_change ?? 0) >= 0
                    )}
                    {renderMetricCard(
                      <DollarSign className="w-5 h-5 text-green-600" />,
                      "Profit Factor",
                      strategy?.profit_factor ?? '—',
                      "Gross profit / loss",
                      (strategy?.profit_factor_change ?? 0) >= 0
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {renderMetricCard(
                      <TrendingDown className="w-5 h-5 text-red-600" />,
                      "Max Drawdown",
                      formatPercent(strategy?.max_drawdown),
                      "Largest equity decline",
                      false
                    )}
                    {renderMetricCard(
                      <Activity className="w-5 h-5 text-purple-600" />,
                      "Expected Return",
                      formatPercent(strategy?.expected_return),
                      "Annualized return",
                      true
                    )}
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    {renderMetricCard(
                      <Clock className="w-5 h-5 text-orange-600" />,
                      "Avg. Trade Duration",
                      strategy?.avg_trade_duration ?? '—',
                      "Time in market",
                      true
                    )}
                    {renderMetricCard(
                      <Activity className="w-5 h-5 text-indigo-600" />,
                      "Volatility",
                      formatPercent(strategy?.volatility),
                      "Standard deviation",
                      false
                    )}
                  </div>
                </div>

                {/* Detailed Stats */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Detailed Statistics</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-400">Total Trades</span>
                        <span className="text-gray-900 dark:text-white">{strategy?.total_trades ?? '—'}</span>
                      </div>
                      <Progress value={strategy?.total_trades ? 100 : 0} className="h-2" />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-400">Winning Trades</span>
                        <span className="text-green-600">{strategy?.winning_trades ?? '—'}</span>
                      </div>
                      <Progress value={strategy?.winning_trades ?? 0} className="h-2 bg-gray-200 dark:bg-gray-700">
                        <div className="h-full bg-green-600 rounded-full" />
                      </Progress>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-400">Losing Trades</span>
                        <span className="text-red-600">{strategy?.losing_trades ?? '—'}</span>
                      </div>
                      <Progress value={strategy?.losing_trades ?? 0} className="h-2 bg-gray-200 dark:bg-gray-700">
                        <div className="h-full bg-red-600 rounded-full" />
                      </Progress>
                    </div>

                    <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                      <div className="flex items-center justify-between text-sm mb-2">
                        <span className="text-gray-600 dark:text-gray-400">Average Win</span>
                        <span className="text-green-600">{strategy?.average_win ?? '—'}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm mb-2">
                        <span className="text-gray-600 dark:text-gray-400">Average Loss</span>
                        <span className="text-red-600">{strategy?.average_loss ?? '—'}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm mb-2">
                        <span className="text-gray-600 dark:text-gray-400">Largest Win</span>
                        <span className="text-green-600">{strategy?.largest_win ?? '—'}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm mb-2">
                        <span className="text-gray-600 dark:text-gray-400">Largest Loss</span>
                        <span className="text-red-600">{strategy?.largest_loss ?? '—'}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-400">Profit/Loss Ratio</span>
                        <span className="text-blue-600">{strategy?.profit_loss_ratio ?? '—'}</span>
                      </div>
                    </div>
                    
                    <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                      <div className="flex items-center justify-between text-sm mb-2">
                        <span className="text-gray-600 dark:text-gray-400">Trade Frequency</span>
                        <span className="text-gray-900 dark:text-white">{strategy?.trade_frequency ?? '—'}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-400">Avg. Holding Time</span>
                        <span className="text-gray-900 dark:text-white">{strategy?.avg_holding_time ?? '—'}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Risk Metrics */}
                <Card style={glassCardStyle}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Risk Analysis</CardTitle>
                    <CardDescription className="text-xs">
                      AI-powered risk assessment
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-400">Sharpe Ratio</span>
                        <Badge variant="default">{strategy?.sharpe_ratio ?? '—'}</Badge>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-400">Sortino Ratio</span>
                        <Badge variant="default">{strategy?.sortino_ratio ?? '—'}</Badge>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-400">Recovery Factor</span>
                        <Badge variant="default">{strategy?.recovery_factor ?? '—'}</Badge>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600 dark:text-gray-400">Consecutive Losses</span>
                        <Badge variant="outline">{strategy?.consecutive_losses ?? '—'}{strategy?.consecutive_losses ? ' max' : ''}</Badge>
                      </div>
                    </div>
                    
                    <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                      <h4 className="text-sm font-medium mb-2 text-gray-900 dark:text-white">Market Conditions Performance</h4>
                      
                      <div className="space-y-2">
                        <div>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-gray-600 dark:text-gray-400">Bull Market</span>
                            <span className="text-green-600">{strategy?.bull_market_performance ?? '—'}</span>
                          </div>
                          <Progress value={strategy?.bull_market_score ?? 0} className="h-1.5 bg-gray-200 dark:bg-gray-700">
                            <div className="h-full bg-green-500 rounded-full" />
                          </Progress>
                        </div>
                        
                        <div>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-gray-600 dark:text-gray-400">Bear Market</span>
                            <span className="text-amber-600">{strategy?.bear_market_performance ?? '—'}</span>
                          </div>
                          <Progress value={strategy?.bear_market_score ?? 0} className="h-1.5 bg-gray-200 dark:bg-gray-700">
                            <div className="h-full bg-amber-500 rounded-full" />
                          </Progress>
                        </div>
                        
                        <div>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="text-gray-600 dark:text-gray-400">Volatile Market</span>
                            <span className="text-blue-600">{strategy?.volatile_market_performance ?? '—'}</span>
                          </div>
                          <Progress value={strategy?.volatile_market_score ?? 0} className="h-1.5 bg-gray-200 dark:bg-gray-700">
                            <div className="h-full bg-blue-500 rounded-full" />
                          </Progress>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* AI Strategy Recommendations */}
                <Card className="border-blue-200 dark:border-blue-800">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center">
                      <Sparkles className="w-4 h-4 text-blue-600 mr-2" />
                      AI Strategy Recommendations
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {tier === 'elite' ? (
                      <>
                        {analysisLoading && (
                          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Analyzing strategy...
                          </div>
                        )}
                        {!analysisLoading && analysisError && (
                          <div className="text-sm text-red-600">{analysisError}</div>
                        )}
                        {!analysisLoading && !analysisError && Array.isArray(analysisImprovements) && analysisImprovements.length > 0 ? (
                          <div className="space-y-2">
                            {analysisImprovements.map((rec, idx) => (
                              <div key={idx} className="flex items-start gap-2">
                                <div className="mt-0.5"><div className="w-1.5 h-1.5 rounded-full bg-blue-600"></div></div>
                                <p className="text-sm text-gray-700 dark:text-gray-300 flex-1">{rec}</p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          !analysisLoading && !analysisError && (
                            <div className="text-sm text-gray-600 dark:text-gray-400">No recommendations yet</div>
                          )
                        )}
                      </>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-6 text-center space-y-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-dashed border-gray-200 dark:border-gray-700">
                        <div className="bg-blue-100 dark:bg-blue-900/30 p-3 rounded-full">
                          <Lock className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div className="max-w-xs mx-auto">
                          <p className="text-sm font-medium text-gray-900 dark:text-white">Elite Feature</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Upgrade to Elite to view AI-powered strategy recommendations.
                          </p>
                        </div>
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => onNavigate('subscription', 'plan-elite')}
                          className="border-blue-200 hover:bg-blue-50 text-blue-700"
                        >
                          Upgrade to Elite
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
                {/* Disclaimer */}
                <Card className="bg-amber-100 dark:bg-amber-900/40 border-amber-200/50 dark:border-amber-800/50">
                  <CardContent className="p-4">
                    <p className="text-xs text-amber-900 dark:text-amber-100">
                      <strong>Disclaimer:</strong> These are simulated metrics based on historical data and AI analysis. 
                      Past performance does not guarantee future results. Always conduct your own backtesting 
                      and forward testing before live trading.
                    </p>
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card style={glassCardStyle}>
                <CardContent className="p-6 flex flex-col items-center text-center">
                  <div className="bg-blue-100 dark:bg-blue-800 p-3 rounded-full mb-3">
                    <Lock className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                    Unlock Detailed Analysis
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 max-w-xs">
                    Upgrade to Pro to view detailed trade statistics, risk metrics, and AI recommendations.
                  </p>
                  <Button 
                    onClick={() => onNavigate('subscription', 'plan-pro')}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-8 h-12 w-[220px] shadow-lg text-base whitespace-nowrap"
                  >
                    Upgrade to Pro
                  </Button>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
      </div>
    </AnalyzeErrorBoundary>
  );
}

class AnalyzeErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error?: any }>{
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: undefined };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  componentDidCatch(error: any, info: any) {
    console.error('[Analyze] Render error', { error, info });
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400">Something went wrong rendering analysis.</p>
          </div>
        </div>
      );
    }
    return this.props.children as any;
  }
}
