import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  retries: 0,
  use: {
    baseURL: 'http://localhost:3005',
    screenshot: 'only-on-failure',
    video: 'off',
    headless: true,
  },
  reporter: [['list']],
  webServer: {
    command: 'npm run preview',
    port: 3005,
    timeout: 120000,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
});
