import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e', testMatch: '**/*.e2e.js',
  timeout: 45000, expect: { timeout: 15000 },
  workers: 1, retries: 0,
  metadata: {
    node: process.version, syntheticPagesOnly: true,
    isolatedBrowserOverride: Boolean(process.env.CHATRELAY_E2E_BROWSER_EXECUTABLE),
  },
  reporter: [['list'], ['json', { outputFile: 'artifacts/browser-results.json' }]],
});
