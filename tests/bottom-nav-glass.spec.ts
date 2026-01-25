import { test, expect } from '@playwright/test';

test.describe('Bottom Navigation Glass Effect', () => {
  test('nav-wrapper should be transparent and nav-background should be absent', async ({ page }) => {
    await page.goto('/');

    // Wait for nav
    const navWrapper = page.locator('.nav-wrapper');
    await expect(navWrapper).toBeVisible();

    // Verify nav-wrapper is transparent
    // Note: getComputedStyle might return 'rgba(0, 0, 0, 0)' or 'transparent'
    const wrapperBg = await navWrapper.evaluate((el) => getComputedStyle(el).backgroundColor);
    // 'rgba(0, 0, 0, 0)' is transparent in most browsers
    expect(wrapperBg).toBe('rgba(0, 0, 0, 0)');

    // Verify nav-background element is NOT present
    const navBackground = page.locator('.nav-background');
    await expect(navBackground).toHaveCount(0);

    // Verify the inner glass container exists and has glass styles
    // The glass container is the div inside nav
    const glassContainer = page.locator('nav.bottom-nav > div');
    await expect(glassContainer).toBeVisible();

    const glassStyle = await glassContainer.evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        backdropFilter: style.backdropFilter || style.webkitBackdropFilter,
        backgroundColor: style.backgroundColor,
      };
    });

    // Check for blur (part of glass effect)
    // Note: browsers might normalize 'blur(20px)' string
    expect(glassStyle.backdropFilter).toContain('blur');
    
    // Check for semi-transparent background
    // rgba(0, 0, 0, 0.5)
    expect(glassStyle.backgroundColor).toBe('rgba(0, 0, 0, 0.5)');
  });
});
