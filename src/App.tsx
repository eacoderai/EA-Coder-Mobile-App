import React, { useState, useEffect } from "react";
import { Plus, Clock, CheckCircle2, XCircle, Loader2, Code2, Crown } from "lucide-react";
import { Button } from "./components/ui/button";
import { ThemeProvider } from "./components/ThemeProvider";
import { SplashScreen } from "./components/SplashScreen";
import { AuthScreen } from "./components/AuthScreen";
import { HomeScreen } from "./components/HomeScreen";
import { SubmitStrategyScreen } from "./components/SubmitStrategyScreen";
import { CodeResultScreen } from "./components/CodeResultScreen";
import { ChatScreen } from "./components/ChatScreen";
import { ConvertScreen } from "./components/ConvertScreen";
import { AnalyzeScreen } from "./components/AnalyzeScreen";
import { ProfileScreen } from "./components/ProfileScreen";
import NotificationScreen from "./components/NotificationScreen";
import { SubscriptionScreen } from "./components/SubscriptionScreen";
import { PrivacyPolicyScreen } from "./components/PrivacyPolicyScreen";
import { TermsScreen } from "./components/TermsScreen";
import { BottomNav } from "./components/BottomNav";
import { HelpBubble } from "./components/HelpBubble";
import { HelpCenterScreen } from "./components/HelpCenterScreen";
import UpdatePasswordScreen from "./components/UpdatePasswordScreen";
import { JournalHomeScreen } from "./components/JournalHomeScreen";
import { TradeEntryForm } from "./components/TradeEntryForm";
import { JournalReportScreen } from "./components/JournalReportScreen";
import { Toaster } from "./components/ui/sonner";
import { toast, setToastAccountType } from "./utils/tieredToast";
import { App as CapacitorApp } from '@capacitor/app';
import { supabase, getFunctionUrl } from './utils/supabase/client';
import { projectId } from './utils/supabase/info';
import { shouldShowLimitToast, logSuppressedLimitToast } from './utils/limits';
import { Tier, TIER_LIMITS } from './types/user';

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("home");
  const [currentScreen, setCurrentScreen] = useState<string>("home");
  const [selectedStrategyId, setSelectedStrategyId] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [tier, setTier] = useState<Tier>('free');
  const [fullSubscription, setFullSubscription] = useState<any>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isSyncingPlan, setIsSyncingPlan] = useState(false);
  const [generationUsage, setGenerationUsage] = useState<{ codeUsed: number; analysisUsed: number; limit: number }>({ codeUsed: 0, analysisUsed: 0, limit: 1 });
  const [serverUsage, setServerUsage] = useState<{ count: number; remaining: number; window: string } | null>(null);

  // Test unlock: bypass subscription gating in development/testing
  const testUnlock = (
    import.meta.env.VITE_TEST_UNLOCK === '1' ||
    (typeof window !== 'undefined' && window.localStorage.getItem('TEST_UNLOCK') === '1')
  );
  // Dev-only override: treat port 3002 (or explicit flags) as free
  const forceFreeDev = (
    import.meta.env.DEV && (
      (typeof window !== 'undefined' && window.location?.port === '3002') ||
      import.meta.env.VITE_FORCE_FREE === '1' ||
      (typeof window !== 'undefined' && window.localStorage.getItem('FORCE_FREE') === '1')
    )
  );
  
  // Test bypass for E2E testing
  const forceAuth = typeof window !== 'undefined' && window.localStorage.getItem('FORCE_AUTH') === '1';

  const effectiveTier: Tier = forceAuth ? 'pro' : (forceFreeDev ? 'free' : (testUnlock ? 'elite' : tier));
  const isProOrElite = effectiveTier === 'pro' || effectiveTier === 'elite';
  const isElite = effectiveTier === 'elite';
  
  useEffect(() => {
    // Keep toast system aware of current account type (includes dev override)
    setToastAccountType(effectiveTier);
  }, [effectiveTier]);

  useEffect(() => {
    try {
      if (!selectedStrategyId && typeof window !== 'undefined') {
        const s = window.localStorage.getItem('lastSelectedStrategyId');
        if (s) setSelectedStrategyId(JSON.parse(s));
      }
    } catch {}
  }, []);

  useEffect(() => {
    // Handle Deep Links (Mobile)
    CapacitorApp.addListener('appUrlOpen', (data) => {
      try {
        const url = new URL(data.url);
        // Handle password reset link: eacoder://eacoderai.xyz/update-password or eacoder://update-password
        if (url.pathname.includes('update-password') || url.pathname.includes('reset-password') || url.hostname === 'update-password') {
           // If we have hash params (Supabase default), parse them
           // Supabase sends: .../update-password#access_token=...&refresh_token=...
           // We need to convert hash to search params for easier handling if needed, 
           // but Supabase client usually handles session recovery if we pass the URL.
           
           // However, for explicit password reset flow:
           const accessToken = new URLSearchParams(url.hash.substring(1)).get('access_token');
           const refreshToken = new URLSearchParams(url.hash.substring(1)).get('refresh_token');
           
           if (accessToken && refreshToken) {
             supabase.auth.setSession({
               access_token: accessToken,
               refresh_token: refreshToken
             }).then(() => {
               // Navigate to update password screen
               // Since we are in the app, we can just render the component or set state
               // But our routing is basic. Let's use a state or a simple window location hack if needed.
               // Better: Set a state 'forceShowUpdatePassword'
               if (window.location) {
                 // Update URL without reload to trigger our existing route check? 
                 // Or just set the state directly.
                 setCurrentScreen("update-password"); 
               }
             });
           }
        }
      } catch (e) {
        console.error('Deep link error:', e);
      }
    });
  }, []);

  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        const u = new URL(window.location.href);
        if (u.pathname.includes('reset-password')) {
          const t = u.searchParams.get('token');
          if (t) setResetToken(t);
          setRecoveryMode(true);
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    // Global session listener to handle multi-tab/external state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state changed:', event);
      
      if (event === 'SIGNED_IN' && session) {
        setIsAuthenticated(true);
        setAccessToken(session.access_token);
        setUserId(session.user?.id || null);
        loadSubscription(session.access_token);
      } else if (event === 'SIGNED_OUT') {
        setIsAuthenticated(false);
        setAccessToken(null);
        setUserId(null);
        setTier('free');
        // Clear auth tokens from local storage manually to be safe
        const storageKey = `sb-${projectId}-auth-token`;
        window.localStorage.removeItem(storageKey);
      } else if (event === 'TOKEN_REFRESHED' && session) {
        setAccessToken(session.access_token);
      }
    });

    checkAuth();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const checkAuth = async () => {
    // Immediate state reset if we're clearly not authenticated to speed up UI
    const storageKey = `sb-${projectId}-auth-token`;
    const hasStored = typeof window !== 'undefined' && !!window.localStorage.getItem(storageKey);
    
    if (!hasStored) {
      setIsAuthenticated(false);
      setAccessToken(null);
      setUserId(null);
      setIsCheckingAuth(false);
      return;
    }

    try {
      console.log('[AuthBootstrap] Starting session check...');
      // Direct session check
      const { data: { session }, error } = await supabase.auth.getSession();

      if (error) throw error;

      if (session?.access_token) {
        console.log('[AuthBootstrap] Session found. Blocking UI for plan sync...');
        setAccessToken(session.access_token);
        setIsAuthenticated(true);
        setUserId(session.user?.id || null);
        
        // Wait for plan sync BEFORE showing the main UI
        await loadSubscription(session.access_token);
        
        // Load usage in background as it's less critical for initial render
        loadUsage(session.access_token).catch(err => console.error('Background usage load error:', err));
      } else {
        setIsAuthenticated(false);
        setAccessToken(null);
        setUserId(null);
      }
    } catch (error: any) {
      console.error('[AuthBootstrap] Error:', error);
      setIsAuthenticated(false);
      setAccessToken(null);
      setUserId(null);
      // Only clear storage on specific definitive auth errors, not generic network ones
      if (error.message?.includes('Invalid Refresh Token') || error.status === 400) {
        window.localStorage.removeItem(storageKey);
      }
    } finally {
      setIsCheckingAuth(false);
      setShowSplash(false);
      console.log('[AuthBootstrap] Finished.');
    }
  };

  const loadSubscription = async (token: string): Promise<Tier> => {
    const startTime = performance.now();
    console.log(`[PlanSync] Starting plan sync at ${new Date().toISOString()}`);
    // Only set syncing plan if we're not already authenticated to avoid blocking UI unnecessarily
    const shouldBlock = !isAuthenticated;
    if (shouldBlock) setIsSyncingPlan(true);
    
    let currentTier: Tier = 'free';
    try {
      const res = await fetch(getFunctionUrl('make-server-00a119be/subscription'), {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const sub = data?.subscription;
        setFullSubscription(sub);
        const planVal = sub?.plan;
        if (planVal === 'elite') currentTier = 'elite';
        else if (planVal === 'pro' || planVal === 'premium') currentTier = 'pro';
        else currentTier = 'free';
        
        console.log(`[PlanSync] Server returned plan: ${planVal} -> mapped to: ${currentTier}`);
        setTier(currentTier);
      } else {
        console.warn(`[PlanSync] Subscription fetch failed with status: ${res.status}`);
        setTier('free');
        setFullSubscription(null);
      }
    } catch (err) {
      console.warn('[PlanSync] Load subscription failed:', err);
      setTier('free');
      setFullSubscription(null);
    } finally {
      const duration = (performance.now() - startTime).toFixed(2);
      console.log(`[PlanSync] Plan sync completed in ${duration}ms. Active tier: ${currentTier}`);
      setIsSyncingPlan(false);
    }
    return currentTier;
  };

  const loadUsage = async (token: string) => {
    try {
      console.log('[UsageSync] Fetching usage...');
      const res = await fetch(getFunctionUrl('make-server-00a119be/usage'), {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const usage = data?.usage;
        if (usage && typeof usage.count === 'number' && typeof usage.remaining === 'number') {
          console.log('[UsageSync] Usage loaded:', usage);
          setServerUsage(usage);
          // Align client usage counters with server for gating
          setGenerationUsage({ codeUsed: usage.count, analysisUsed: 0, limit: 4 });
        }
      }
    } catch (err) {
      console.warn('[UsageSync] Load usage failed:', err);
    }
  };

  const refreshAppData = async () => {
    if (!accessToken) return;
    try {
      console.log('[AppSync] Refreshing all app data...');
      // Parallelize both subscription and usage data for speed
      await Promise.all([
        loadSubscription(accessToken),
        loadUsage(accessToken)
      ]);
      console.log('[AppSync] Refresh completed successfully.');
    } catch (err) {
      console.error('[AppSync] Failed to refresh app data:', err);
      // Optional: Show a toast or error indicator if sync fails repeatedly
    }
  };

  const handleAuthenticated = async () => {
    const syncStartTime = performance.now();
    console.log(`[AuthFlow] handleAuthenticated triggered at ${new Date().toISOString()}`);
    // Only block if not already authenticated (though handleAuthenticated is usually for first-time)
    if (!isAuthenticated) setIsSyncingPlan(true);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        setAccessToken(session.access_token);
        setIsAuthenticated(true);
        setUserId(session.user?.id || null);
        
        console.log(`[AuthFlow] Session acquired for user: ${session.user?.id}. Fetching subscription...`);
        
        // Wait for subscription to load BEFORE allowing UI to proceed
        const tier = await loadSubscription(session.access_token);
        console.log(`[AuthFlow] Subscription loaded: ${tier}`);

        if (session.user?.id) {
          const raw = window.localStorage.getItem(`gen-usage:${session.user.id}`);
          if (raw) {
            try {
              const parsed = JSON.parse(raw);
              if (typeof parsed?.codeUsed === 'number' && typeof parsed?.analysisUsed === 'number') {
                setGenerationUsage({ codeUsed: parsed.codeUsed, analysisUsed: parsed.analysisUsed, limit: 4 });
              }
            } catch {}
          }
        }

        const firstKey = session.user?.id ? `first-login:${session.user.id}` : null;
        const isFirstLogin = firstKey && !window.localStorage.getItem(firstKey);
        
        if (isFirstLogin) {
          console.log(`[AuthFlow] First login detected. Redirecting to subscription.`);
          window.localStorage.setItem(firstKey!, '1');
          setCurrentScreen('subscription');
          setActiveTab('profile');
          await loadUsage(session.access_token);
        } else {
          console.log(`[AuthFlow] Returning user. Redirecting to home.`);
          setCurrentScreen('home');
          setActiveTab('home');
          // Usage can load in background
          loadUsage(session.access_token).catch(e => console.warn('Background usage load error:', e));
        }
      }
    } catch (error) {
      console.error('[AuthFlow] handleAuthenticated failed:', error);
      toast.error("Failed to sync your account details. Please try again.");
    } finally {
        const syncDuration = (performance.now() - syncStartTime).toFixed(2);
        console.log(`[AuthFlow] handleAuthenticated complete in ${syncDuration}ms`);
        setIsSyncingPlan(false);
        setShowSplash(false);
      }
    };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setAccessToken(null);
    setActiveTab("home");
    setCurrentScreen("home");
    setSelectedStrategyId(null);
    setUserId(null);
    setTier('free');
    setGenerationUsage({ codeUsed: 0, analysisUsed: 0, limit: 1 });
  };

  const saveUsage = (uid: string | null, usage: { codeUsed: number; analysisUsed: number; limit: number }) => {
    if (!uid) return;
    try {
      window.localStorage.setItem(`gen-usage:${uid}`, JSON.stringify({ codeUsed: usage.codeUsed, analysisUsed: usage.analysisUsed }));
    } catch {}
  };

  const addLocalNotification = (title: string, message: string) => {
    if (!userId) return;
    const key = `local-notifications:${userId}`;
    let list: any[] = [];
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) list = JSON.parse(raw) || [];
    } catch {}
    const notif = {
      id: `local-${Date.now()}`,
      type: 'subscription',
      title,
      message,
      timestamp: new Date().toISOString(),
      read: false,
    };
    list.unshift(notif);
    try {
      window.localStorage.setItem(key, JSON.stringify(list.slice(0, 50)));
    } catch {}
  };

  const totalUsed = generationUsage.codeUsed + generationUsage.analysisUsed;
  const remainingGenerations = serverUsage ? Math.max(0, serverUsage.remaining) : Math.max(0, generationUsage.limit - totalUsed);

  const incrementGeneration = (kind: 'code' | 'analysis') => {
    setGenerationUsage((prev) => {
      const next = {
        ...prev,
        codeUsed: prev.codeUsed + (kind === 'code' ? 1 : 0),
        analysisUsed: prev.analysisUsed + (kind === 'analysis' ? 1 : 0),
      };
      saveUsage(userId, next);
      // Only trigger limit toasts on actual strategy creation (code generation).
      // Analysis runs should not contribute to limit-warning toasts.
      if (kind === 'code') {
        const usedStrategies = next.codeUsed;
        const limit = next.limit;
        const outcome = shouldShowLimitToast(effectiveTier, usedStrategies);
        if (outcome === 'limit') {
          toast.info('Limit reached — upgrade for unlimited strategy creation and weekly analysis.', { audience: 'upgrade-to-pro', tag: 'limit_reached' });
        } else if (outcome === 'almost') {
          toast.info('You’re almost out — upgrade to get unlimited strategy creation and weekly analysis.', { audience: 'upgrade-to-pro', tag: 'limit_almost' });
        } else {
          // For premium users, log suppression if thresholds would have triggered
          logSuppressedLimitToast('incrementGeneration', usedStrategies, limit, effectiveTier);
        }
      }
      return next;
    });
  };

  const handleNavigate = (screen: string, strategyId?: string) => {
    console.log(`[Navigation] Navigating to: ${screen}, strategyId: ${strategyId}`);
    // Journal tab is for Elite only. If a Pro/Free user somehow triggers it, we show the paywall.
    if (screen === 'journal' && !isElite) {
      toast.info('Upgrade to Elite for AI Trade Journaling', { 
        audience: 'upgrade-to-elite', 
        tag: 'journal_access_blocked' 
      } as any);
      setCurrentScreen('subscription');
      setActiveTab('profile');
      return;
    }

    try {
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
      }
    } catch {}
    setCurrentScreen(screen);
    if (strategyId) {
      setSelectedStrategyId(strategyId);
      try {
        if (typeof window !== 'undefined') window.localStorage.setItem('lastSelectedStrategyId', JSON.stringify(strategyId));
      } catch {}
    } else if (screen === 'submit') {
      setSelectedStrategyId(null);
      try {
        if (typeof window !== 'undefined') {
          window.localStorage.removeItem('lastSelectedStrategyId');
        }
      } catch {}
    }
    const screenToTab: Record<string, string> = {
      home: "home",
      submit: "home",
      code: "home",
      notifications: "home",
      subscription: "profile",
      profile: "profile",
      chat: "chat",
      convert: "convert",
      analyze: "analyze",
      journal: "journal",
    };
    if (screenToTab[screen]) setActiveTab(screenToTab[screen]);
  };

  if (isCheckingAuth || showSplash) {
    return (
      <ThemeProvider>
        <div className="min-h-screen w-screen bg-background">
          <SplashScreen 
            ready={!isCheckingAuth}
            onComplete={() => setShowSplash(false)} 
          />
        </div>
      </ThemeProvider>
    );
  }

  // Handle Update Password Route (before auth checks)
  if ((typeof window !== 'undefined' && window.location.pathname.includes('update-password')) || currentScreen === "update-password") {
    return (
      <ThemeProvider>
        <div className="min-h-screen w-screen bg-background">
          <UpdatePasswordScreen onNavigate={handleNavigate} />
          <Toaster />
        </div>
      </ThemeProvider>
    );
  }

  if (!isAuthenticated) {
    return (
      <ThemeProvider>
        <div className="min-h-screen w-screen bg-background">
          <AuthScreen onAuthenticated={handleAuthenticated} recovery={recoveryMode} resetToken={resetToken || undefined} />
          <Toaster />
        </div>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <div className="min-h-screen w-screen bg-background flex flex-col overflow-x-hidden">
        <div className="flex-1 bg-gray-50 dark:bg-gray-900">
          {currentScreen === "home" && (
          <HomeScreen
            onNavigate={handleNavigate}
            accessToken={accessToken}
            isProUser={isProOrElite}
            hasActivePlan={true}
            remainingGenerations={remainingGenerations}
            tier={effectiveTier}
            onRefresh={refreshAppData}
          />
        )}
        {currentScreen === "submit" && (
          <SubmitStrategyScreen
            onNavigate={handleNavigate}
            accessToken={accessToken}
            tier={effectiveTier}
            remainingGenerations={remainingGenerations}
            onGenerationCount={incrementGeneration}
            initialStrategyId={selectedStrategyId || undefined}
          />
        )}
        {currentScreen === "code" && selectedStrategyId && (
          <CodeResultScreen
            strategyId={selectedStrategyId}
            onNavigate={handleNavigate}
            accessToken={accessToken}
            isProUser={isProOrElite}
            remainingGenerations={remainingGenerations}
            onGenerationCount={incrementGeneration}
          />
        )}
        {currentScreen === "chat" && (
          <ChatScreen
            strategyId={selectedStrategyId || undefined}
            onNavigate={handleNavigate}
            accessToken={accessToken}
            isProUser={isProOrElite}
            remainingGenerations={remainingGenerations}
          />
        )}
        {currentScreen === "convert" && (
          <ConvertScreen
            onNavigate={handleNavigate}
            accessToken={accessToken}
            isProUser={isProOrElite}
            isEliteUser={isElite}
            remainingGenerations={remainingGenerations}
          />
        )}
        {currentScreen === "analyze" && (
          <AnalyzeScreen
            strategyId={selectedStrategyId || undefined}
            onNavigate={handleNavigate}
            accessToken={accessToken}
            tier={effectiveTier}
            remainingGenerations={remainingGenerations}
            onGenerationCount={incrementGeneration}
          />
        )}
        {currentScreen === "profile" && (
          <ProfileScreen 
            onNavigate={handleNavigate} 
            onLogout={handleLogout} 
            accessToken={accessToken} 
            tier={effectiveTier}
            subscriptionData={fullSubscription}
          />
        )}
        {currentScreen === "notifications" && (
          <NotificationScreen 
            onNavigate={handleNavigate} 
            accessToken={accessToken} 
            isProUser={isProOrElite}
            onRefreshSubscription={refreshAppData}
          />
        )}
        {currentScreen === "privacy" && (
          <PrivacyPolicyScreen onNavigate={handleNavigate} />
        )}
        {currentScreen === "terms" && (
          <TermsScreen onNavigate={handleNavigate} />
        )}
        {currentScreen === "subscription" && (
          <SubscriptionScreen
            onNavigate={handleNavigate}
            accessToken={accessToken}
            initialPlan={selectedStrategyId}
            onTierUpdated={(t) => {
              setTier(t);
              refreshAppData(); // Re-fetch everything when tier changes
              if (userId) {
                try { window.localStorage.removeItem(`first-login:${userId}`); } catch {}
              }
            }}
          />
        )}
        {currentScreen === "help-center" && (
          <HelpCenterScreen
            onNavigate={handleNavigate}
            activeTab={activeTab}
          />
        )}
        {currentScreen === "update-password" && (
          <UpdatePasswordScreen onNavigate={handleNavigate} />
        )}
        {currentScreen === "journal" && (
          <JournalHomeScreen 
            onNavigate={handleNavigate} 
            accessToken={accessToken}
            tier={effectiveTier}
          />
        )}
        {currentScreen === "journal-entry" && (
          <TradeEntryForm 
            onNavigate={handleNavigate} 
            accessToken={accessToken}
          />
        )}
        {currentScreen === "journal-report" && (
          <JournalReportScreen 
            onNavigate={handleNavigate} 
            accessToken={accessToken}
            analysisId={selectedStrategyId || undefined}
          />
        )}
      </div>

      <BottomNav
        activeTab={activeTab}
        isEliteUser={isElite}
        onTabChange={(tab: string) => {
          const tabToScreen: Record<string, string> = {
            home: "home",
            chat: "chat",
            convert: "convert",
            analyze: "analyze",
            profile: "profile",
            journal: "journal",
          };
          const nextScreen = tabToScreen[tab];
          // Delegate to navigate to enforce route protection
          handleNavigate(nextScreen);
        }}
      />
      <HelpBubble activeTab={activeTab} onNavigate={handleNavigate} />

      <Toaster />
    </div>
    </ThemeProvider>
  );
}
