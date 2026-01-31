import { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { ArrowLeft, Copy, Download, MessageSquare, CheckCircle2, Loader2, AlertCircle, RefreshCw, BarChart3 } from "lucide-react";
import { ScrollArea } from "./ui/scroll-area";
import { projectId } from '../utils/supabase/info';
import { toast } from "../utils/tieredToast";
import { getFunctionUrl } from '../utils/supabase/client';
 

interface CodeResultScreenProps {
  strategyId: string;
  onNavigate: (screen: string, strategyId?: string) => void;
  accessToken: string | null;
  isProUser: boolean;
  remainingGenerations: number;
  onGenerationCount: (kind: 'code' | 'analysis') => void;
}

import { addLocalNotification } from '../utils/notifications';
import { MAJOR_PAIRS, MULTI_CURRENCY_LABEL } from '../utils/backtestPayload';
export function CodeResultScreen({ strategyId, onNavigate, accessToken, isProUser, remainingGenerations, onGenerationCount }: CodeResultScreenProps) {
  const [strategy, setStrategy] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryAttempts, setRetryAttempts] = useState(0);
  const [proRequired, setProRequired] = useState(false);
  const [usage, setUsage] = useState<{ count: number; remaining: number; window: string } | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const readLocal = (key: string) => { try { const s = typeof window !== 'undefined' ? window.localStorage.getItem(key) : null; return s ? JSON.parse(s) : null; } catch { return null; } };

  const statusNow = strategy?.status;
  const rawCode = statusNow === 'pending' || statusNow === 'generating' ? '' : (strategy?.code || strategy?.generated_code || '');
  const hasErrorMarker = /Error generating code|Debug Information|Rate limit exceeded|Model not found/i.test(String(rawCode));
  const fenced = String(hasErrorMarker ? '' : rawCode);
  const m = fenced.match(/```[a-zA-Z0-9_\-\.\s]*\n([\s\S]*?)```/);
  const codeText = statusNow === 'pending' || statusNow === 'generating' ? 'Generating...' : ((m ? m[1].trim() : fenced.trim()) || '// No code generated');
  const codeBoxHeights = 'h-[300px]';

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

  useEffect(() => {
    loadStrategy();
    fetchUsage();
    const interval = setInterval(() => {
      if (strategy?.status === 'pending' || strategy?.status === 'generating') {
        loadStrategy();
      }
    }, 3000);
    
    return () => clearInterval(interval);
  }, [strategyId, strategy?.status]);

  useEffect(() => {
    const key = `strategy_code:${strategyId}`;
    const handler = (e: StorageEvent) => {
      if (e.key === key) {
        try {
          const nextCode = e.newValue ? JSON.parse(e.newValue) : null;
          if (nextCode && typeof nextCode === 'string') {
            setStrategy((prev: any) => prev ? { ...prev, code: nextCode } : prev);
          }
        } catch {}
      }
    };
    if (typeof window !== 'undefined') window.addEventListener('storage', handler);
    return () => { if (typeof window !== 'undefined') window.removeEventListener('storage', handler); };
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
        if (localCode && typeof localCode === 'string') {
          setStrategy({ ...data, code: localCode });
        } else {
          setStrategy(data);
        }
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
      <div className="min-h-screen bg-background flex flex-col">
        <div className="text-center">
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
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4 pb-10 sticky top-0 z-10">
        <div className="max-w-md sm:max-w-lg md:max-w-xl lg:max-w-2xl xl:max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center flex-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onNavigate('home')}
              className="mr-3"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-lg text-gray-900 dark:text-white">
                {strategy.strategy_name || 'Strategy'}
              </h1>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {strategy.platform.toUpperCase()}
                </Badge>
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
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
        <div className="app-container flex-1 px-[9px] py-4 safe-nav-pad space-y-8">
        {/* Strategy Description */}
        <Card style={glassCardStyle} className="mt-4">
          <CardHeader>
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

        {strategy.status === 'pending' && (
          <Card style={glassCardStyle}>
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
          <Card style={glassCardStyle}>
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
                  onClick={() => onNavigate('submit')}
                  variant="outline"
                  className="h-9 px-4 py-2.5 flex-1 sm:flex-none min-w-0"
                >
                  New Strategy
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card style={glassCardStyle}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Generated Code</CardTitle>
                <CardDescription>
                  {strategy.status === 'pending' || strategy.status === 'generating' ? 'Generating code...' : `Production-ready ${strategy.platform.toUpperCase()} code`}
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={copyCode} disabled={strategy.status === 'pending' || strategy.status === 'generating'}>
                  <Copy className="w-4 h-4" />
                </Button>
                <Button size="sm" variant="outline" onClick={downloadCode} disabled={strategy.status === 'pending' || strategy.status === 'generating'}>
                  <Download className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className={`${codeBoxHeights} w-full rounded-md border border-gray-200 dark:border-gray-700`}>
              <pre className="p-4 text-xs max-w-full overflow-x-auto">
                <code className="text-gray-800 dark:text-gray-200 whitespace-pre">
                  {codeText}
                </code>
              </pre>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="grid grid-cols-2 gap-3">
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
        </div>

        {/* Instructions */}
        <Card style={glassCardStyle}>
          <CardHeader>
            <CardTitle className="text-sm">How to Use This Code</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-gray-800 dark:text-gray-200 space-y-2">
            {strategy.platform === 'pinescript' ? (
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
