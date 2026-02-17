import React, { useState, useEffect } from "react";
import { Crown, Check, Zap, TrendingUp, Bell, Sparkles, ArrowLeft, Star, Shield, Info } from "lucide-react";
import { PaymentElement, Elements, useStripe, useElements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { toast } from "../utils/tieredToast";
import { getFunctionUrl, supabase } from '../utils/supabase/client';
import { StrategyProgressCard } from "./StrategyProgressCard"; // Ensure named import matches export
import { Tier, TIER_LIMITS } from "../types/user";
import { Switch } from "./ui/switch"; // Assuming we have a Switch component, or I'll implement a simple toggle

// Liquid Glass Theme Effect
const glassCardStyle: React.CSSProperties = {
  backdropFilter: 'blur(10px)',
  backgroundColor: 'rgba(255, 255, 255, 0.15)',
  border: '1px solid rgba(255, 255, 255, 0.18)',
  borderRadius: '25px',
  boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.37)',
};

interface SubscriptionData {
  plan: Tier;
  subscriptionDate?: string;
  expiryDate?: string;
  billing_cycle?: 'monthly' | 'annual';
}

interface SubscriptionScreenProps {
  onNavigate: (screen: string) => void;
  accessToken: string | null;
  onTierUpdated: (tier: Tier) => void;
  initialPlan?: string | null;
}

