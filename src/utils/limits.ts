import { Tier, TIER_LIMITS } from '../types/user';

export type LimitToastOutcome = 'none' | 'almost' | 'limit';

export function shouldShowLimitToast(tier: Tier, used: number): LimitToastOutcome {
  const limit = TIER_LIMITS[tier].generations;
  if (limit === Infinity) return 'none';
  if (used >= limit) return 'limit';
  if (used === limit - 1) return 'almost';
  return 'none';
}

export function logSuppressedLimitToast(context: string, used: number, limit: number, tier: Tier): void {
  try {
    if (tier === 'elite' && (used >= limit || used === limit - 1)) {
      console.info('[LimitToast] suppressed for elite', { context, used, limit });
    }
  } catch {}
}
