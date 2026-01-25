import { test, expect } from '@playwright/test';

const url = 'http://localhost:3002/';

test.describe('App container responsive width', () => {
  const cases = [
    { w: 375, h: 812, expected: 375 }, // base
    { w: 640, h: 800, expected: 512 }, // sm
    { w: 768, h: 900, expected: 576 }, // md
    { w: 1024, h: 900, expected: 672 }, // lg
    { w: 1280, h: 900, expected: 768 }, // xl
  ];

  for (const c of cases) {
    test(`viewport ${c.w}x${c.h} -> container ≈ ${c.expected}px`, async ({ page }) => {
      await page.setViewportSize({ width: c.w, height: c.h });
      await page.goto(url);
      const rect = await page.locator('.app-container').last().boundingBox();
      expect(rect).not.toBeNull();
      const width = rect!.width;
      expect(width).toBeGreaterThanOrEqual(c.expected - 2);
      expect(width).toBeLessThanOrEqual(c.expected + 2);
    });
  }
});
