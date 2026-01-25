import { toast as realToast } from 'sonner';
import { Tier } from '../types/user';

type Audience = Tier | 'all' | 'upgrade-to-pro' | 'upgrade-to-elite';

let currentTier: Tier = 'free';
const DEDUPE_TTL_MS = 6000; // prevent repeated toasts within 6 seconds
const recentKeys = new Map<string, number>();

export function setToastAccountType(tier: Tier) {
  currentTier = tier;
}

function classifyAudience(message?: string, options?: { audience?: Audience; tag?: string }): Audience {
  if (options && options.audience) return options.audience;
  return 'all';
}

function shouldShow(audience: Audience): boolean {
  if (audience === 'all') return true;
  if (audience === currentTier) return true;
  
  if (audience === 'upgrade-to-pro') {
    return currentTier === 'free';
  }
  if (audience === 'upgrade-to-elite') {
    return currentTier === 'free' || currentTier === 'pro';
  }
  
  return false;
}

function filterAndShow(kind: 'error' | 'success' | 'info', message: string, opts?: any) {
  const audience = classifyAudience(message, opts);
  if (!shouldShow(audience)) return;
  const now = Date.now();
  const key = String(
    opts?.tag || `${kind}:${message}:${audience}:${currentTier}`
  );
  const last = recentKeys.get(key) || 0;
  if (now - last < DEDUPE_TTL_MS) {
    return; // suppress duplicate toast within TTL
  }
  recentKeys.set(key, now);
  // prune occasionally to prevent unbounded growth
  if (recentKeys.size > 200) {
    const cutoff = now - DEDUPE_TTL_MS * 5;
    for (const [k, t] of recentKeys.entries()) {
      if (t < cutoff) recentKeys.delete(k);
    }
  }
  (realToast as any)[kind](message, opts);
}

export const toast = {
  error: (message: string, opts?: any) => filterAndShow('error', message, opts),
  success: (message: string, opts?: any) => filterAndShow('success', message, opts),
  info: (message: string, opts?: any) => filterAndShow('info', message, opts),
};
