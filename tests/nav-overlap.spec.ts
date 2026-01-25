import { test, expect } from '@playwright/test';

const devices = [
  { name: 'mobile-375x812', size: { width: 375, height: 812 } },
  { name: 'tablet-810x1080', size: { width: 810, height: 1080 } },
  { name: 'desktop-1280x900', size: { width: 1280, height: 900 } },
];

async function assertNoOverlap(page: any) {
  // Prefer app's internal scroll region; fallback to document scrolling element.
  const scrollEl = await page.evaluateHandle(() => {
    const el = document.querySelector('.mobile-scroll');
    return el || document.scrollingElement || document.documentElement;
  });
  await page.evaluate((el) => { (el as HTMLElement).scrollTop = (el as HTMLElement).scrollHeight; }, scrollEl);
  await page.waitForTimeout(100);

  const nav = page.locator('.bottom-nav');
  const navCount = await nav.count();
  if (navCount === 0) {
    // If nav is not present (e.g., unauthenticated screen), consider no-overlap trivially satisfied.
    return;
  }
  await expect(nav).toBeVisible();
  const navRect = await nav.boundingBox();
  expect(navRect).not.toBeNull();

  // Try last child of app-container, fallback to last child of scroll area
  const lastCandidate = page.locator('.app-container').last().locator(':scope > *').last();
  const hasCandidate = await lastCandidate.count();
  const target = hasCandidate ? lastCandidate : page.locator('.mobile-scroll > *').last();
  const rect = await target.boundingBox();
  expect(rect).not.toBeNull();

  // Assert bottom of content never passes under top of nav
  expect((rect!.y + rect!.height) <= (navRect!.y)).toBeTruthy();

  // Also check scroll padding-bottom >= nav height
  const padBottom = await page.evaluate(() => {
    const el = document.querySelector('.mobile-scroll') as HTMLElement | null;
    if (!el) return null;
    const v = getComputedStyle(el).paddingBottom;
    return parseFloat(v);
  });
  if (padBottom !== null) {
    expect(padBottom).toBeGreaterThanOrEqual(Math.floor(navRect!.height) - 1);
  }
}

for (const d of devices) {
  test.describe(`${d.name}`, () => {
    test.use({ viewport: d.size });
    test('home/analyze/chat/convert/profile no overlap', async ({ page }) => {
      await page.goto('/');
      await assertNoOverlap(page);
      const hasNav = await page.locator('.bottom-nav').count();
      if (hasNav > 0) {
        await page.getByRole('button', { name: 'Analyze' }).click();
        await assertNoOverlap(page);
        await page.getByRole('button', { name: 'Chat' }).click();
        await assertNoOverlap(page);
        await page.getByRole('button', { name: 'Convert' }).click();
        await assertNoOverlap(page);
        await page.getByRole('button', { name: 'Profile' }).click();
        await assertNoOverlap(page);
      }
    });
  });
}
