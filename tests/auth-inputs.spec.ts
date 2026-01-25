import { test, expect } from '@playwright/test';

test.describe('AuthScreen Liquid Glass Inputs', () => {
  test('inputs should have liquid glass styles', async ({ page }) => {
    await page.goto('/');

    // Check login email input
    const emailInput = page.locator('#login-email');
    await expect(emailInput).toBeVisible();

    // Verify styles
    const styles = await emailInput.evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        borderRadius: s.borderRadius,
        backdropFilter: s.backdropFilter || s.webkitBackdropFilter,
        backgroundColor: s.backgroundColor,
      };
    });

    // Check border radius (24px)
    expect(styles.borderRadius).toBe('24px');
    
    // Check backdrop filter
    expect(styles.backdropFilter).toContain('blur');

    // Check background color (rgba(255, 255, 255, 0.1))
    // Note: Playwright might normalize colors, so we check loosely or exact if possible
    expect(styles.backgroundColor).toBe('rgba(255, 255, 255, 0.1)');
  });
});