export function SubscriptionScreen({ onNavigate, accessToken, onTierUpdated, initialPlan }: SubscriptionScreenProps) {
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [redirectingTier, setRedirectingTier] = useState<Tier | null>(null);
  const [strategiesCount, setStrategiesCount] = useState<number>(0);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');
  const [showPayment, setShowPayment] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [stripePromise] = useState<any>(() => {
    const key = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
    return key ? loadStripe(key) : null;
  });
  const [isPaying, setIsPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  useEffect(() => {
    fetchSubscription();
    fetchStrategiesCount();
  }, []);

  useEffect(() => {
    // Check for success/cancel query params from Stripe redirect
    try {
      const params = new URLSearchParams(window.location.search);
      const status = params.get('status');
      if (status === 'success') {
        let active = true;
        const verify = async () => {
          try {
            const stored = localStorage.getItem('payment_pending');
            const pending = stored ? JSON.parse(stored) : null;
            if (pending && (Date.now() - pending.at < 3600000)) { // 1 hour validity
               // Optimistic update based on pending payment
               const newTier = (pending.type === 'pro' || pending.type === 'elite') ? pending.type : 'free';
               if (active) {
                 onTierUpdated(newTier);
                 toast.success(`Subscription updated to ${newTier.toUpperCase()}!`, { audience: 'all' });
                 localStorage.removeItem('payment_pending');
               }
            } else {
               // Re-fetch to confirm
               await fetchSubscription();
            }
          } catch (e) {
            console.error(e);
          }
          // Clean URL
          window.history.replaceState({}, document.title, window.location.pathname);
        };
        verify();
        return () => { active = false; };
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  const fetchSubscription = async () => {
    if (!accessToken) {
      setIsLoading(false);
      return;
    }
    try {
      const url = getFunctionUrl('make-server-00a119be/subscription');
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSubscription(data.subscription);
        // Correctly read 'plan' from the response, not 'tier'
        const planVal = data.subscription?.plan;
        if (planVal) {
            let newTier: Tier = 'free';
            if (planVal === 'elite') newTier = 'elite';
            else if (planVal === 'pro' || planVal === 'premium') newTier = 'pro';
            // Only update if it's actually different to avoid cycles
            if (newTier !== initialPlan) {
              onTierUpdated(newTier);
            }
        }
      }
    } catch (error) {
      console.error('Error loading subscription:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchStrategiesCount = async () => {
    // This would ideally fetch from backend, for now mock or use local storage logic if available
    // In a real implementation, this should come from the user profile or a separate stats endpoint
    // We'll leave it as 0 or implement a quick fetch if needed.
    // Assuming the previous implementation had logic for this, we'll keep it simple.
    try {
        // If there's a way to get strategy count, do it here.
        // For now, we'll assume the parent or a context might provide it, 
        // or we rely on the Profile data if it includes usage.
        // The previous code had a separate fetch or state.
        // We'll set it to a safe default or read from local storage if available as a fallback
        const raw = localStorage.getItem('strategy-progress');
        if (raw) {
            const parsed = JSON.parse(raw);
            if (typeof parsed.count === 'number') setStrategiesCount(parsed.count);
        }
    } catch {}
  };

  // Pricing configuration
  const PRICING = {
    pro: {
      monthly: { price: 19, label: '$19/mo', priceId: 'price_pro_monthly', link: 'https://buy.stripe.com/test_7sYaEX3oacSk8ESb24bsc05' },
      annual: { price: 199, label: '$199/yr', priceId: 'price_pro_annual', link: 'https://buy.stripe.com/test_14A7sL9My7y04oCfikbsc07', savings: 'Save ~$29' }
    },
    elite: {
      monthly: { price: 29, label: '$29/mo', priceId: 'price_elite_monthly', link: 'https://buy.stripe.com/test_bJecN59My4lO2gu8TWbsc06' },
      annual: { price: 299, label: '$299/yr', priceId: 'price_elite_annual', link: 'https://buy.stripe.com/test_4gM4gzgaW8C4cV83zCbsc08', savings: 'Save ~$49' }
    }
  };

  useEffect(() => {
    // Scroll to requested plan if provided via navigation params (passed as initialPlan)
    if (initialPlan) {
      setTimeout(() => {
        const el = document.getElementById(initialPlan);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // Highlight effect
          el.classList.add('ring-2', 'ring-blue-500', 'ring-offset-2');
          setTimeout(() => el.classList.remove('ring-2', 'ring-blue-500', 'ring-offset-2'), 2000);
        }
      }, 500); // Small delay to ensure render
    }
  }, [initialPlan]);

  const handleCheckout = async (targetTier: 'pro' | 'elite') => {
    if (redirectingTier) return;
    
    const currentPlan = (subscription?.plan as string) === 'premium' ? 'pro' : subscription?.plan;

    // Prevent downgrading via this flow if already on a higher plan (simple check)
    // Complex upgrade/downgrade logic usually handled by Stripe Customer Portal
    if (currentPlan === targetTier) {
      toast.info(`You are already on the ${targetTier} plan.`);
      setRedirectingTier(null);
      return;
    }

    // Check if user is on Elite and trying to click Pro
    if (currentPlan === 'elite' && targetTier === 'pro') {
      toast.info(`You already have an active plan.`);
      setRedirectingTier(null);
      return;
    }

    setRedirectingTier(targetTier);
    try {
      let email: string | null = null;
      let userId: string | null = null;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        email = (session?.user?.email as string) || null;
        userId = session?.user?.id || null;
      } catch {}

      const planConfig = PRICING[targetTier][billingCycle];
      const base = planConfig.link;
      
      const params: string[] = [];
      if (email) params.push(`prefilled_email=${encodeURIComponent(email)}`);
      if (userId) params.push(`client_reference_id=${encodeURIComponent(userId)}`);
      // Pass the price_id or product_id if the link supports it, or rely on the specific link
      
      const redirect = params.length ? `${base}?${params.join('&')}` : base;

      // Notify backend about intent (optional, for tracking)
      try {
        if (accessToken) {
          const url = getFunctionUrl('make-server-00a119be/product-info/update');
          await fetch(url, { 
            method: 'POST', 
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ 
              prod_id: planConfig.priceId, // Sending price ID or product ID
              plan_name: targetTier,
              billing_cycle: billingCycle
            }) 
          });
        }
      } catch (e) { console.warn('Failed to notify backend of checkout start', e); }

      try { 
        localStorage.setItem('payment_pending', JSON.stringify({ type: targetTier, at: Date.now() })); 
      } catch {}
      
      window.location.href = redirect;
    } catch (e: any) {
      toast.error(e?.message || 'Failed to start checkout', { dismissible: true });
    } finally {
      setRedirectingTier(null);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen w-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
        <div className="app-container flex-1 px-[9px] py-6 safe-nav-pad">
          <div className="flex items-center justify-center py-20">
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        </div>
      </div>
    );
  }

  const currentTier = ((subscription?.plan as string) === 'premium' ? 'pro' : subscription?.plan) || 'free';

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="app-container flex-1 px-[9px] py-6 safe-nav-pad">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => onNavigate('profile')}
            className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-4"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Profile
          </button>
          
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Upgrade Your Trading</h1>
            <p className="text-gray-600 dark:text-gray-400">
              Choose the plan that fits your trading style
            </p>
          </div>

          {/* Billing Cycle Toggle */}
          <div className="flex justify-center mb-8">
            <div className="bg-gray-100 dark:bg-gray-800 p-1 rounded-lg flex items-center">
              <button
                onClick={() => setBillingCycle('monthly')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  billingCycle === 'monthly'
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingCycle('annual')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${
                  billingCycle === 'annual'
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                Annual
                <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-bold">
                  SAVE ~15%
                </span>
              </button>
            </div>
          </div>

          {/* Current Plan Badge */}
          <div className="bg-gradient-to-br from-white to-purple-50 dark:from-background dark:to-purple-900/20 border border-gray-200 dark:border-purple-900/30 rounded-lg p-4 mb-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {currentTier === 'elite' ? (
                  <Crown className="w-6 h-6 text-yellow-500" />
                ) : (currentTier === 'pro' || currentTier === 'premium') ? (
                  <Star className="w-6 h-6 text-blue-500" />
                ) : (
                  <Zap className="w-6 h-6 text-gray-500" />
                )}
                <div>
                  <p className="text-gray-900 dark:text-white font-medium">
                    Current Plan: <span className="capitalize font-bold">{currentTier === 'premium' ? 'pro' : currentTier}</span>
                  </p>
                  {subscription?.expiryDate && (
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Renews on {new Date(subscription.expiryDate).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Strategy usage for Free users */}
          {currentTier === 'free' && (
            <div className="mb-8">
              <StrategyProgressCard 
                currentCount={strategiesCount} 
                totalLimit={TIER_LIMITS.free.generations} 
              />
            </div>
          )}
        </div>

        {/* Pricing Cards Stack */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-24">
          
          {/* Free Plan */}
          <div 
            style={glassCardStyle}
            className={`relative flex flex-col transition-all duration-300 overflow-hidden ${
            currentTier === 'free' 
              ? 'ring-2 ring-gray-400 dark:ring-gray-500' 
              : 'hover:-translate-y-1'
          }`}>
            <div className="p-6 flex-1">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">Free</h3>
                  <div className="text-3xl font-bold text-gray-900 dark:text-white mt-2">$0</div>
                </div>
                <div className="p-2 bg-purple-100 dark:bg-purple-900/40 rounded-lg">
                  <Zap className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                </div>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-6 min-h-[40px]">
                Perfect for testing the waters and exploring basic features.
              </p>
              <ul className="space-y-4 mb-6">
                <li className="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-300">
                  <div className="mt-0.5 bg-green-100 dark:bg-green-900/30 p-0.5 rounded-full">
                    <Check className="w-3 h-3 text-green-600 dark:text-green-400" />
                  </div>
                  <span>1 Strategy Generation (Lifetime)</span>
                </li>
                <li className="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-300">
                  <div className="mt-0.5 bg-green-100 dark:bg-green-900/30 p-0.5 rounded-full">
                    <Check className="w-3 h-3 text-green-600 dark:text-green-400" />
                  </div>
                  <span>MQL5 Only</span>
                </li>
                <li className="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-300">
                  <div className="mt-0.5 bg-gray-100 dark:bg-gray-800 p-0.5 rounded-full">
                    <Info className="w-3 h-3 text-gray-500 dark:text-gray-400" />
                  </div>
                  <span>Ad-supported</span>
                </li>
              </ul>
            </div>
            <div className="p-6 pt-0 mt-auto">
              {currentTier === 'free' ? (
                <button disabled className="w-full py-3 rounded-xl bg-gray-100 dark:bg-gray-700/50 text-gray-500 font-medium text-sm border border-gray-200 dark:border-gray-600">
                  Current Plan
                </button>
              ) : (
                <div className="w-full py-3 text-center text-sm font-medium text-gray-500 bg-gray-50 dark:bg-gray-800/30 rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
                  Included
                </div>
              )}
            </div>
          </div>

          {/* Pro Plan */}
          <div id="plan-pro" 
            style={glassCardStyle}
            className={`relative flex flex-col transition-all duration-300 transform overflow-hidden ${
            currentTier === 'pro'
              ? 'ring-2 ring-blue-500 scale-[1.02] z-10'
              : 'hover:-translate-y-1'
          }`}>
            <div className="absolute inset-0 bg-gradient-to-b from-blue-50/50 to-transparent dark:from-blue-900/20 dark:to-transparent pointer-events-none" />
            
            {billingCycle === 'annual' && (
              <div className="absolute top-0 right-0 z-20">
                <div className="bg-gradient-to-r from-blue-600 to-blue-500 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl rounded-tr-[18px] shadow-sm uppercase tracking-wide">
                  Most Popular
                </div>
              </div>
            )}
            
            <div className="p-6 flex-1 relative">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-bold text-blue-900 dark:text-blue-100">Pro</h3>
                  <div className="flex items-baseline gap-1 mt-2">
                    <span className="text-3xl font-bold text-gray-900 dark:text-white">
                      {billingCycle === 'monthly' ? '$19' : '$199'}
                    </span>
                    <span className="text-sm text-gray-500 font-medium">/{billingCycle === 'monthly' ? 'mo' : 'yr'}</span>
                  </div>
                  {billingCycle === 'annual' && (
                    <div className="inline-flex items-center gap-1 mt-1 bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded-full">
                      <TrendingUp className="w-3 h-3 text-green-600 dark:text-green-400" />
                      <span className="text-xs text-green-700 dark:text-green-300 font-semibold">Save ~$29/year</span>
                    </div>
                  )}
                </div>
                <div className="p-2 bg-blue-100 dark:bg-blue-900/40 rounded-lg shadow-sm">
                  <Star className="w-6 h-6 text-blue-600 dark:text-blue-400 fill-blue-600/20" />
                </div>
              </div>
              
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-6 min-h-[40px]">
                For serious traders building a comprehensive portfolio.
              </p>
              
              <div className="space-y-4 mb-6">
                <div className="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-200">
                  <div className="mt-0.5 bg-blue-100 dark:bg-blue-900/40 p-0.5 rounded-full shrink-0">
                    <Check className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                  </div>
                  <span className="font-medium">Up to 10 Strategies</span>
                </div>
                <div className="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-200">
                  <div className="mt-0.5 bg-blue-100 dark:bg-blue-900/40 p-0.5 rounded-full shrink-0">
                    <Check className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                  </div>
                  <span>MQL4 & MQL5 Support</span>
                </div>
                <div className="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-200">
                  <div className="mt-0.5 bg-blue-100 dark:bg-blue-900/40 p-0.5 rounded-full shrink-0">
                    <Check className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                  </div>
                  <span>Standard AI Chat</span>
                </div>
                <div className="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-200">
                  <div className="mt-0.5 bg-blue-100 dark:bg-blue-900/40 p-0.5 rounded-full shrink-0">
                    <Check className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                  </div>
                  <span>Detailed Backtesting Metrics</span>
                </div>
                <div className="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-200">
                  <div className="mt-0.5 bg-blue-100 dark:bg-blue-900/40 p-0.5 rounded-full shrink-0">
                    <Check className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                  </div>
                  <span>Ad-free Experience</span>
                </div>
              </div>
            </div>
            
            <div className="p-6 pt-0 mt-auto relative">
              {currentTier === 'pro' ? (
                <button disabled className="w-full py-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-semibold text-sm border border-blue-200 dark:border-blue-800">
                  Current Plan
                </button>
              ) : (
                <button 
                  onClick={() => handleCheckout('pro')}
                  disabled={!!redirectingTier}
                  className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm tracking-wide transition-all shadow-xl shadow-blue-600/30 hover:shadow-blue-600/40 hover:-translate-y-0.5 border border-blue-400/20 disabled:opacity-70 disabled:shadow-none"
                >
                  {redirectingTier === 'pro' ? 'Processing...' : `Upgrade to Pro`}
                </button>
              )}
            </div>
          </div>

          {/* Elite Plan */}
          <div id="plan-elite" 
            style={glassCardStyle}
            className={`relative flex flex-col transition-all duration-300 transform overflow-hidden ${
            currentTier === 'elite'
              ? 'ring-2 ring-yellow-500 scale-[1.02] z-10'
              : 'hover:-translate-y-1'
          }`}>
            <div className="absolute inset-0 bg-gradient-to-b from-yellow-50/50 to-transparent dark:from-yellow-900/20 dark:to-transparent pointer-events-none" />
            
            <div className="absolute top-0 right-0 z-20">
              <div className="bg-gradient-to-r from-yellow-500 to-yellow-600 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl rounded-tr-[18px] shadow-sm uppercase tracking-wide">
                Ultimate
              </div>
            </div>

            <div className="p-6 flex-1 relative">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-bold text-yellow-900 dark:text-yellow-100">Elite</h3>
                  <div className="flex items-baseline gap-1 mt-2">
                    <span className="text-3xl font-bold text-gray-900 dark:text-white">
                      {billingCycle === 'monthly' ? '$29' : '$299'}
                    </span>
                    <span className="text-sm text-gray-500 font-medium">/{billingCycle === 'monthly' ? 'mo' : 'yr'}</span>
                  </div>
                  {billingCycle === 'annual' && (
                    <div className="inline-flex items-center gap-1 mt-1 bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded-full">
                      <TrendingUp className="w-3 h-3 text-green-600 dark:text-green-400" />
                      <span className="text-xs text-green-700 dark:text-green-300 font-semibold">Save ~$49/year</span>
                    </div>
                  )}
                </div>
                <div className="p-2 bg-yellow-100 dark:bg-yellow-900/40 rounded-lg shadow-sm">
                  <Crown className="w-6 h-6 text-yellow-600 dark:text-yellow-400 fill-yellow-600/20" />
                </div>
              </div>
              
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-6 min-h-[40px]">
                Maximum power, all languages & priority support.
              </p>
              
              <div className="space-y-4 mb-6">
                <div className="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-200">
                  <div className="mt-0.5 bg-yellow-100 dark:bg-yellow-900/40 p-0.5 rounded-full shrink-0">
                    <Check className="w-3 h-3 text-yellow-600 dark:text-yellow-400" />
                  </div>
                  <span className="font-medium">Everything in Pro</span>
                </div>
                <div className="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-200">
                  <div className="mt-0.5 bg-yellow-100 dark:bg-yellow-900/40 p-0.5 rounded-full shrink-0">
                    <Check className="w-3 h-3 text-yellow-600 dark:text-yellow-400" />
                  </div>
                  <span className="font-medium">Unlimited Strategies</span>
                </div>
                <div className="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-200">
                  <div className="mt-0.5 bg-yellow-100 dark:bg-yellow-900/40 p-0.5 rounded-full shrink-0">
                    <Check className="w-3 h-3 text-yellow-600 dark:text-yellow-400" />
                  </div>
                  <span>Pine Script v5</span>
                </div>
                <div className="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-200">
                  <div className="mt-0.5 bg-yellow-100 dark:bg-yellow-900/40 p-0.5 rounded-full shrink-0">
                    <Check className="w-3 h-3 text-yellow-600 dark:text-yellow-400" />
                  </div>
                  <span>MQL ↔ Pine Converter</span>
                </div>
                <div className="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-200">
                  <div className="mt-0.5 bg-yellow-100 dark:bg-yellow-900/40 p-0.5 rounded-full shrink-0">
                    <Check className="w-3 h-3 text-yellow-600 dark:text-yellow-400" />
                  </div>
                  <span>Priority AI Chat</span>
                </div>
                <div className="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-200">
                  <div className="mt-0.5 bg-yellow-100 dark:bg-yellow-900/40 p-0.5 rounded-full shrink-0">
                    <Check className="w-3 h-3 text-yellow-600 dark:text-yellow-400" />
                  </div>
                  <span>12h Email Support</span>
                </div>
              </div>
            </div>

            <div className="p-6 pt-0 mt-auto relative">
              {currentTier === 'elite' ? (
                <button disabled className="w-full py-3 rounded-xl bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300 font-semibold text-sm border border-yellow-200 dark:border-yellow-800">
                  Current Plan
                </button>
              ) : (
                <button 
                  onClick={() => handleCheckout('elite')}
                  disabled={!!redirectingTier}
                  className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm tracking-wide transition-all shadow-xl shadow-blue-600/30 hover:shadow-blue-600/40 hover:-translate-y-0.5 border border-blue-400/20 disabled:opacity-70 disabled:shadow-none"
                >
                  {redirectingTier === 'elite' ? 'Processing...' : `Upgrade to Elite`}
                </button>
              )}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
