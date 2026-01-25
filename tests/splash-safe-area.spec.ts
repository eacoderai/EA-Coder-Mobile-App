import { test, expect } from '@playwright/test';

test.describe('Splash screen safe area coverage', () => {
  test('fills viewport and applies safe area padding classes', async ({ page }) => {
    await page.goto('http://localhost:3002/');
    const splash = page.locator('.safe-fill').first();
    await expect(splash).toBeVisible();
    const rect = await splash.boundingBox();
    expect(rect).not.toBeNull();
    const viewport = page.viewportSize();
    expect(Math.round(rect!.width)).toBe(viewport!.width);
    expect(Math.round(rect!.height)).toBe(viewport!.height);
    const paddingBottom = await splash.evaluate((el) => getComputedStyle(el).paddingBottom);
    expect(paddingBottom).toBeDefined();
  });
});

