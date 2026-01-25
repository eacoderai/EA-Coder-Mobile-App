export type Tier = 'free' | 'pro' | 'elite';

export interface UserProfile {
  id: string;
  email?: string;
  tier: Tier;
  free_bot_used: boolean;
  stripe_customer_id?: string;
  current_subscription_id?: string;
  billing_cycle?: 'monthly' | 'annual' | null;
  created_at?: string;
}

export interface SubscriptionStatus {
  tier: Tier;
  isActive: boolean;
  expiryDate?: string;
  billingCycle?: 'monthly' | 'annual';
}

export const TIER_LIMITS = {
  free: {
    generations: 1, // Lifetime
    mql4: false,
    mql5: true,
    pine: false,
    chat: false,
    converter: false,
    downloads: false,
    backtest_ui: false,
    backtest_metrics: false,
    version_history: 0,
    support: 'none'
  },
  pro: {
    generations: 10, // Monthly
    mql4: true,
    mql5: true,
    pine: false,
    chat: true, // Standard queue
    converter: false,
    downloads: true,
    backtest_ui: true,
    backtest_metrics: true,
    version_history: 3,
    support: '48h'
  },
  elite: {
    generations: Infinity,
    mql4: true,
    mql5: true,
    pine: true,
    chat: true, // Priority queue
    converter: true,
    downloads: true,
    backtest_ui: true,
    backtest_metrics: true, // + AI summary
    version_history: Infinity,
    support: '12h'
  }
};
