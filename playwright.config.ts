import { defineConfig, devices } from '@playwright/test'

// Runs in the electrical-e2e container against the dev server; the API is mocked with page.route.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  // the electrical-e2e container has a 2Gi memory limit
  workers: 2,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://electrical-app:5173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
