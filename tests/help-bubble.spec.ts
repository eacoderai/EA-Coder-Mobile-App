import { test, expect } from '@playwright/test';

test.describe('HelpBubble Component', () => {
  test.beforeEach(async ({ page }) => {
    // Go to home page
    await page.goto('/');
    // Wait for app to load (checking for a key element)
    await page.waitForSelector('main', { state: 'visible' });
  });

  test('should display the help bubble button', async ({ page }) => {
    const helpButton = page.locator('button[aria-label="Open Help Center"]');
    await expect(helpButton).toBeVisible();
    await expect(helpButton).toHaveCSS('position', 'static'); // The button itself is static inside a fixed container, or the button has fixed class?
    // In code: div is fixed, button is inside.
    // Let's check the container z-index if possible, but locator points to button.
    // We can just check it's visible and clickable.
  });

  test('should open help dialog when clicked', async ({ page }) => {
    const helpButton = page.locator('button[aria-label="Open Help Center"]');
    await helpButton.click();

    // Check for dialog title
    const dialogTitle = page.locator('h2', { hasText: 'Help Center' });
    await expect(dialogTitle).toBeVisible();

    // Check for tabs
    await expect(page.getByRole('tab', { name: 'Context' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'FAQ' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Videos' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Contact' })).toBeVisible();
  });

  test('should switch tabs correctly', async ({ page }) => {
    const helpButton = page.locator('button[aria-label="Open Help Center"]');
    await helpButton.click();

    // Default tab is Context
    await expect(page.getByText('Home Dashboard')).toBeVisible();

    // Switch to FAQ
    await page.getByRole('tab', { name: 'FAQ' }).click();
    await expect(page.getByPlaceholder('Search for answers...')).toBeVisible();

    // Switch to Videos
    await page.getByRole('tab', { name: 'Videos' }).click();
    // Check for a video title placeholder or existing one
    // We know VIDEO_TUTORIALS has "Getting Started with EA Coder"
    await expect(page.getByText('Getting Started with EA Coder')).toBeVisible();

    // Switch to Contact
    await page.getByRole('tab', { name: 'Contact' }).click();
    await expect(page.getByLabel('Subject')).toBeVisible();
    await expect(page.getByLabel('Message')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send Message' })).toBeVisible();
  });

  test('should close the dialog', async ({ page }) => {
    const helpButton = page.locator('button[aria-label="Open Help Center"]');
    await helpButton.click();

    const dialogTitle = page.locator('h2', { hasText: 'Help Center' });
    await expect(dialogTitle).toBeVisible();

    // Click close button
    const closeButton = page.locator('button[aria-label="Close"]');
    await closeButton.click();

    await expect(dialogTitle).not.toBeVisible();
  });

  test('visual alignment check', async ({ page }) => {
    const helpButton = page.locator('button[aria-label="Open Help Center"]');
    await helpButton.click();
    
    // Wait for animation
    await page.waitForTimeout(500);

    // Check modal alignment
    const dialogContent = page.locator('[role="dialog"]');
    // It should be centered
    // This is hard to assert exactly without visual snapshot, but we can check bounds
    const box = await dialogContent.boundingBox();
    const viewport = page.viewportSize();
    
    if (box && viewport) {
      // Allow some margin of error for pixel perfection
      const centerX = box.x + box.width / 2;
      const centerY = box.y + box.height / 2;
      const viewCenterX = viewport.width / 2;
      const viewCenterY = viewport.height / 2;
      
      expect(Math.abs(centerX - viewCenterX)).toBeLessThan(2);
      expect(Math.abs(centerY - viewCenterY)).toBeLessThan(2);
    }

    // Visual Regression Snapshot
    // This will compare against a stored baseline (if it exists) or create a new one
    // Run 'npx playwright test --update-snapshots' to generate initial screenshots
    await expect(page).toHaveScreenshot('help-bubble-modal.png');
  });
});
