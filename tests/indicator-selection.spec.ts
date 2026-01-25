import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('TEST_UNLOCK', '1');
  });
});

test('indicator selection, custom input, removal and persistence', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Create New Strategy')).toBeVisible();
  await page.getByText('Create New Strategy').click();

  await expect(page.getByText('Submit Strategy')).toBeVisible();
  await expect(page.getByText('Select Indicator')).toBeVisible();

  const chooseBtn = page.getByRole('button', { name: /Choose indicator|selected|RSI|MACD/i });
  await chooseBtn.click();
  await page.getByText('RSI', { exact: true }).click();

  await expect(page.getByText('RSI', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: /Remove RSI/i }).click();
  await expect(page.getByText('RSI', { exact: true })).toHaveCount(0);

  await chooseBtn.click();
  await page.getByText('Custom Indicator', { exact: true }).click();
  await page.getByPlaceholder('Enter custom indicator').fill('!!');
  await page.getByRole('button', { name: 'Add' }).click();
  await expect(page.getByText(/Only letters, numbers/)).toBeVisible();

  await page.getByPlaceholder('Enter custom indicator').fill('SuperTrend');
  await page.getByRole('button', { name: 'Add' }).click();
  await expect(page.getByText('SuperTrend', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: /arrow-left/i }).click();
  await page.getByText('Create New Strategy').click();
  await expect(page.getByText('SuperTrend', { exact: true })).toBeVisible();
});

