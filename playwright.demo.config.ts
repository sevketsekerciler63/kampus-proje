import { defineConfig, devices } from '@playwright/test'

// Hata raporlayıcıyı göstermek için bilerek başarısız olan senaryoları çalıştırır.
// Ana yapılandırmadan (playwright.config.ts) ayrıdır; `npm run test:e2e` bunları çalıştırmaz.
export default defineConfig({
  testDir: './e2e-demo',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  expect: { timeout: 2000 },
  reporter: [['list'], ['./e2e/failure-reporter.ts', { outputDir: 'test-reports' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
})
