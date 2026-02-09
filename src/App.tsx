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
  const [userId, setUserId] = useState<string | null>(null);
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
    if (forceAuth) {
      setIsAuthenticated(true);
      setIsCheckingAuth(false);
      return;
    }
    checkAuth();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        setAccessToken(session.access_token);
        setIsAuthenticated(true);
        setUserId(session.user?.id || null);
        // Load usage from local storage for this user
        if (session.user?.id) {
          const raw = window.localStorage.getItem(`gen-usage:${session.user.id}`);
          if (raw) {
            try {
              const parsed = JSON.parse(raw);
              if (typeof parsed?.codeUsed === 'number' && typeof parsed?.analysisUsed === 'number') {
                setGenerationUsage({ codeUsed: parsed.codeUsed, analysisUsed: parsed.analysisUsed, limit: TIER_LIMITS[effectiveTier].generations });
              }
            } catch {}
          }
        }
        // Parallel fetch for better performance and accurate tier gating
        const [fetchedTier] = await Promise.all([
          loadSubscription(session.access_token),
          loadUsage(session.access_token)
        ]);

        // First-login gating: Only redirect if actually free
        const firstKey = session.user?.id ? `first-login:${session.user.id}` : null;
        const isFirstLogin = firstKey && !window.localStorage.getItem(firstKey);
        if (isFirstLogin) {
          window.localStorage.setItem(firstKey!, '1');
          if (fetchedTier === 'free') {
            setCurrentScreen('subscription');
            setActiveTab('profile');
          }
        }
      } else if (event === 'SIGNED_OUT') {
        setAccessToken(null);
        setIsAuthenticated(false);
        setTier('free');
        setUserId(null);
        setServerUsage(null);
        setGenerationUsage({ codeUsed: 0, analysisUsed: 0, limit: 1 });
      } else if (event === 'PASSWORD_RECOVERY') {
        setRecoveryMode(true);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const checkAuth = async () => {
    try {
      // Avoid refresh attempts when no auth token is stored for this origin/port
      const storageKey = `sb-${projectId}-auth-token`;
      const hasStored = typeof window !== 'undefined' && !!window.localStorage.getItem(storageKey);
      if (!hasStored) {
        setIsCheckingAuth(false);
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        setIsAuthenticated(true);
        setAccessToken(session.access_token);
        setUserId(session.user?.id || null);
        if (session.user?.id) {
          const raw = window.localStorage.getItem(`gen-usage:${session.user.id}`);
          if (raw) {
            try {
              const parsed = JSON.parse(raw);
              if (typeof parsed?.codeUsed === 'number' && typeof parsed?.analysisUsed === 'number') {
                setGenerationUsage({ codeUsed: parsed.codeUsed, analysisUsed: parsed.analysisUsed, limit: TIER_LIMITS[effectiveTier].generations });
              }
            } catch {}
          }
        }
        await Promise.all([
          loadSubscription(session.access_token),
          loadUsage(session.access_token)
        ]);
      }
    } catch (error) {
      const msg = String((error as any)?.message || '');
      if (/Invalid Refresh Token/i.test(msg)) {
        try {
          const scope = import.meta.env.DEV ? 'local' : 'global';
          await supabase.auth.signOut({ scope } as any);
        } catch (signOutErr: any) {
          const smsg = String(signOutErr?.message || '');
          if (/AbortError|aborted|ERR_ABORTED/i.test(smsg)) {
            console.warn('Supabase signOut aborted during refresh recovery (harmless).');
          } else {
            console.warn('Sign-out during refresh recovery failed:', signOutErr);
          }
        }
        setIsAuthenticated(false);
        setAccessToken(null);
        setUserId(null);
        setTier('free');
        setGenerationUsage({ codeUsed: 0, analysisUsed: 0, limit: 1 });
        toast.info('Your session expired. Please sign in again.');
      } else {
        console.error('Auth check error:', error);
      }
    } finally {
      setIsCheckingAuth(false);
    }
  };

  const loadSubscription = async (token: string): Promise<Tier> => {
    let currentTier: Tier = 'free';
    try {
      const res = await fetch(getFunctionUrl('make-server-00a119be/subscription'), {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const planVal = data?.subscription?.plan;
        if (planVal === 'elite') currentTier = 'elite';
        else if (planVal === 'pro' || planVal === 'premium') currentTier = 'pro';
        else currentTier = 'free';
        
        setTier(currentTier);
      } else {
        setTier('free');
      }
    } catch (err) {
      console.warn('Load subscription failed:', err);
      setTier('free');
    }
    return currentTier;
  };

  const loadUsage = async (token: string) => {
    try {
      const res = await fetch(getFunctionUrl('make-server-00a119be/usage'), {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const usage = data?.usage;
        if (usage && typeof usage.count === 'number' && typeof usage.remaining === 'number') {
          setServerUsage(usage);
          // Align client usage counters with server for gating
          setGenerationUsage({ codeUsed: usage.count, analysisUsed: 0, limit: 4 });
        }
      }
    } catch (err) {
      console.warn('Load usage failed:', err);
    }
  };

  const handleAuthenticated = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      setAccessToken(session.access_token);
      setIsAuthenticated(true);
      setUserId(session.user?.id || null);
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
        window.localStorage.setItem(firstKey!, '1');
        setTier('free');
        setCurrentScreen('subscription');
        setActiveTab('profile');
        await loadUsage(session.access_token);
      } else {
        await loadSubscription(session.access_token);
        setCurrentScreen('home');
        setActiveTab('home');
      }
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
    try {
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
      }
    } catch {}
    setCurrentScreen(screen);
    if (strategyId) setSelectedStrategyId(strategyId);
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
    };
    if (screenToTab[screen]) setActiveTab(screenToTab[screen]);
  };

  if (showSplash) {
    return (
      <ThemeProvider>
        <SplashScreen onComplete={() => setShowSplash(false)} />
      </ThemeProvider>
    );
  }

  // Handle Update Password Route (before auth checks)
  if ((typeof window !== 'undefined' && window.location.pathname.includes('update-password')) || currentScreen === "update-password") {
    return (
      <ThemeProvider>
        <UpdatePasswordScreen />
        <Toaster />
      </ThemeProvider>
    );
  }

  if (isCheckingAuth) {
    return (
      <ThemeProvider>
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-600 dark:text-gray-400">Loading...</p>
          </div>
        </div>
      </ThemeProvider>
    );
  }

  if (!isAuthenticated) {
    return (
      <ThemeProvider>
        <>
          <AuthScreen onAuthenticated={handleAuthenticated} recovery={recoveryMode} resetToken={resetToken || undefined} />
          <Toaster />
        </>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <>
      <div className="flex-1 bg-gray-50 dark:bg-gray-900">
        {currentScreen === "home" && (
          <HomeScreen
            onNavigate={handleNavigate}
            accessToken={accessToken}
            isProUser={isProOrElite}
            hasActivePlan={true}
            remainingGenerations={remainingGenerations}
            tier={effectiveTier}
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
          <ProfileScreen onNavigate={handleNavigate} onLogout={handleLogout} accessToken={accessToken} />
        )}
        {currentScreen === "notifications" && (
          <NotificationScreen 
            onNavigate={handleNavigate} 
            accessToken={accessToken} 
            isProUser={isProOrElite}
            onRefreshSubscription={() => accessToken && loadSubscription(accessToken)}
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
          <UpdatePasswordScreen />
        )}
      </div>

      <BottomNav
        activeTab={activeTab}
        onTabChange={(tab: string) => {
          const tabToScreen: Record<string, string> = {
            home: "home",
            chat: "chat",
            convert: "convert",
            analyze: "analyze",
            profile: "profile",
          };
          const nextScreen = tabToScreen[tab];
          // Delegate to navigate to enforce route protection
          handleNavigate(nextScreen);
        }}
      />
      <HelpBubble activeTab={activeTab} onNavigate={handleNavigate} />

      <Toaster />
      </>
    </ThemeProvider>
  );
}
