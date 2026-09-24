import { defineConfig, devices } from '@playwright/test'

/** The production preview of the already-built `dist`; `npm run test:e2e` builds it first. */
const PREVIEW_PORT = 4173
const baseURL = `http://127.0.0.1:${PREVIEW_PORT}`

export default defineConfig({
  testDir: './e2e',
  forbidOnly: !!process.env.CI,
  // A flaky browser test must fail the gate, never be retried into green.
  retries: 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL,
    // Diagnostics are kept only for failing tests.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: `npx vite preview --host 127.0.0.1 --port ${PREVIEW_PORT} --strictPort`,
    url: baseURL,
    // Always serve the freshly built `dist`, never an unrelated server on the port.
    reuseExistingServer: false,
    timeout: 30_000,
  },
})
