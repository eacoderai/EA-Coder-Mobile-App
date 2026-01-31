import React, { useState, useEffect } from "react";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Switch } from "./ui/switch";
import { Toggle } from "./ui/toggle";
import { Separator } from "./ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./ui/alert-dialog";
import { User, Mail, Moon, Sun, LogOut, Shield, FileText, Crown, ChevronRight, Zap, Star, Play } from "lucide-react";
import { supabase } from '../utils/supabase/client';
import { toast } from "../utils/tieredToast";
import { Tier } from "../types/user";
import logoImage from "../assets/1525789d760b07ee395e05af9b06d7202ebb7883.png";
import guideThumbnail from "../assets/guide-thumbnail.png";
import { projectId } from '../utils/supabase/info';
import { getFunctionUrl } from '../utils/supabase/client';
import { useTheme } from "./ThemeProvider";
import { NotificationBell } from "./ui/NotificationBell";

interface ProfileScreenProps {
  onLogout: () => void;
  onNavigate?: (screen: string) => void;
  accessToken?: string | null;
}

export function ProfileScreen({ onLogout, onNavigate, accessToken }: ProfileScreenProps) {
  const [user, setUser] = useState<any>(null);
  const { theme, setTheme } = useTheme();
  const darkMode = theme === 'dark';
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subscription, setSubscription] = useState<{ plan: Tier } | null>(null);
  // Navigation loading state for accessible feedback during redirects
  const [isNavigatingTo, setIsNavigatingTo] = useState<null | 'privacy' | 'terms'>(null);
  const [isVideoThumbnailLoaded, setIsVideoThumbnailLoaded] = useState(false);

  /**
   * Navigation handlers for App Info section
   * - Adds accessible click targets (role, aria-label, tabIndex)
   * - Maintains app state using provided onNavigate()
   * - Provides loading and error feedback via local state and toast
   * - Same-tab navigation; no window.open used
   */
  const navigateTo = async (target: 'privacy' | 'terms') => {
    setIsNavigatingTo(target);
    try {
      if (onNavigate) {
        onNavigate(target);
      } else {
        // Fallback: preserve history without leaving SPA
        window.location.hash = target;
      }
    } catch (err: any) {
      console.error(`[Profile] Navigation to ${target} failed`, err);
      toast.error(err?.message || 'Navigation failed');
    } finally {
      setIsNavigatingTo(null);
    }
  };

  useEffect(() => {
    loadUser();
    loadSubscription();
  }, []);

  const loadUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setUser(user);
      setEmail(user.email || '');
      const meta = user.user_metadata || {} as any;
      setName(meta.display_name || meta.full_name || meta.name || '');
    }
  };

  const loadSubscription = async () => {
    if (!accessToken) return;
    
    try {
      const response = await fetch(
      getFunctionUrl('make-server-00a119be/subscription'),
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        setSubscription(data.subscription);
      }
    } catch (error) {
      console.error('Error loading subscription:', error);
    }
  };

  const toggleDarkMode = (checked: boolean) => {
    try {
      setTheme(checked ? 'dark' : 'light');
    } catch (err) {
      console.warn('Failed to toggle theme:', err);
    }
  };

  const handleLogout = async () => {
    try {
      const scope = import.meta.env.DEV ? 'local' : 'global';
      await supabase.auth.signOut({ scope } as any);
    } catch (err: any) {
      const msg = String(err?.message || '');
      // Ignore fetch abort noise from the browser during navigation
      if (/AbortError|aborted|ERR_ABORTED/i.test(msg)) {
        console.warn('Supabase signOut aborted (harmless):', err);
      } else {
        console.warn('Supabase signOut error:', err);
        toast.error('Network hiccup during logout. You are signed out locally.');
      }
    } finally {
      onLogout();
      toast.success("Logged out successfully");
    }
  };

  const glassCardStyle: React.CSSProperties = {
    backdropFilter: 'blur(10px)',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    border: '1px solid rgba(255, 255, 255, 0.18)',
    borderRadius: '25px',
    boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.37)',
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div
        className="sticky top-0 z-50 bg-gradient-to-r from-blue-600 to-blue-800 text-white p-6 pb-10 rounded-b-[30px] mb-4"
        style={{ borderBottomLeftRadius: 30, borderBottomRightRadius: 30 }}
      >
        <div className="app-container flex items-center justify-between">
          <div className="flex items-center mb-4">
            <div className="bg-white p-3 rounded-full mr-4">
              <User className="w-8 h-8 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl">{name || 'User'}</h1>
              <p className="text-sm text-blue-100">{email}</p>
            </div>
          </div>
          <NotificationBell accessToken={accessToken || null} onNavigate={onNavigate} />
        </div>
      </div>

  <div className="app-container flex-1 px-[9px] py-4 safe-nav-pad space-y-4">
        {/* Subscription Card */}
        {subscription && onNavigate && (
          <Card
            style={glassCardStyle}
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => onNavigate('subscription')}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    subscription.plan === 'elite'
                      ? 'bg-yellow-100 dark:bg-yellow-900/30'
                      : (subscription.plan === 'pro' || subscription.plan === 'premium')
                      ? 'bg-blue-100 dark:bg-blue-900/30'
                      : 'bg-gray-100 dark:bg-gray-800'
                  }`}>
                    {subscription.plan === 'elite' ? (
                      <Crown className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                    ) : (subscription.plan === 'pro' || subscription.plan === 'premium') ? (
                      <Star className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    ) : (
                      <Zap className="w-5 h-5 text-gray-500" />
                    )}
                  </div>
                  <div>
                    <p className="text-gray-900 dark:text-white capitalize font-medium">
                      {(subscription.plan === 'premium' ? 'pro' : subscription.plan)} Plan
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      {subscription.plan === 'elite' 
                        ? 'All features unlocked'
                        : (subscription.plan === 'pro' || subscription.plan === 'premium')
                        ? 'Pro features active' 
                        : 'Upgrade to unlock more features'}
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tutorial Card */}
        <Card style={glassCardStyle}>
          <CardHeader>
            <CardTitle className="text-base">How to Navigate and Use This App</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative aspect-video rounded-lg overflow-hidden bg-gray-200 dark:bg-gray-800">
              {!isVideoThumbnailLoaded && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  </div>
              )}
              <img
                src={guideThumbnail}
                alt="Tutorial Thumbnail"
                className={`w-full h-full object-cover transition-opacity duration-300 ${isVideoThumbnailLoaded ? 'opacity-100' : 'opacity-0'}`}
                onLoad={() => setIsVideoThumbnailLoaded(true)}
              />
              <div 
                className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/40 transition-colors group cursor-pointer" 
                onClick={() => window.open('https://www.youtube.com/watch?v=dQw4w9WgXcQ', '_blank')}
                role="button"
                aria-label="Play tutorial video"
              >
                <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center pl-1 shadow-lg group-hover:scale-110 transition-transform">
                   <Play className="w-6 h-6 text-blue-600 fill-blue-600" />
                </div>
              </div>
            </div>
            <div>
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
                    Learn how to create strategies, analyze results, and manage your subscription in this quick tutorial.
                </p>
                <Button 
                    className="w-full" 
                    variant="outline" 
                    onClick={() => window.open('https://www.youtube.com/watch?v=dQw4w9WgXcQ', '_blank')}
                    style={{ borderRadius: '25px' }}
                >
                    Watch Tutorial
                </Button>
            </div>
          </CardContent>
        </Card>

        {/* Account Settings */}
        <Card style={glassCardStyle}>
          <CardHeader>
            <CardTitle className="text-base">Account Settings</CardTitle>
            <CardDescription>Manage your profile information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-gray-400" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  disabled
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Preferences */}
        <Card style={glassCardStyle}>
          <CardHeader>
            <CardTitle className="text-base">Preferences</CardTitle>
            <CardDescription>Customize your experience</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {darkMode ? (
                  <Moon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                ) : (
                  <Sun className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                )}
                <div>
                  <p className="text-sm text-gray-900 dark:text-white">Dark Mode</p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    Toggle dark theme
                  </p>
                </div>
              </div>
              <Toggle
                pressed={darkMode}
                onPressedChange={toggleDarkMode}
                aria-label="Toggle dark mode"
                variant="outline"
              >
                {darkMode ? (
                  <Moon className="h-4 w-4" />
                ) : (
                  <Sun className="h-4 w-4" />
                )}
              </Toggle>
            </div>
          </CardContent>
        </Card>

        {/* App Info */}
        <Card style={glassCardStyle}>
          <CardHeader>
            <CardTitle className="text-base">About EA Coder</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3 text-sm">
              <img
                src={logoImage}
                alt="EA Coder"
                className="w-15 h-16"
              />
              <div>
                <p className="text-gray-900 dark:text-white">Version 1.0</p>
                <p className="text-xs text-gray-600 dark:text-gray-400">AI-Powered EA Generator</p>
              </div>
            </div>
            
            <Separator />
            
            <div
              className={`flex items-center gap-3 text-sm cursor-pointer ${isNavigatingTo === 'privacy' ? 'opacity-60' : ''}`}
              role="button"
              aria-label="Navigate to Privacy & Security"
              aria-busy={isNavigatingTo === 'privacy'}
              tabIndex={0}
              onClick={() => navigateTo('privacy')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') navigateTo('privacy');
              }}
            >
              <Shield className="w-5 h-5 text-green-600" />
              <div>
                <p className="text-gray-900 dark:text-white">Privacy & Security</p>
                <p className="text-xs text-gray-600 dark:text-gray-400">Your data is encrypted</p>
              </div>
            </div>
            
            <Separator />
            
            <div
              className={`flex items-center gap-3 text-sm cursor-pointer ${isNavigatingTo === 'terms' ? 'opacity-60' : ''}`}
              role="button"
              aria-label="Navigate to Terms & Conditions"
              aria-busy={isNavigatingTo === 'terms'}
              tabIndex={0}
              onClick={() => navigateTo('terms')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') navigateTo('terms');
              }}
            >
              <FileText className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              <div>
                <p className="text-gray-900 dark:text-white">Terms & Conditions</p>
                <p className="text-xs text-gray-600 dark:text-gray-400">View legal information</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Disclaimer */}
        <Card style={glassCardStyle}>
          <CardContent className="p-4">
            <p className="text-xs text-amber-800 dark:text-amber-200">
              <strong>Trading Disclaimer:</strong> EA Coder generates code and analysis for educational and research purposes. 
              Trading involves substantial risk of loss. Always test strategies thoroughly on demo accounts. 
              We do not provide financial advice.
            </p>
          </CardContent>
        </Card>

        {/* Logout */}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="destructive"
              className="w-full !rounded-[25px]"
              style={{ borderRadius: '25px' }}
            >
              <LogOut className="w-4 h-4 mr-2" />
              Log Out
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent style={{ borderRadius: '25px' }}>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm Logout</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to log out of your account?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="!rounded-[25px]" style={{ borderRadius: '25px' }}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleLogout} className="bg-destructive text-destructive-foreground hover:bg-destructive/90 !rounded-[25px]" style={{ borderRadius: '25px' }}>
                Log Out
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
