import { useState, useEffect, useRef } from "react";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { ArrowLeft, Copy, Download, MessageSquare, CheckCircle2, Loader2, AlertCircle, RefreshCw, BarChart3, Lock, Code2, FileText } from "lucide-react";
import { ScrollArea } from "./ui/scroll-area";
import { Switch } from "./ui/switch";
import { Label } from "./ui/label";
import { projectId } from '../utils/supabase/info';
import { toast } from "../utils/tieredToast";
import { trackEvent } from "../utils/analytics";
import { getFunctionUrl } from '../utils/supabase/client';
 

interface CodeResultScreenProps {
  strategyId: string;
  onNavigate: (screen: string, strategyId?: string) => void;
  accessToken: string | null;
  isProUser: boolean;
  remainingGenerations: number;
  onGenerationCount: (kind: 'code' | 'analysis') => void;
}

// removed unused addLocalNotification import
import { MAJOR_PAIRS, MULTI_CURRENCY_LABEL } from '../utils/backtestPayload';
import { Header } from "./Header";
export function CodeResultScreen({ strategyId, onNavigate, accessToken, isProUser, remainingGenerations, onGenerationCount }: CodeResultScreenProps) {
  const [strategy, setStrategy] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryAttempts, setRetryAttempts] = useState(0);
  const [proRequired, setProRequired] = useState(false);
  const [usage, setUsage] = useState<{ count: number; remaining: number; window: string } | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [showGeneratedCode, setShowGeneratedCode] = useState(false);
  const readLocal = (key: string) => { try { const s = typeof window !== 'undefined' ? window.localStorage.getItem(key) : null; return s ? JSON.parse(s) : null; } catch { return null; } };

  const isManual = strategy?.strategy_type === 'manual';
  const statusNow = strategy?.status;
  const rawCode = String(strategy?.generated_code || strategy?.code || '');
  const rawPlan = String(strategy?.manual_trading_plan || strategy?.trading_plan || '');
  
  const hasErrorMarker = /Error generating code|Debug Information|Rate limit exceeded|Model not found/i.test(String(rawCode));
  const fenced = String(hasErrorMarker ? '' : rawCode);
  const m = fenced.match(/```[a-zA-Z0-9_\-\.\s]*\n([\s\S]*?)```/);
  const codeCandidate = (m && m[1] ? m[1] : fenced).trim();
  const codeHeuristic = /(OnInit\s*\(|OnTick\s*\(|#property|input\s+|strategy\s*\(|\/\/@version)/i.test(fenced);
  const planHeuristic = /(Entry|Exit|Risk|Psychology|Stop\s*Loss|Take\s*Profit|Rules|Management)/i.test(codeCandidate) || (codeCandidate.split('\n').filter((l) => l.trim().startsWith('- ')).length >= 3);
  const hasCodeDual = isManual ? !!(m || codeHeuristic) : !!fenced.trim().length;
  
  const showPlanView = !showGeneratedCode;
  const hasPlan = String(rawPlan || '').trim().length > 0;
  const planContent = String(rawPlan || '').trim();
  const contentToDisplay = showPlanView ? planContent : (m ? m[1].trim() : fenced.trim());
  const codeText = statusNow === 'pending' || statusNow === 'generating' ? 'Generating...' : (contentToDisplay || '');
  
  const codeBoxHeights = 'h-[300px]';
  const showInlineActions = true;

  // Local guard to prevent duplicate auto-analysis triggers from multiple screens
  const analysisFlagKey = (id: string) => `analysis_started:${id}`;
  const markAnalysisStarted = (id: string) => {
    try { if (typeof window !== 'undefined') window.localStorage.setItem(analysisFlagKey(id), String(Date.now())); } catch {}
  };
  const hasAnalysisStarted = (id: string) => {
    try { return typeof window !== 'undefined' && !!window.localStorage.getItem(analysisFlagKey(id)); } catch { return false; }
  };

  const fetchUsage = async () => {
    if (!accessToken) {
      setUsage(null);
      return;
    }
    setUsageLoading(true);
    try {
      const headers: Record<string, string> = { 'Accept': 'application/json' };
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
      const url = getFunctionUrl('make-server-00a119be/usage');
      const res = await fetch(url, { headers });
      if (res.ok) {
        const data = await res.json();
        if (data?.usage) setUsage(data.usage);
      }
    } catch (err) {
      console.warn('[Usage] Failed to fetch usage', err);
    } finally {
      setUsageLoading(false);
    }
  };

  const statusRef = useRef<string | undefined>(undefined);
  useEffect(() => { statusRef.current = strategy?.status; }, [strategy?.status]);

  useEffect(() => {
    loadStrategy();
    fetchUsage();
    const interval = setInterval(() => {
      const s = statusRef.current;
      if (s === 'pending' || s === 'generating') {
        loadStrategy();
      }
    }, 8000);
    return () => clearInterval(interval);
  }, [strategyId]);

  // Optional hint to force a tab on entry
  useEffect(() => {
    try {
      if (typeof window === 'undefined') return;
      const hint = window.localStorage.getItem('result:show');
      if (hint === 'code') setShowGeneratedCode(true);
      if (hint === 'plan') setShowGeneratedCode(false);
      if (hint) window.localStorage.removeItem('result:show');
    } catch {}
  }, []);

  useEffect(() => {
    const key = `strategy_code:${strategyId}`;
    const keyPlan = `strategy_plan:${strategyId}`;
    const handler = (e: StorageEvent) => {
      if (e.key === key) {
        try {
          const nextCode = e.newValue ? JSON.parse(e.newValue) : null;
          if (nextCode && typeof nextCode === 'string') {
            setStrategy((prev: any) => prev ? { ...prev, code: nextCode } : prev);
          }
        } catch {}
      }
      if (e.key === keyPlan) {
        try {
          const nextPlan = e.newValue ? JSON.parse(e.newValue) : null;
          if (nextPlan && typeof nextPlan === 'string') {
            setStrategy((prev: any) => prev ? { ...prev, manual_trading_plan: nextPlan } : prev);
          }
        } catch {}
      }
    };
    if (typeof window !== 'undefined') window.addEventListener('storage', handler);
    return () => { if (typeof window !== 'undefined') window.removeEventListener('storage', handler); };
  }, [strategyId]);

  // Keep lastSelectedStrategyId fresh on this screen and timestamp it
  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && strategyId) {
        window.localStorage.setItem('lastSelectedStrategyId', JSON.stringify(strategyId));
        window.localStorage.setItem('lastSelectedStrategyAt', String(Date.now()));
      }
    } catch {}
  }, [strategyId]);

  // If ever rendered without a strategyId (future-proof), clear stale local storage every 30s
  useEffect(() => {
    if (strategyId) return;
    const iv = setInterval(() => {
      try {
        if (typeof window === 'undefined') return;
        const lastAt = Number(window.localStorage.getItem('lastSelectedStrategyAt') || '0');
        if (!lastAt) return;
        const elapsed = Date.now() - lastAt;
        if (elapsed >= 30000) {
          window.localStorage.removeItem('lastSelectedStrategyId');
          window.localStorage.removeItem('lastSelectedStrategyAt');
        }
      } catch {}
    }, 30000);
    return () => clearInterval(iv);
  }, [strategyId]);

  useEffect(() => {
    if (strategyId) return;
    try {
      if (typeof window === 'undefined') return;
      const lastAt = Number(window.localStorage.getItem('lastSelectedStrategyAt') || '0');
      if (!lastAt) return;
      const elapsed = Date.now() - lastAt;
      if (elapsed >= 30000) {
        window.localStorage.removeItem('lastSelectedStrategyId');
        window.localStorage.removeItem('lastSelectedStrategyAt');
      }
    } catch {}
  }, [strategyId]);

  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (!e.key || !e.newValue) return;
      if (!e.key.startsWith('local-notifications:')) return;
      try {
        const arr = JSON.parse(e.newValue || '[]');
        const match = Array.isArray(arr) && arr.find((n: any) => String(n?.type) === 'analysis_update' && String(n?.strategyId) === String(strategyId));
        if (match) {
          loadStrategy();
        }
      } catch {}
    };
    if (typeof window !== 'undefined') window.addEventListener('storage', handler);
    return () => { if (typeof window !== 'undefined') window.removeEventListener('storage', handler); };
  }, [strategyId]);

  useEffect(() => {
    const handler = (e: Event) => {
      try {
        const detail: any = (e as CustomEvent).detail || {};
        if (String(detail?.strategyId) === String(strategyId)) {
          loadStrategy();
        }
      } catch {}
    };
    if (typeof window !== 'undefined') window.addEventListener('ea:analysis_update', handler as EventListener);
    return () => { if (typeof window !== 'undefined') window.removeEventListener('ea:analysis_update', handler as EventListener); };
  }, [strategyId]);

  const loadStrategy = async () => {
    try {
      const url = getFunctionUrl(`make-server-00a119be/strategies/${strategyId}`);
      const headers: Record<string, string> = {};
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }

      console.log('[CodeResult] Request start', { url, headers });

      const response = await fetch(url, { headers });
      
      if (response.ok) {
        const data = await response.json();
        const localCode = readLocal(`strategy_code:${strategyId}`);
        const localPlan = readLocal(`strategy_plan:${strategyId}`);
        let next = localCode && typeof localCode === 'string' ? { ...data, code: localCode } : data;
        if (localPlan && typeof localPlan === 'string') next = { ...next, manual_trading_plan: localPlan };
        setStrategy((prev: any) => {
          const nextHasPlan = !!String(next?.manual_trading_plan || next?.trading_plan || '').trim().length;
          const nextHasCode = !!String(next?.generated_code || next?.code || '').trim().length;
          let merged: any = { ...next };
          if (!nextHasPlan && nextHasCode) {
            const candidate = String(next?.generated_code || next?.code || '');
            const looksLikeCode = /(OnInit\s*\(|OnTick\s*\(|#property|input\s+|strategy\s*\(|\/\/@version)/i.test(candidate);
            const looksLikePlan = /(Entry|Exit|Risk|Psychology|Stop\s*Loss|Take\s*Profit|Rules|Management)/i.test(candidate) || (candidate.split('\n').filter((l) => l.trim().startsWith('- ')).length >= 3);
            const isManualNext = String(next?.strategy_type || next?.platform || '').toLowerCase().includes('manual');
            if (!looksLikeCode && looksLikePlan) {
              merged = { ...merged, manual_trading_plan: candidate };
              if (isManualNext) {
                delete merged.generated_code;
                delete merged.code;
              }
            }
          }
          if (!nextHasPlan && prev) {
            const prevPlan = String(prev?.manual_trading_plan || prev?.trading_plan || '').trim();
            if (prevPlan) merged = { ...merged, manual_trading_plan: prevPlan };
          }
          if (!nextHasCode && prev) {
            const prevCode = String(prev?.generated_code || prev?.code || '').trim();
            if (prevCode) merged = { ...merged, code: prevCode };
          }
          // Ensure manual strategies do not treat plan-like text as code: clear misleading code content
          try {
            const isManualMerged = String(merged?.strategy_type || merged?.platform || '').toLowerCase().includes('manual');
            if (isManualMerged) {
              const planText2 = String(merged?.manual_trading_plan || merged?.trading_plan || '').trim();
              const codeText2 = String(merged?.generated_code || merged?.code || '').trim();
              if (codeText2) {
                const codeFenced2 = /```[a-zA-Z0-9_\-\.\s]*\n([\s\S]*?)```/.test(codeText2);
                const codeTokens2 = /(OnInit\s*\(|OnTick\s*\(|#property|input\s+|strategy\s*\(|\/\/@version)/i.test(codeText2);
                const planLike2 = /(Entry|Exit|Risk|Psychology|Stop\s*Loss|Take\s*Profit|Rules|Management)/i.test(codeText2) || (codeText2.split('\n').filter((l) => l.trim().startsWith('- ')).length >= 3);
                if (!codeFenced2 && !codeTokens2 && (planText2 || planLike2)) {
                  delete merged.generated_code;
                  delete merged.code;
                }
              }
            }
          } catch {}
          return merged;
        });
      } else {
        const contentType = response.headers.get('content-type') || '';
        const errorText = await response.text();
        console.error('[CodeResult] Response error', {
          url,
          status: response.status,
          statusText: response.statusText,
          contentType,
          bodyPreview: errorText.slice(0, 500)
        });
        if (response.status === 404) {
          toast.error('Strategy not found');
        } else if (response.status === 401) {
          toast.error('Unauthorized – please sign in again');
        } else if (response.status === 403) {
          const msg = 'You have reached your strategy creation limit. Upgrade to Pro for 10 generations or Elite for unlimited access.';
          // Optionally guide users without disruptive toasts
          // Keep the UI responsive by navigating to subscription
          setTimeout(() => onNavigate('subscription'), 1000);
        } else {
          toast.error(`Failed to load strategy (${response.status})`);
        }
      }
    } catch (error) {
      console.error('Failed to load strategy:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Fallback: if analysis metrics are absent, trigger background analysis with retries (non-blocking)
  useEffect(() => {
    if (!strategyId || !strategy) return;
    const hasMetrics = (
      strategy?.win_rate !== undefined ||
      strategy?.profit_factor !== undefined ||
      strategy?.max_drawdown !== undefined ||
      strategy?.expected_return !== undefined
    );
    if (hasMetrics) return;
    if (hasAnalysisStarted(strategyId)) return;
    const url = getFunctionUrl(`make-server-00a119be/strategies/${strategyId}/reanalyze`);
    const headers: Record<string, string> = {};
    if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

    const attemptDelays = [0, 3000, 8000, 20000, 45000];
    const triggerAttempt = (attempt: number) => {
      try {
        fetch(url, { method: 'POST', headers })
          .then(async (res) => {
            if (!res.ok) {
              const t = await res.text();
              console.warn('[Analyze][Auto][CodeResult] Response error', {
                status: res.status,
                statusText: res.statusText,
                bodyPreview: t.slice(0, 400),
              });
              if (attempt + 1 < attemptDelays.length) {
                const delay = attemptDelays[attempt + 1];
                setTimeout(() => triggerAttempt(attempt + 1), delay);
              }
              return;
            }
            markAnalysisStarted(strategyId);
            onGenerationCount('analysis');
          })
          .catch((err) => {
            console.warn('[Analyze][Auto][CodeResult] Exception', err);
            if (attempt + 1 < attemptDelays.length) {
              const delay = attemptDelays[attempt + 1];
              setTimeout(() => triggerAttempt(attempt + 1), delay);
            }
          });
      } catch (err) {
        console.warn('[Analyze][Auto][CodeResult] Failed to schedule', err);
      }
    };

    // Fire-and-forget; do not await
    setTimeout(() => triggerAttempt(0), attemptDelays[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strategyId, strategy]);

  useEffect(() => {
    try {
      if (typeof window === 'undefined') return;
      if (strategyId && strategy) {
        const codeVal = String(strategy?.generated_code || strategy?.code || '').trim();
        const planVal = String(strategy?.manual_trading_plan || strategy?.trading_plan || '').trim();
        if (codeVal) window.localStorage.setItem(`strategy_code:${strategyId}`, JSON.stringify(codeVal));
        if (planVal) window.localStorage.setItem(`strategy_plan:${strategyId}`, JSON.stringify(planVal));
        const hasPlanLocal = !!planVal.length;
        const codeFencedLocal = /```[a-zA-Z0-9_\-\.\s]*\n([\s\S]*?)```/.test(codeVal);
        const codeTokensLocal = /(OnInit\s*\(|OnTick\s*\(|#property|input\s+|strategy\s*\(|\/\/@version)/i.test(codeVal);
        const hasCodeLocal = !!(codeFencedLocal || codeTokensLocal);
        const isDualLocal = hasPlanLocal && hasCodeLocal;
        const fallbackTypeLocal = isManual ? 'MANUAL' : 'AUTOMATED';
        const labelLocal = isDualLocal ? 'DUAL' : (hasPlanLocal ? 'MANUAL' : (hasCodeLocal ? 'AUTOMATED' : fallbackTypeLocal));
        window.localStorage.setItem(`strategy_label:${strategyId}`, labelLocal);
        window.localStorage.setItem(`strategy_has_code:${strategyId}`, hasCodeLocal ? '1' : '0');
        window.localStorage.setItem(`strategy_has_plan:${strategyId}`, hasPlanLocal ? '1' : '0');
      }
    } catch {}
  }, [strategyId, strategy?.generated_code, strategy?.code, strategy?.manual_trading_plan, strategy?.trading_plan]);

  const copyCode = () => {
    const codeText = strategy?.generated_code || strategy?.code;
    if (codeText) {
      navigator.clipboard.writeText(codeText);
      toast.success("Code copied to clipboard!");
    }
  };

  const downloadCode = () => {
    if (!isProUser) {
      toast.error('Upgrade to Pro to download source files');
      return;
    }
    const codeText = strategy?.generated_code || strategy?.code;
    if (!codeText) return;
    
    const extensions: Record<string, string> = {
      mql4: 'mq4',
      mql5: 'mq5',
      pinescript: 'pine'
    };
    
    const ext = extensions[strategy.platform] || 'txt';
    const filename = `${strategy.strategy_name || 'strategy'}.${ext}`;
    
    const blob = new Blob([codeText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    
    toast.success(`Downloaded ${filename}`);
  };

  useEffect(() => {
    if (strategy?.status === 'generated' && !isManual) {
      setShowGeneratedCode(true);
    }
  }, [strategy?.status, isManual]);

  useEffect(() => {
    if (strategy?.status === 'generated' && isManual) {
       const trackKey = `tracked_manual_${strategy.id}`;
       if (!readLocal(trackKey)) {
         trackEvent('manual_plan_generated', { strategyId: strategy.id });
         if (typeof window !== 'undefined') window.localStorage.setItem(trackKey, 'true');
       }
    }
  }, [strategy?.status, isManual, strategy?.id]);

  const handleAutomate = () => {
    console.log('[CodeResult] handleAutomate triggered for strategyId:', strategyId);
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('reset-indicators-on-new-strategy', '1');
        try {
          const snap = {
            strategy_name: strategy?.strategy_name || '',
            description: strategy?.description || '',
            risk_management: strategy?.risk_management || '',
            platform: strategy?.platform || '',
            indicators: Array.isArray(strategy?.indicators) ? strategy.indicators : [],
            instrument: strategy?.instrument || '',
            analysis_instrument: strategy?.analysis_instrument || '',
            strategy_type: strategy?.strategy_type || ''
          };
          window.localStorage.setItem(`strategy_snapshot:${strategyId}`, JSON.stringify(snap));
        } catch {}
        // If code already exists, stay on this screen and show code tab
        const possibleCode = String(strategy?.generated_code || strategy?.code || '');
        const hasFenced = /```/.test(possibleCode);
        const hasCode = isManual ? hasFenced : !!(strategy?.generated_code || strategy?.code);
        if (hasCode) {
          window.localStorage.setItem('result:show', 'code');
          setShowGeneratedCode(true);
          return;
        }
        window.localStorage.setItem('submit:targetType', 'automated');
        window.localStorage.setItem('submit:initId', String(strategyId));
      }
    } catch (e) {
      console.error('[CodeResult] Failed to set localStorage flags', e);
    }
    // Navigate to submit only if we need to create/generate code
    const possibleCode = String(strategy?.generated_code || strategy?.code || '');
    const hasFenced = /```/.test(possibleCode);
    const hasCode = isManual ? hasFenced : !!(strategy?.generated_code || strategy?.code);
    if (!hasCode) onNavigate('submit', strategyId);
  };

  const renderManualPlan = (text: string) => {
    if (!text) return <p className="text-sm text-gray-500">No plan generated.</p>;
    
    // Simple parser for bold headers and bullets
    return text.split('\n').map((line, i) => {
      const trimmed = line.trim();
      if (!trimmed) return <div key={i} className="h-2" />;
      
      // Headers (bold lines)
      if (trimmed.startsWith('**') || (trimmed.includes('**') && !trimmed.startsWith('-'))) {
        const content = trimmed.replace(/\*\*/g, '');
        return (
          <h3 key={i} className="font-bold text-lg mt-4 mb-2 text-gray-900 dark:text-white">
            {content}
          </h3>
        );
      }
      
      // Bullet points
      if (trimmed.startsWith('- ')) {
        const content = trimmed.substring(2);
        const parts = content.split('**');
        return (
          <div key={i} className="flex items-start gap-2 mb-2 ml-1">
            <div className="min-w-[6px] h-[6px] rounded-full bg-blue-500 mt-2" />
            <p className="text-sm text-gray-700 dark:text-gray-300 flex-1">
              {parts.map((part, idx) => 
                idx % 2 === 1 ? <span key={idx} className="font-semibold text-gray-900 dark:text-gray-100">{part}</span> : part
              )}
            </p>
          </div>
        );
      }
      
      return <p key={i} className="text-sm text-gray-700 dark:text-gray-300 mb-2">{trimmed}</p>;
    });
  };

  const retryGeneration = async () => {
    // Mirror SubmitStrategyScreen.tsx submission format exactly
    if (!accessToken) {
      toast.error('Please sign in to submit strategy');
      return;
    }

    // Validation rules identical to initial submission
    const name = strategy?.strategy_name || 'Untitled Strategy';
    const description = strategy?.description || '';
    const risk_management = strategy?.risk_management || '';
    // Normalize to canonical symbol or multi-currency label
    const rawInstrument = strategy?.analysis_instrument || strategy?.instrument || 'EURUSD';
    const normalizedInstrument = (() => {
      if (!rawInstrument) return 'EURUSD';
      const trimmed = String(rawInstrument).trim();
      if (trimmed === MULTI_CURRENCY_LABEL) return MULTI_CURRENCY_LABEL;
      const parenIdx = trimmed.indexOf('(');
      const spaceIdx = trimmed.indexOf(' ');
      const cutIdx = parenIdx >= 0 ? parenIdx : (spaceIdx >= 0 ? spaceIdx : -1);
      return cutIdx >= 0 ? trimmed.slice(0, cutIdx).trim() : trimmed;
    })();
    const instrumentForCode = normalizedInstrument === MULTI_CURRENCY_LABEL
      ? MAJOR_PAIRS.join(', ')
      : normalizedInstrument;
    const platform = strategy?.platform || '';

    if (description.length < 20) {
      toast.error('Strategy description must be at least 20 characters');
      return;
    }
    if (!platform) {
      toast.error('Please select a platform');
      return;
    }

    setIsRetrying(true);
    setRetryAttempts((n) => n + 1);

    try {
      const headers: Record<string, string> = {
        'Accept': 'application/json',
      };
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }
      const url = getFunctionUrl(`make-server-00a119be/strategies/${strategyId}/retry`);

      const response = await fetch(url, {
        method: 'POST',
        headers,
      });

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 403) {
          setTimeout(() => onNavigate('subscription'), 1200);
          setTimeout(() => onNavigate('subscription'), 1200);
          setIsRetrying(false);
          return;
        }
        if (response.status === 429) {
          toast.error('Retry too frequent. Try again shortly.');
          setIsRetrying(false);
          return;
        }
        try {
          const errorJson = JSON.parse(errorText);
          throw new Error(errorJson.error || `Request failed (${response.status})`);
        } catch {
          throw new Error(`Request failed (${response.status}): ${errorText.slice(0, 200)}`);
        }
      }

      const data = await response.json();
      toast.success('Retry started. Updating metrics in background...');
      loadStrategy();
      try {
        const analyzeUrl = getFunctionUrl(`make-server-00a119be/strategies/${strategyId}/reanalyze`);
        const analyzeHeaders: Record<string, string> = {};
        if (accessToken) analyzeHeaders['Authorization'] = `Bearer ${accessToken}`;
        fetch(analyzeUrl, { method: 'POST', headers: analyzeHeaders })
          .then(async (res) => {
            if (!res.ok) {
              return;
            }
            onGenerationCount('analysis');
          })
          .catch(() => {});
      } catch (_) {}
    } catch (error: any) {
      if (typeof error?.message === 'string' && error.message.includes('Free tier limit reached — upgrade to continue')) {
        setTimeout(() => onNavigate('subscription'), 1200);
      } else {
        toast.error(error.message || 'Failed to start retry');
      }
    } finally {
      setIsRetrying(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center flex flex-col items-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Loading strategy...</p>
        </div>
      </div>
    );
  }

  // Pro gating UI removed; always show result content

  const glassCardStyle: React.CSSProperties = {
    backdropFilter: 'blur(10px)',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    border: '1px solid rgba(255, 255, 255, 0.18)',
    borderRadius: '25px',
    boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.37)',
  };

  if (!strategy) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card style={glassCardStyle} className="max-w-md sm:max-w-lg md:max-w-xl lg:max-w-2xl xl:max-w-3xl w-full">
          <CardContent className="p-6 text-center">
            <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-4" />
            <h3 className="text-lg mb-2 text-gray-900 dark:text-white">Strategy Not Found</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              The requested strategy could not be loaded.
            </p>
            <Button onClick={() => onNavigate('home')}>
              Return to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header
        title={strategy.strategy_name || 'Strategy'}
        onBack={() => onNavigate('home')}
        bgClassName="bg-gradient-to-r from-blue-600 to-blue-800"
        textClassName="text-white"
        borderClassName=""
        paddingClassName="p-4 pb-10"
        rightContent={
          <div className="flex items-center gap-2">
            {(() => {
              const hasPlan = !!String(strategy?.manual_trading_plan || strategy?.trading_plan || '').trim().length;
              const hasCode = hasCodeDual;
              const isDual = !!(hasPlan && hasCode);
              const fallbackType = isManual ? 'MANUAL' : 'AUTOMATED';
              const label = isDual ? 'DUAL' : (hasPlan ? 'MANUAL' : (hasCode ? 'AUTOMATED' : fallbackType));
              return (
                <Badge variant={isDual ? "default" : "outline"} className="text-xs">
                  {label}
                </Badge>
              );
            })()}
            {(strategy.status === 'generated' || strategy.status === 'completed') && (
              <Badge variant="default" className="text-xs">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                Ready
              </Badge>
            )}
            {(strategy.status === 'pending' || strategy.status === 'generating') && (
              <Badge variant="secondary" className="text-xs">
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                Generating
              </Badge>
            )}
            {strategy.status === 'error' && (
              <Badge variant="destructive" className="text-xs">
                <AlertCircle className="w-3 h-3 mr-1" />
                Failed
              </Badge>
            )}
          </div>
        }
      />

      {/* Content */}
        <div className="app-container flex-1 px-[9px] py-4 safe-nav-pad space-y-8">
        {/* Strategy Description */}
        <Card style={glassCardStyle} className="mt-8 mb-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Strategy Description</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              {strategy.description}
            </p>
            {strategy.risk_management && (
              <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Risk Management:</p>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  {strategy.risk_management}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Segmented Toggle for Manual/Generated */}
        {
          <div 
            className="flex p-1 bg-gray-100 dark:bg-gray-800/50 mb-4 border border-gray-200/50 dark:border-gray-700/50"
            style={{ borderRadius: '30px' }}
          >
            <button
              type="button"
              onClick={() => setShowGeneratedCode(false)}
              className={`flex-1 py-2 px-4 text-sm font-medium transition-all duration-200 ${
                !showGeneratedCode
                  ? "bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
              }`}
              style={{ borderRadius: '30px' }}
            >
              Trading Plan
            </button>
            <button
              type="button"
              onClick={() => {
                setShowGeneratedCode(true);
              }}
              className={`flex-1 py-2 px-4 text-sm font-medium transition-all duration-200 ${
                showGeneratedCode
                  ? "bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
              }`}
              style={{ borderRadius: '30px' }}
            >
              Generated Code
            </button>
          </div>
        }

        {strategy.status === 'pending' && (
          <Card style={glassCardStyle} className="mb-8">
            <CardContent className="p-8 text-center">
              <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
              <h3 className="text-lg mb-2 text-gray-900 dark:text-white">Generating Your Code</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Our AI is creating your Expert Advisor. This usually takes 10-15 seconds...
              </p>
            </CardContent>
          </Card>
        )}

        {strategy.status === 'error' && (
          <Card style={glassCardStyle} className="mb-8">
            <CardContent className="p-6 text-center">
              <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-4" />
              <h3 className="text-lg mb-2 text-gray-900 dark:text-white">Generation Failed</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                There was an error generating your code. You can retry the generation or create a new strategy.
              </p>
              <div className="flex flex-row items-center justify-center gap-2 sm:gap-3 md:gap-4 w-full flex-nowrap">
                <Button 
                  onClick={retryGeneration} 
                  variant="default"
                  disabled={isRetrying}
                  className="flex items-center justify-center gap-2 h-9 px-4 py-2.5 flex-1 sm:flex-none min-w-0"
                >
                  {isRetrying ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  {isRetrying ? 'Retrying...' : 'Retry Generation'}
                </Button>
                <Button
                  onClick={() => {
                    try {
                      if (typeof window !== 'undefined') {
                        window.localStorage.setItem('reset-indicators-on-new-strategy', '1');
                        window.localStorage.removeItem('submit:targetType');
                        window.localStorage.removeItem('submit:initId');
                        window.localStorage.removeItem('lastSelectedStrategyId');
                      }
                    } catch {}
                    onNavigate('submit');
                  }}
                  variant="outline"
                  className="h-9 px-4 py-2.5 flex-1 sm:flex-none min-w-0"
                >
                  New Strategy
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card style={glassCardStyle} className="mb-8">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">{showPlanView ? 'Trading Plan' : 'Generated Code'}</CardTitle>
                <CardDescription>
                  {strategy.status === 'pending' || strategy.status === 'generating'
                    ? (showPlanView ? 'Creating your plan...' : 'Generating code...')
                    : (showPlanView 
                      ? (isManual ? 'Structured Manual Trading Plan' : 'Structured Trading Plan') 
                      : `Production-ready ${String(strategy.platform || '').toUpperCase()} code`)}
                </CardDescription>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex gap-2">
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={() => {
                      const text = showPlanView ? (rawPlan || '') : (strategy?.generated_code || strategy?.code || '');
                      if (text) {
                        navigator.clipboard.writeText(text);
                        toast.success(showPlanView ? "Plan copied to clipboard!" : "Code copied to clipboard!");
                      }
                    }} 
                    disabled={(strategy.status === 'pending' || strategy.status === 'generating') || (showPlanView && !planContent)}
                  >
                    <Copy className="w-4 h-4" />
                    <span className="ml-2 hidden sm:inline">{showPlanView ? 'Copy Plan' : 'Copy Code'}</span>
                  </Button>
                  {(showGeneratedCode) && (
                    <Button size="sm" variant="outline" onClick={downloadCode} disabled={strategy.status === 'pending' || strategy.status === 'generating'}>
                      <Download className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className={`${(showGeneratedCode) ? codeBoxHeights : ''} w-full rounded-md border border-gray-200 dark:border-gray-700 ${(showPlanView) ? 'bg-white/50 dark:bg-black/20 p-4' : ''}`}>
              {showPlanView ? (
                planContent ? (
                  <div className="prose dark:prose-invert max-w-none">
                    {renderManualPlan(planContent)}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center w-full min-h-[300px] text-center pt-16 pb-10">
                    <FileText className="w-10 h-10 text-blue-500 mb-3" />
                    <p className="text-sm text-gray-700 dark:text-gray-300 mb-4">
                      {isManual ? 'No manual trading plan yet' : 'No trading plan generated yet for this automated strategy'}
                    </p>
                    <Button 
                      onClick={() => {
                        if (hasPlan) {
                          try { if (typeof window !== 'undefined') window.localStorage.setItem('result:show', 'plan'); } catch {}
                          setShowGeneratedCode(false);
                          return;
                        }
                        try { 
                          if (typeof window !== 'undefined') {
                            window.localStorage.setItem('submit:targetType', 'manual');
                            window.localStorage.setItem('submit:initId', String(strategyId));
                            window.localStorage.setItem('result:show', 'plan');
                            try {
                              const snap = {
                                strategy_name: strategy?.strategy_name || '',
                                description: strategy?.description || '',
                                risk_management: strategy?.risk_management || '',
                                platform: strategy?.platform || '',
                                indicators: Array.isArray(strategy?.indicators) ? strategy.indicators : [],
                                instrument: strategy?.instrument || '',
                                analysis_instrument: strategy?.analysis_instrument || '',
                                strategy_type: strategy?.strategy_type || ''
                              };
                              window.localStorage.setItem(`strategy_snapshot:${strategyId}`, JSON.stringify(snap));
                            } catch {}
                          }
                        } catch {}
                        onNavigate('submit', strategyId);
                      }} 
                      className="bg-gradient-to-r from-blue-600 to-blue-800 hover:from-blue-700 hover:to-blue-900 text-white"
                    >
                      <span className="px-4">Generate Trading Plan</span>
                    </Button>
                  </div>
                )
              ) : (
                hasCodeDual ? (
                  <pre className="p-4 text-xs max-w-full overflow-x-auto">
                    <code className="text-gray-800 dark:text-gray-200 whitespace-pre">
                      {codeText}
                    </code>
                  </pre>
                ) : (
                  isManual ? (
                    <div className="flex flex-col items-center justify-center w-full min-h-[300px] text-center pt-16 pb-10">
                      <FileText className="w-10 h-10 text-blue-500 mb-3" />
                      <p className="text-sm text-gray-700 dark:text-gray-300 mb-4">
                        No code generated yet for this manual strategy
                      </p>
                      <Button
                        onClick={handleAutomate}
                        disabled={strategy.status === 'pending' || strategy.status === 'generating'}
                        className="bg-gradient-to-r from-blue-600 to-blue-800 hover:from-blue-700 hover:to-blue-900 text-white"
                      >
                        <span className="px-4">Generate Code</span>
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center w-full min-h-[300px] text-center pt-16 pb-10">
                      <FileText className="w-10 h-10 text-blue-500 mb-3" />
                      <p className="text-sm text-gray-700 dark:text-gray-300 mb-4">
                        No code available
                      </p>
                    </div>
                  )
                )
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {showInlineActions && (
          <div className="mt-6 sm:mt-8 lg:mt-10 mb-6 sm:mb-8 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => onNavigate('chat', strategyId)}
                disabled={strategy.status === 'pending' || strategy.status === 'generating'}
              >
                <MessageSquare className="w-4 h-4 mr-2" />
                Refine Code
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => onNavigate('analyze', strategyId)}
                disabled={strategy.status === 'pending' || strategy.status === 'generating'}
              >
                <BarChart3 className="w-4 h-4 mr-2" />
                View Analysis
              </Button>
            </div>
          </div>
        )}

        {/* Actions */}
        {!showInlineActions && (
        <div className="grid grid-cols-2 gap-3 mb-8">
          {isManual ? (
            null
          ) : (
            <>
              <Button
                variant="outline"
                className="w-full"
                style={{ width: 'calc(100% - 8px)' }}
                onClick={() => onNavigate('chat', strategyId)}
                disabled={strategy.status === 'pending' || strategy.status === 'generating'}
              >
                <MessageSquare className="w-4 h-4 mr-2" />
                Refine Code
              </Button>
              <Button
                variant="outline"
                className="w-full"
                style={{ width: 'calc(100% - 8px)' }}
                onClick={() => onNavigate('analyze', strategyId)}
                disabled={strategy.status === 'pending' || strategy.status === 'generating'}
              >
                <BarChart3 className="w-4 h-4 mr-2" />
                View Analysis
              </Button>
            </>
          )}
        </div>
        )}

        {/* Instructions */}
        <Card style={glassCardStyle} className="mb-8">
          <CardHeader>
            <CardTitle className="text-sm">
              {showPlanView ? 'Trading Plan Instructions' : 'How to Use This Code'}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-gray-800 dark:text-gray-200 space-y-2">
            {showPlanView ? (
              <>
                <p>1. <strong>Review:</strong> Read through the Entry and Exit rules carefully.</p>
                <p>2. <strong>Test:</strong> Open your chart and backtest these rules visually on historical data.</p>
                <p>3. <strong>Execute:</strong> Follow the Psychology & Risk Management tips when trading live.</p>
                <p>4. <strong>Automate:</strong> When ready, use the "Automate This Strategy" button to convert this into an EA.</p>
              </>
            ) : (
              strategy.platform === 'pinescript' ? (
                <>
                  <p>1. Open TradingView and go to Pine Editor</p>
                  <p>2. Create a new indicator/strategy</p>
                  <p>3. Paste the code and click "Save"</p>
                  <p>4. Add to chart and configure settings</p>
                </>
              ) : (
                <>
                  <p>1. Open MetaTrader {strategy.platform === 'mql4' ? '4' : '5'}</p>
                  <p>2. Go to File → Open Data Folder → MQL{strategy.platform === 'mql4' ? '4' : '5'} → Experts</p>
                  <p>3. Save the downloaded file in this folder</p>
                  <p>4. Restart MetaTrader and find your EA in the Navigator</p>
                </>
              )
            )}
          </CardContent>
        </Card>

        {/* Safety Warning */}
        <Card style={glassCardStyle}>
          <CardContent className="p-4">
            <p className="text-xs text-amber-900 dark:text-amber-100">
              <strong>⚠️ Safety First:</strong> Always test this strategy on a demo account 
              before using real money. Verify all logic and risk parameters manually.
            </p>
          </CardContent>
        </Card>
      </div>
      </div>
  );
}
