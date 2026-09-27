import { defineConfig } from '@playwright/test'

// 真栈 smoke：webServer 由 e2e-stack.sh 编排（docker 依赖缺失自动降级 skip 模式）。
// 与主套件隔离（独立端口 4175 / 独立 testMatch），不跑 noauth。
export default defineConfig({
  testDir: './e2e',
  testMatch: 'full-loop.spec.ts',
  baseURL: 'http://localhost:4175',
  workers: 1,
  timeout: 120_000,
  use: { trace: 'retain-on-failure' },
  webServer: {
    command: 'bash scripts/e2e-stack.sh',
    url: 'http://localhost:4175/',
    reuseExistingServer: false,
    timeout: 600_000
  }
})
