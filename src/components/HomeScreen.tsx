import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { Plus, Clock, CheckCircle2, XCircle, Loader2, Code2, Crown, X } from "lucide-react";
import { NotificationBell } from "./ui/NotificationBell";
import { getFunctionUrl } from '../utils/supabase/client';
import logoImage from "../assets/1525789d760b07ee395e05af9b06d7202ebb7883.png";
import { toast } from "../utils/tieredToast";
import { Progress } from "./ui/progress";
import StrategyProgressCard from "./StrategyProgressCard";
import { Header } from "./Header";

interface Strategy {
  id: string;
  strategy_name: string;
  platform: string;
  status: string;
  created_at: string;
  strategy_type?: 'automated' | 'manual';
}

import { PullToRefresh } from "./ui/PullToRefresh";

import { Tier, TIER_LIMITS } from "../types/user";

interface HomeScreenProps {
  onNavigate: (screen: string, strategyId?: string) => void;
  accessToken: string | null;
  isProUser: boolean;
  hasActivePlan: boolean;
  remainingGenerations?: number;
  tier: Tier;
  onRefresh?: () => Promise<void>;
}

import { RestrictedBanner } from './RestrictedBanner';
export function HomeScreen({ onNavigate, accessToken, isProUser, hasActivePlan, remainingGenerations = 0, tier, onRefresh }: HomeScreenProps) {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showQuotaPopup, setShowQuotaPopup] = useState(false);
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [storageVersion, setStorageVersion] = useState(0);
  const firstLoadRef = React.useRef(true);
  
  const currentLimit = TIER_LIMITS[tier].generations;
  const showLimitBanner = tier !== 'elite';

  useEffect(() => {
    loadStrategies(firstLoadRef.current);
    firstLoadRef.current = false;
  }, [accessToken]);

  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (!e.key) return;
      if (e.key.startsWith('strategy_code:') || e.key.startsWith('strategy_plan:') || e.key.startsWith('strategy_label:')) {
        setStorageVersion((v) => v + 1);
      }
    };
    if (typeof window !== 'undefined') window.addEventListener('storage', handler);
    return () => { if (typeof window !== 'undefined') window.removeEventListener('storage', handler); };
  }, []);
  const loadStrategies = async (showLoadingState = true) => {
    if (!accessToken) {
      setIsLoading(false);
      return;
    }
    
    if (showLoadingState) {
      setIsLoading(true);
    }
    try {
      const response = await fetch(
        getFunctionUrl(`make-server-00a119be/strategies?t=${Date.now()}`),
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          },
          cache: 'no-store'
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        setStrategies(data.strategies || []);
        if (data._debug) {
          setDebugInfo(data._debug);
          console.log('[HomeScreen] Backend debug info:', data._debug);
        }
      } else {
        const errData = await response.json().catch(() => ({}));
        console.error('Failed to load strategies:', response.status, errData);
        // Only show toast if it's a real error, not just empty
        if (response.status !== 404) {
          toast.error(errData.message || 'Failed to load strategies');
        }
      }
    } catch (error) {
      console.error('Failed to load strategies:', error);
      toast.error('Network error while loading strategies');
    } finally {
      setIsLoading(false);
    }
  };

  // Notification unread count is handled inside NotificationBell component

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'generated':
        return <CheckCircle2 className="w-4 h-4 text-green-600" />;
      case 'pending':
        return <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-600" />;
      default:
        return <Clock className="w-4 h-4 text-gray-600" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      generated: "default",
      pending: "secondary",
      error: "destructive"
    };
    return <Badge variant={variants[status] || "outline"}>{status}</Badge>;
  };

  const glassCardStyle: React.CSSProperties = {
    backdropFilter: 'blur(10px)',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    border: '1px solid rgba(255, 255, 255, 0.18)',
    borderRadius: '25px',
    boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.37)',
  };

  return (
      <div className="min-h-screen bg-background flex flex-col">
      <Header
        title="EACoder AI"
        subtitle="Your AI Trading Assistant"
        leadingIcon={<img src={logoImage} alt="EACoder AI" className="w-16 h-auto relative top-[2px]" />}
        rightContent={<NotificationBell accessToken={accessToken} onNavigate={onNavigate} />}
        bgClassName="bg-gradient-to-r from-blue-600 to-blue-800"
        textClassName="text-white"
        paddingClassName="p-6"
        borderClassName=""
        fixed
      >
        {showLimitBanner && (
          <div className="pt-[8px] mb-4">
            <StrategyProgressCard
              currentCount={strategies.length}
              totalLimit={currentLimit}
              onUpgrade={(target) => onNavigate('subscription', target)}
              tier={tier}
            />
          </div>
        )}
        <Button
          onClick={() => {
            const isLimitReached = currentLimit !== Infinity && strategies.length >= currentLimit;
            if (isLimitReached) {
              setShowQuotaPopup(true);
            } else {
              try { 
                if (typeof window !== 'undefined') {
                  window.localStorage.setItem('reset-indicators-on-new-strategy', '1');
                  window.localStorage.removeItem('submit:targetType');
                  window.localStorage.removeItem('submit:initId');
                  window.localStorage.removeItem('lastSelectedStrategyId');
                } 
              } catch {}
              onNavigate('submit');
            }
          }}
          style={{ borderRadius: '30px'}}
          className="w-full bg-white text-blue-600 hover:bg-blue-50 pt-[10px] mt-4"
        >
          <Plus className="w-5 h-5 mr-2" />
          Create New Strategy
        </Button>
      </Header>

    {/* Removed Free plan generation banners and restrictions */}

      {/* Content */}
      <PullToRefresh 
        className="app-container flex-1 pt-4 safe-nav-pad"
        onRefresh={async () => {
          await Promise.all([
            loadStrategies(false),
            onRefresh ? onRefresh() : Promise.resolve()
          ]);
        }}
      >
        <div className="mb-4">
          <h2 className="text-lg mb-2 text-gray-900 dark:text-white">Recent Strategies</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Your generated Expert Advisors and trading bots
          </p>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-4" />
            <p className="text-gray-600 dark:text-gray-400">Loading strategies...</p>
          </div>
        ) : strategies.length === 0 ? (
          <Card style={glassCardStyle}>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <div className="bg-blue-100 dark:bg-blue-900/30 p-4 rounded-full mb-4">
                <img
                  src={logoImage}
                  alt="EACoder AI"
                  className="w-26 h-24"
                />
              </div>
              <h3 className="text-lg mb-2 text-gray-900 dark:text-white">No strategies yet</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 text-center mb-4">
                Create your first Expert Advisor using plain English
              </p>

              <Button
                onClick={() => {
                  if (remainingGenerations <= 0) {
                    toast.error(
                      tier === 'free' 
                        ? 'Free limit reached — upgrade for more strategies' 
                        : 'Monthly limit reached — upgrade for more',
                      { audience: tier === 'free' ? 'basic' : 'upgrade-to-elite', tag: 'limit_reached' } as any
                    );
                    setTimeout(() => onNavigate('subscription'), 1000);
                  } else {
                    try { 
                      if (typeof window !== 'undefined') {
                        window.localStorage.setItem('reset-indicators-on-new-strategy', '1');
                        window.localStorage.removeItem('submit:targetType');
                        window.localStorage.removeItem('submit:initId');
                        window.localStorage.removeItem('lastSelectedStrategyId');
                      }
                    } catch {}
                    onNavigate('submit');
                  }
                }}
                style={{ borderRadius: '30px'}}
                className="w-[260px] sm:w-[280px] px-12 has-[>svg]:px-12 gap-2"
              >
                <span className="px-4">Submit Strategy</span>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3" data-storage-version={storageVersion}>
            {strategies.map((strategy) => (
              <Card
                key={strategy.id}
                style={glassCardStyle}
                className="cursor-pointer transition-all duration-300 hover:shadow-lg hover:-translate-y-1"
                onClick={() => {
                  onNavigate('code', strategy.id);
                }}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="mb-1">
                        {(() => {
                          let labelOverride: string | null = null;
                          let codeLocal: string | null = null;
                          let planLocal: string | null = null;
                          try {
                            if (typeof window !== 'undefined') {
                              labelOverride = window.localStorage.getItem(`strategy_label:${strategy.id}`);
                              const c = window.localStorage.getItem(`strategy_code:${strategy.id}`);
                              const p = window.localStorage.getItem(`strategy_plan:${strategy.id}`);
                              const hc = window.localStorage.getItem(`strategy_has_code:${strategy.id}`);
                              const hp = window.localStorage.getItem(`strategy_has_plan:${strategy.id}`);
                              codeLocal = c ? JSON.parse(c) : null;
                              planLocal = p ? JSON.parse(p) : null;
                              // Prefer stable booleans if available
                              if (hc || hp) {
                                const hasC = hc === '1';
                                const hasP = hp === '1';
                                if (hasC && hasP) labelOverride = 'DUAL';
                                else if (hasP) labelOverride = 'MANUAL';
                                else if (hasC) labelOverride = 'AUTOMATED';
                              }
                            }
                          } catch {}
                          const rawCode = String(codeLocal || strategy.generated_code || strategy.code || '');
                          const rawPlan = String(planLocal || strategy.manual_trading_plan || strategy.trading_plan || '');
                          const hasPlan = !!rawPlan.trim().length;
                          const codeFenced = /```[a-zA-Z0-9_\-\.\s]*\n([\s\S]*?)```/.test(rawCode);
                          const codeTokens = /(OnInit\s*\(|OnTick\s*\(|#property|input\s+|strategy\s*\(|\/\/@version)/i.test(rawCode);
                          const hasCode = !!(codeFenced || codeTokens);
                          const isDual = hasPlan && hasCode;
                          const fallbackType = strategy.strategy_type === 'manual' ? 'manual' : 'automated';
                          const computed = isDual ? 'DUAL' : (hasPlan ? 'manual' : (hasCode ? 'automated' : fallbackType));
                          const label = (labelOverride && (labelOverride === 'DUAL' || labelOverride === 'MANUAL' || labelOverride === 'AUTOMATED'))
                            ? (labelOverride === 'DUAL' ? 'DUAL' : labelOverride.toLowerCase())
                            : computed;
                          return (
                            <span className="inline-flex items-center justify-center rounded-md border px-2 py-0.5 font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden text-foreground text-[10px] h-5">
                              {label}
                            </span>
                          );
                        })()}
                      </div>
                      <CardTitle className="text-base mb-1">
                        {strategy.strategy_name || 'Untitled Strategy'}
                      </CardTitle>
                      <CardDescription className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {strategy.platform}
                        </Badge>
                        <span className="text-xs">
                          {new Date(strategy.created_at).toLocaleDateString()}
                        </span>
                      </CardDescription>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {getStatusIcon(strategy.status)}
                      {getStatusBadge(strategy.status)}
                    </div>
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}

        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-3 mt-6">
          <Card style={glassCardStyle}>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold mb-1 text-gray-900 dark:text-white">{strategies.length}</p>
              <p className="text-xs text-gray-600 dark:text-gray-400">Total</p>
            </CardContent>
          </Card>
          <Card style={glassCardStyle}>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold mb-1 text-green-600 dark:text-green-400">
                {strategies.filter(s => s.status === 'generated').length}
              </p>
              <p className="text-xs text-gray-600 dark:text-gray-400">Generated</p>
            </CardContent>
          </Card>
          <Card style={glassCardStyle}>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold mb-1 text-blue-600 dark:text-blue-400">
                {strategies.filter(s => s.status === 'pending').length}
              </p>
              <p className="text-xs text-gray-600 dark:text-gray-400">Pending</p>
            </CardContent>
          </Card>
        </div>
      </PullToRefresh>

      {showQuotaPopup && createPortal(
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
              onClick={() => setShowQuotaPopup(false)}
              className="absolute right-4 top-4 text-gray-300 hover:text-white"
            >
              <X className="w-6 h-6" />
            </button>
            
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-blue-600/20 rounded-full flex items-center justify-center mb-4 backdrop-blur-sm">
                 <Crown className="w-8 h-8 text-blue-400" />
              </div>
              
              <h3 className="text-xl font-bold text-white mb-2">
                {tier === 'free' ? 'Free Plan Limit Reached' : 'Monthly Quota Reached'}
              </h3>
              
              <p className="text-gray-200 mb-6">
                {tier === 'free'
                  ? "You've reached your free plan limit. Upgrade to create more strategies and unlock advanced features."
                  : "You've hit your limit for this month. Unlock unlimited strategy creations and advanced features with the Elite plan."}
              </p>
              
              <Button 
                className="w-full bg-gradient-to-r from-blue-600 to-blue-800 hover:from-blue-700 hover:to-blue-900 text-white font-medium py-6"
                onClick={() => {
                  setShowQuotaPopup(false);
                  onNavigate('subscription', 'plan-elite');
                }}
              >
                Upgrade to Elite
              </Button>
              
              <button 
                className="mt-4 text-sm text-gray-300 hover:text-white hover:underline"
                onClick={() => setShowQuotaPopup(false)}
              >
                Maybe Later
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
