import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { waitFor } from '@testing-library/dom';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import type { Root } from 'react-dom/client';
// Mock SplashScreen to immediately complete
vi.mock('../components/SplashScreen', () => {
  const React = require('react');
  const { useEffect } = React;
  return {
    SplashScreen: ({ onComplete }: { onComplete: () => void }) => {
      useEffect(() => {
        onComplete();
      }, []);
      return null as any;
    },
  };
});

// Mock Supabase client before importing App
vi.mock('../utils/supabase/client', () => {
  let currentSession: any = null;
  let onAuthCallback: ((event: string, session: any) => void) | null = null;
  return {
    supabase: {
      auth: {
        signInWithPassword: vi.fn(async () => {
          currentSession = { access_token: 'token', user: { id: 'uid' } };
          if (onAuthCallback) onAuthCallback('SIGNED_IN', currentSession);
          return { data: { session: currentSession }, error: null };
        }),
        getSession: vi.fn(async () => ({ data: { session: currentSession } })),
        onAuthStateChange: vi.fn((cb: any) => {
          onAuthCallback = cb;
          return { data: { subscription: { unsubscribe: () => { onAuthCallback = null; } } } };
        }),
      },
    },
    getFunctionUrl: (path: string) => path,
  };
});

// Mock Toaster & toast to avoid timers
vi.mock('../components/ui/sonner', () => ({ Toaster: () => null }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import App from '../App';

describe('Authentication flow navigation', () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    // Reset fetch mock between tests
    (globalThis as any).fetch = vi.fn(async (url: string, _init?: any) => {
      // Default minimal mocks for other endpoints
      if (String(url).includes('usage')) {
        return { ok: true, json: async () => ({ usage: { count: 0, remaining: 4, window: '7d' } }) } as any;
      }
      return { ok: true, json: async () => ({}) } as any;
    });
  });

  afterEach(() => {
    try {
      root?.unmount();
    } catch {}
    try {
      document.body.removeChild(container);
    } catch {}
    // Clear any timers
    vi.clearAllTimers();
  });

  it('premium users bypass Subscription on login', async () => {
    // Supabase mocks are set at module level
    // Mock subscription endpoint to return premium
    (globalThis as any).fetch = vi.fn(async (url: string, _init?: any) => {
      if (String(url).includes('subscription')) {
        return { ok: true, json: async () => ({ subscription: { plan: 'premium' } }) } as any;
      }
      if (String(url).includes('usage')) {
        return { ok: true, json: async () => ({ usage: { count: 0, remaining: 4, window: '7d' } }) } as any;
      }
      return { ok: true, json: async () => ({}) } as any;
    });

    root = createRoot(container);
    await act(async () => {
      root.render(<App />);
    });
    await waitFor(() => {
      const email = container.querySelector('#login-email') as HTMLInputElement | null;
      const pwd = container.querySelector('#login-password') as HTMLInputElement | null;
      const form = container.querySelector('form') as HTMLFormElement | null;
      expect(email && pwd && form).toBeTruthy();
    });

    // Fill login form and submit
    const email = container.querySelector('#login-email') as HTMLInputElement;
    const pwd = container.querySelector('#login-password') as HTMLInputElement;
    const form = container.querySelector('form') as HTMLFormElement;
    email.value = 'user@example.com';
    email.dispatchEvent(new Event('input', { bubbles: true }));
    pwd.value = 'password123';
    pwd.dispatchEvent(new Event('input', { bubbles: true }));
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    await waitFor(() => {
      // Expect Home content, not Subscription
      expect(container.textContent || '').toContain('Recent Strategies');
      expect(container.textContent || '').not.toContain('Choose Your Plan');
    });
  });

  it('basic users are routed to Subscription on login', async () => {
    // Supabase mocks are set at module level
    // Mock subscription endpoint to return basic
    (globalThis as any).fetch = vi.fn(async (url: string, _init?: any) => {
      if (String(url).includes('subscription')) {
        return { ok: true, json: async () => ({ subscription: { plan: 'basic' } }) } as any;
      }
      if (String(url).includes('usage')) {
        return { ok: true, json: async () => ({ usage: { count: 0, remaining: 4, window: '7d' } }) } as any;
      }
      return { ok: true, json: async () => ({}) } as any;
    });

    root = createRoot(container);
    await act(async () => {
      root.render(<App />);
    });
    await waitFor(() => {
      const email = container.querySelector('#login-email') as HTMLInputElement | null;
      const pwd = container.querySelector('#login-password') as HTMLInputElement | null;
      const form = container.querySelector('form') as HTMLFormElement | null;
      expect(email && pwd && form).toBeTruthy();
    });
  
    // Fill login form and submit
    const email = container.querySelector('#login-email') as HTMLInputElement;
    const pwd = container.querySelector('#login-password') as HTMLInputElement;
    const form = container.querySelector('form') as HTMLFormElement;
    email.value = 'user@example.com';
    email.dispatchEvent(new Event('input', { bubbles: true }));
    pwd.value = 'password123';
    pwd.dispatchEvent(new Event('input', { bubbles: true }));
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    await waitFor(() => {
      expect(container.textContent || '').toContain('Choose Your Plan');
    });
  });
});