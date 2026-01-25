import { test, expect } from '@playwright/test';

// Device viewports covering phones and tablets
const devices = [
  { name: 'iPhone 12 Pro portrait', size: { width: 390, height: 844 } },
  { name: 'iPhone 12 Pro landscape', size: { width: 844, height: 390 } },
  { name: 'iPhone 14 Pro Max portrait', size: { width: 430, height: 932 } },
  { name: 'iPhone 14 Pro Max landscape', size: { width: 932, height: 430 } },
  { name: 'Pixel 5 portrait', size: { width: 393, height: 851 } },
  { name: 'Pixel 5 landscape', size: { width: 851, height: 393 } },
  { name: 'Galaxy S9 portrait', size: { width: 360, height: 740 } },
  { name: 'Galaxy S9 landscape', size: { width: 740, height: 360 } },
  { name: 'iPad 10.2 portrait', size: { width: 810, height: 1080 } },
  { name: 'iPad 10.2 landscape', size: { width: 1080, height: 810 } },
  { name: 'iPad Pro 12.9 portrait', size: { width: 1024, height: 1366 } },
  { name: 'iPad Pro 12.9 landscape', size: { width: 1366, height: 1024 } },
  { name: 'Tablet 800x1280 portrait', size: { width: 800, height: 1280 } },
  { name: 'Tablet 1280x800 landscape', size: { width: 1280, height: 800 } },
];

for (const d of devices) {
  test.describe(d.name, () => {
    test.use({ viewport: d.size, deviceScaleFactor: 1 });

    test('container fits viewport and renders', async ({ page }) => {
      await page.goto('/');

      const container = page.locator('.mobile-container');
      await expect(container).toBeVisible();

      const box = await container.boundingBox();
      expect(box).not.toBeNull();
      // Assert container height equals the viewport height (allow 1px tolerance)
      const tolerance = 1;
      expect(Math.abs((box!.height ?? 0) - d.size.height)).toBeLessThanOrEqual(tolerance);

      // Snapshot for visual regression
      await expect(container).toHaveScreenshot(
        `${d.name.replace(/\s+/g, '-')}.png`,
        {
          maxDiffPixelRatio: 0.03,
          animations: 'disabled',
          caret: 'hide',
        }
      );
    });
  });
}