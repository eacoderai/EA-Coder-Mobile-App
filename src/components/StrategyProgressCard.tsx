import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { Badge } from "./ui/badge";
import { HelpCircle, Crown } from "lucide-react";
import { Tier } from "../types/user";

interface StrategyProgressCardProps {
  currentCount: number;
  totalLimit?: number; // default 4
  className?: string;
  onUpgrade?: (target?: string) => void;
  tier: Tier;
}

/**
 * StrategyProgressCard
 *
 * Displays a minimalist, accessible progress card showing
 * how many strategies have been created out of the tier limit.
 *
 * Props:
 * - currentCount: number of strategies created (real-time from parent state)
 * - totalLimit: tier limit
 * - className: optional container className overrides
 * - tier: current user tier
 *
 * Usage:
 * <StrategyProgressCard currentCount={used} totalLimit={limit} tier={tier} />
 */
export function StrategyProgressCard({ currentCount, totalLimit = 1, className, onUpgrade, tier }: StrategyProgressCardProps) {
  const [displayCount, setDisplayCount] = useState<number>(currentCount);

  // Persist across sessions for a smoother experience on reload before fetch.
  useEffect(() => {
    try {
      const raw = typeof window !== 'undefined' ? window.localStorage.getItem('strategy-progress') : null;
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed?.count === 'number') {
          setDisplayCount(parsed.count);
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    setDisplayCount(currentCount);
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('strategy-progress', JSON.stringify({ count: currentCount, total: totalLimit, updatedAt: Date.now() }));
      }
    } catch {}
  }, [currentCount, totalLimit]);

  const percent = useMemo(() => {
    const p = Math.max(0, Math.min(100, Math.round((displayCount / totalLimit) * 100)));
    // Ensure increments of 25% per strategy for totalLimit=4, or 100% for limit=1
    if (totalLimit === 1) return displayCount >= 1 ? 100 : 0;
    if (totalLimit === 4) return displayCount * 25;
    return p;
  }, [displayCount, totalLimit]);

  const colorClass = useMemo(() => {
    if (displayCount >= totalLimit) return 'bg-red-600';
    if (displayCount >= totalLimit * 0.8) return 'bg-yellow-500';
    return 'bg-blue-600';
  }, [displayCount, totalLimit]);

  const textColorClass = useMemo(() => {
    if (displayCount >= totalLimit) return 'text-red-600 dark:text-red-500';
    if (displayCount >= totalLimit * 0.8) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-blue-600 dark:text-blue-400';
  }, [displayCount, totalLimit]);

  const ariaText = `${displayCount} of ${totalLimit} strategies created`;

  const planName = useMemo(() => {
    if (tier === 'pro') return 'Pro Plan';
    if (tier === 'elite') return 'Elite Plan';
    return 'Free Plan';
  }, [tier]);

  const limitText = useMemo(() => {
    if (tier === 'pro') return 'monthly';
    return 'on the free plan';
  }, [tier]);

  const glassCardStyle: React.CSSProperties = {
    backdropFilter: 'blur(10px)',
    backgroundColor: 'rgba(0, 0, 0, 0.4)', // Darker background for contrast
    border: '1px solid rgba(255, 255, 255, 0.2)',
    borderRadius: '25px',
    boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.37)',
  };

  return (
    <Card className={`${className ?? ''} bg-transparent border-0`} style={glassCardStyle} aria-label="Strategy Creation Progress">
      <CardHeader className="px-4 pt-4 pb-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base text-white">Strategy Creation Limit.</CardTitle>
            <Tooltip>
              <TooltipTrigger asChild>
                <button aria-label="Strategy limit info" className="p-1 rounded hover:bg-white/10 text-white">
                  <HelpCircle className="w-4 h-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                You can create up to {totalLimit} {totalLimit === 1 ? 'strategy' : 'strategies'} {limitText}.
              </TooltipContent>
            </Tooltip>
          </div>
          <Badge variant="outline" className="text-xs text-white border-white/30">{planName}</Badge>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        <div className="flex items-center justify-between mb-2" aria-live="polite">
          <div className="text-sm text-white">
            <span className="font-medium">Created:</span> <span className={displayCount >= totalLimit ? "text-red-300" : "text-white"}>{displayCount} of {totalLimit}</span>
          </div>
          <div className="text-sm text-white">
            <span className="font-medium">Remaining:</span> {Math.max(0, totalLimit - displayCount)}
          </div>
        </div>

        {/* Custom progress for dynamic color and subtle animation */}
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={totalLimit}
          aria-valuenow={displayCount}
          aria-valuetext={ariaText}
          className="relative h-2 w-full overflow-hidden rounded-full bg-white/10"
        >
          <div
            className={`${colorClass} h-2 transition-[width] duration-500 ease-out`}
            style={{ width: `${percent}%` }}
          />
        </div>
        <div className="mt-2 text-xs text-white flex justify-between items-center">
          <span>{ariaText}</span>
          <span className="font-medium text-white">
            {tier === 'pro' ? 'Monthly Limit: 10' : 'Lifetime Limit: 1'}
          </span>
        </div>

        {onUpgrade && tier !== 'elite' && (
          <div className="mt-3 flex justify-end">
            <Button
              className="bg-white text-blue-600 hover:bg-blue-50 text-sm h-8"
              style={{ borderRadius: '9999px', paddingLeft: 14, paddingRight: 14 }}
              onClick={() => onUpgrade(tier === 'free' ? 'plan-pro' : 'plan-elite')}
            >
              <Crown className="w-4 h-4" />
              {tier === 'free' ? 'Upgrade to Pro' : 'Upgrade to Elite'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default StrategyProgressCard;
