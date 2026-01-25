import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { waitFor } from '@testing-library/dom';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { ProfileScreen } from '../components/ProfileScreen';
import { ThemeProvider } from '../components/ThemeProvider';

// Mock Supabase client to avoid network calls during ProfileScreen effects
vi.mock('../utils/supabase/client', () => ({
  supabase: { auth: { getUser: vi.fn(async () => ({ data: { user: null } })) } },
  getFunctionUrl: (path: string) => path,
}));

describe('ProfileScreen navigation', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    try { root?.unmount(); } catch {}
    try { document.body.removeChild(container); } catch {}
  });

  it('navigates to Privacy & Security on click', async () => {
    const onNavigate = vi.fn();
    root = createRoot(container);
    root.render(
      <ThemeProvider>
        <ProfileScreen onLogout={() => {}} onNavigate={onNavigate} accessToken={null} />
      </ThemeProvider>
    );

    await waitFor(() => {
      expect(container.textContent || '').toContain('Privacy & Security');
    });

    const buttons = Array.from(container.querySelectorAll('[role="button"]')) as HTMLElement[];
    const target = buttons.find(el => (el.textContent || '').includes('Privacy & Security')) || null;
    expect(target).toBeTruthy();
    target!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onNavigate).toHaveBeenCalledWith('privacy');
  });

  it('navigates to Terms & Conditions on click', async () => {
    const onNavigate = vi.fn();
    root = createRoot(container);
    root.render(
      <ThemeProvider>
        <ProfileScreen onLogout={() => {}} onNavigate={onNavigate} accessToken={null} />
      </ThemeProvider>
    );

    await waitFor(() => {
      expect(container.textContent || '').toContain('Terms & Conditions');
    });

    const buttons = Array.from(container.querySelectorAll('[role="button"]')) as HTMLElement[];
    const target = buttons.find(el => (el.textContent || '').includes('Terms & Conditions')) || null;
    expect(target).toBeTruthy();
    target!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(onNavigate).toHaveBeenCalledWith('terms');
  });
});