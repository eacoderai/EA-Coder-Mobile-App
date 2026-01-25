import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
// Optional runtime integration: no-op on web if plugin absent
function getStatusBar(): { StatusBar: any; Style: any } | null {
  try {
    // Prefer global plugin access to avoid bundler import issues on web
    const globalCap = (window as any)?.Capacitor;
    const sb = globalCap?.Plugins?.StatusBar;
    if (sb) {
      // Style enum mirrors: { Dark: 1, Light: 0 } in Capacitor
      const Style = { Dark: 1, Light: 0 } as const;
      return { StatusBar: sb, Style } as any;
    }
  } catch {}
  return null;
}

type Theme = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  setTheme: (t: Theme) => void;
  storageAvailable: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

// Safe storage with fallbacks: localStorage → cookie → in-memory
function createStorage() {
  let memory: Record<string, string> = {};
  const cookieKey = 'ui:theme';

  const ls = {
    get(key: string): string | null {
      try {
        return typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
      } catch {
        return null;
      }
    },
    set(key: string, value: string) {
      try {
        if (typeof window !== 'undefined') window.localStorage.setItem(key, value);
        return true;
      } catch {
        return false;
      }
    }
  };

  const cookies = {
    get(): string | null {
      try {
        if (typeof document === 'undefined') return null;
        const match = document.cookie.match(new RegExp(`${cookieKey}=([^;]+)`));
        return match ? decodeURIComponent(match[1]) : null;
      } catch {
        return null;
      }
    },
    set(value: string) {
      try {
        if (typeof document !== 'undefined') {
          const expires = new Date();
          expires.setFullYear(expires.getFullYear() + 5);
          document.cookie = `${cookieKey}=${encodeURIComponent(value)}; path=/; expires=${expires.toUTCString()}`;
          return true;
        }
      } catch {}
      return false;
    }
  };

  return {
    getTheme(): Theme | null {
      const raw = ls.get('ui:theme');
      if (raw === 'light' || raw === 'dark') return raw;
      const cRaw = cookies.get();
      if (cRaw === 'light' || cRaw === 'dark') return cRaw as Theme;
      const mem = memory['ui:theme'];
      if (mem === 'light' || mem === 'dark') return mem as Theme;
      return null;
    },
    setTheme(value: Theme): boolean {
      // Try localStorage first
      if (ls.set('ui:theme', value)) return true;
      // Fallback to cookie
      if (cookies.set(value)) return true;
      // Last resort: memory (not persistent across restarts)
      memory['ui:theme'] = value;
      return false;
    },
    isPersistent(): boolean {
      try {
        if (typeof window === 'undefined') return false;
        const testKey = '__theme_test__';
        window.localStorage.setItem(testKey, '1');
        window.localStorage.removeItem(testKey);
        return true;
      } catch {
        // Cookie fallback still provides persistence in many cases
        try {
          if (typeof document === 'undefined') return false;
          document.cookie = '__theme_cookie_test__=1; path=/';
          return true;
        } catch {
          return false;
        }
      }
    }
  };
}

function detectSystemTheme(): Theme {
  try {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
  } catch {}
  return 'light';
}

function applyThemeToDocument(theme: Theme) {
  try {
    const root = document.documentElement;
    if (!root) return;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    root.setAttribute('data-theme', theme);
    // Sync native status bar with app theme and enable edge-to-edge overlay
    try {
      const platform = Capacitor?.getPlatform?.() || 'web';
      const api = getStatusBar();
      if ((platform === 'ios' || platform === 'android') && api) {
        api.StatusBar?.setOverlaysWebView?.({ overlay: true }).catch(() => {});
        const style = theme === 'dark' ? api.Style.Dark : api.Style.Light;
        api.StatusBar?.setStyle?.({ style }).catch(() => {});
      }
    } catch {}
  } catch (err) {
    console.warn('Failed to apply theme to document:', err);
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const storage = useMemo(createStorage, []);
  const [theme, setThemeState] = useState<Theme>(() => storage.getTheme() ?? 'light');
  const mounted = useRef(false);

  // Initialize document theme on mount
  useEffect(() => {
    applyThemeToDocument(theme);
    mounted.current = true;
    // Avoid changing theme due to system updates; only change when user toggles
  }, []);

  const setTheme = (t: Theme) => {
    setThemeState((prev) => {
      if (prev === t) return prev;
      // Persist with safe fallbacks
      const persisted = storage.setTheme(t);
      if (!persisted) {
        console.warn('Theme preference saved in memory only (no persistent storage available).');
      }
      applyThemeToDocument(t);
      return t;
    });
  };

  // Keep document attributes in sync if theme changes programmatically
  useEffect(() => {
    if (!mounted.current) return;
    applyThemeToDocument(theme);
  }, [theme]);

  const value: ThemeContextValue = {
    theme,
    setTheme,
    storageAvailable: storage.isPersistent(),
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
