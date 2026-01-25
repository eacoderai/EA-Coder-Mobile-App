import { describe, it, expect } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { AuthScreen } from '../components/AuthScreen';

describe('Auth reset UI', () => {
  it('shows error for weak password', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    root.render(<AuthScreen onAuthenticated={() => {}} recovery={true} resetToken={'tok'} />);
    let pwd: HTMLInputElement | undefined;
    let confirm: HTMLInputElement | undefined;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 20));
      pwd = Array.from(document.querySelectorAll('input')).find(i => (i as HTMLInputElement).id === 'new-password') as HTMLInputElement | undefined;
      confirm = Array.from(document.querySelectorAll('input')).find(i => (i as HTMLInputElement).id === 'confirm-new-password') as HTMLInputElement | undefined;
      if (pwd && confirm) break;
    }
    pwd.value = 'Pass1!'; pwd.dispatchEvent(new Event('input', { bubbles: true }));
    confirm.value = 'Pass1!'; confirm.dispatchEvent(new Event('input', { bubbles: true }));
    let btn: HTMLButtonElement | undefined;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 20));
      btn = Array.from(document.querySelectorAll('button')).find(b => (b as HTMLButtonElement).textContent?.includes('Update Password')) as HTMLButtonElement | undefined;
      if (btn) break;
    }
    if (btn) btn.click();
    await new Promise(r => setTimeout(r, 10));
    const err = Array.from(document.querySelectorAll('p')).find(p => p.textContent?.match(/Password must be at least 8 chars/i));
    expect(!!err).toBe(true);
  });

  it('shows error for mismatched passwords', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    root.render(<AuthScreen onAuthenticated={() => {}} recovery={true} resetToken={'tok'} />);
    let pwd: HTMLInputElement | undefined;
    let confirm: HTMLInputElement | undefined;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 20));
      pwd = Array.from(document.querySelectorAll('input')).find(i => (i as HTMLInputElement).id === 'new-password') as HTMLInputElement | undefined;
      confirm = Array.from(document.querySelectorAll('input')).find(i => (i as HTMLInputElement).id === 'confirm-new-password') as HTMLInputElement | undefined;
      if (pwd && confirm) break;
    }
    pwd.value = 'Str0ng!Pass'; pwd.dispatchEvent(new Event('input', { bubbles: true }));
    confirm.value = 'Mismatch'; confirm.dispatchEvent(new Event('input', { bubbles: true }));
    let btn: HTMLButtonElement | undefined;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 20));
      btn = Array.from(document.querySelectorAll('button')).find(b => (b as HTMLButtonElement).textContent?.includes('Update Password')) as HTMLButtonElement | undefined;
      if (btn) break;
    }
    if (btn) btn.click();
    await new Promise(r => setTimeout(r, 10));
    const err = Array.from(document.querySelectorAll('p')).find(p => p.textContent?.match(/Passwords don't match/i));
    expect(!!err).toBe(true);
  });

  it('successful password update flow via token', async () => {
    const originalFetch = global.fetch as any;
    global.fetch = async (url: any, init: any) => {
      if (String(url).includes('reset/confirm')) {
        return {
          ok: true,
          json: async () => ({ ok: true })
        } as any;
      }
      return originalFetch(url, init);
    };
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    root.render(<AuthScreen onAuthenticated={() => {}} recovery={true} resetToken={'tok'} />);
    let pwd: HTMLInputElement | undefined;
    let confirm: HTMLInputElement | undefined;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 20));
      pwd = Array.from(document.querySelectorAll('input')).find(i => (i as HTMLInputElement).id === 'new-password') as HTMLInputElement | undefined;
      confirm = Array.from(document.querySelectorAll('input')).find(i => (i as HTMLInputElement).id === 'confirm-new-password') as HTMLInputElement | undefined;
      if (pwd && confirm) break;
    }
    pwd.value = 'Str0ng!Pass'; pwd.dispatchEvent(new Event('input', { bubbles: true }));
    confirm.value = 'Str0ng!Pass'; confirm.dispatchEvent(new Event('input', { bubbles: true }));
    let btn: HTMLButtonElement | undefined;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 20));
      btn = Array.from(document.querySelectorAll('button')).find(b => (b as HTMLButtonElement).textContent?.includes('Update Password')) as HTMLButtonElement | undefined;
      if (btn) break;
    }
    if (btn) btn.click();
    await new Promise(r => setTimeout(r, 10));
    const ok = Array.from(document.querySelectorAll('p')).find(p => p.textContent?.match(/Password updated successfully/i));
    expect(!!ok).toBe(true);
    global.fetch = originalFetch;
  });

  it('shows error for expired token', async () => {
    const originalFetch = global.fetch as any;
    global.fetch = async (url: any, init: any) => {
      if (String(url).includes('reset/confirm')) {
        return {
          ok: false,
          json: async () => ({ error: 'Token expired' })
        } as any;
      }
      return originalFetch(url, init);
    };
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    root.render(<AuthScreen onAuthenticated={() => {}} recovery={true} resetToken={'tok'} />);
    let pwd: HTMLInputElement | undefined;
    let confirm: HTMLInputElement | undefined;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 20));
      pwd = Array.from(document.querySelectorAll('input')).find(i => (i as HTMLInputElement).id === 'new-password') as HTMLInputElement | undefined;
      confirm = Array.from(document.querySelectorAll('input')).find(i => (i as HTMLInputElement).id === 'confirm-new-password') as HTMLInputElement | undefined;
      if (pwd && confirm) break;
    }
    pwd.value = 'Str0ng!Pass'; pwd.dispatchEvent(new Event('input', { bubbles: true }));
    confirm.value = 'Str0ng!Pass'; confirm.dispatchEvent(new Event('input', { bubbles: true }));
    let btn: HTMLButtonElement | undefined;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 20));
      btn = Array.from(document.querySelectorAll('button')).find(b => (b as HTMLButtonElement).textContent?.includes('Update Password')) as HTMLButtonElement | undefined;
      if (btn) break;
    }
    if (btn) btn.click();
    await new Promise(r => setTimeout(r, 10));
    const err = Array.from(document.querySelectorAll('p')).find(p => p.textContent?.match(/Failed to update password/i));
    expect(!!err).toBe(true);
    global.fetch = originalFetch;
  });
});
