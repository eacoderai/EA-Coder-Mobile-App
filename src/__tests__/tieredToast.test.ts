import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock sonner to capture calls
vi.mock('sonner', () => {
  return {
    toast: {
      error: vi.fn(),
      success: vi.fn(),
      info: vi.fn(),
    },
  };
});

import { toast, setToastAccountType } from '../utils/tieredToast';
import { toast as SonnerToast } from 'sonner';

describe('tieredToast filtering', () => {
  beforeEach(() => {
    (SonnerToast.error as any).mockClear?.();
    (SonnerToast.success as any).mockClear?.();
    (SonnerToast.info as any).mockClear?.();
  });

  it('shows Free-tier message to Free users, hides for Pro users', () => {
    // Free user
    setToastAccountType('free');
    toast.info('Limit reached', { audience: 'upgrade-to-pro' });
    expect(SonnerToast.info).toHaveBeenCalledTimes(1);

    // Pro user
    setToastAccountType('pro');
    toast.info('Limit reached', { audience: 'upgrade-to-pro' });
    expect(SonnerToast.info).toHaveBeenCalledTimes(1); // still 1, no new call
  });

  it('shows Pro-tier message to Pro users, hides for Free users', () => {
    setToastAccountType('pro');
    toast.info('Pro feature available', { audience: 'pro' });
    expect(SonnerToast.info).toHaveBeenCalledTimes(1);

    setToastAccountType('free');
    toast.info('Pro feature available', { audience: 'pro' });
    expect(SonnerToast.info).toHaveBeenCalledTimes(1); // no new call
  });

  it('shows general messages to all user types', () => {
    setToastAccountType('free');
    toast.success('Welcome back!');
    expect(SonnerToast.success).toHaveBeenCalledTimes(1);

    setToastAccountType('pro');
    toast.success('Welcome back!');
    expect(SonnerToast.success).toHaveBeenCalledTimes(2);
  });
});