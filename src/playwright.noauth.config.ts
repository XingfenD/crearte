import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testMatch: /noauth\.spec\.ts/,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  use: { baseURL: 'http://localhost:4174', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run build:e2e:noauth && node scripts/serve-runtime.mjs --port 4174',
    url: 'http://localhost:4174',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000
  }
})
