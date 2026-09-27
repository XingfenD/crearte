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
    timeout: 600_000,
    // ⚠️ 不配 gracefulShutdown 时，playwright teardown 用 SIGKILL 杀整个进程组
    // （coreBundle.js: process.kill(-spawnedProcess.pid, "SIGKILL")），SIGKILL 不可被
    // bash trap 捕获 → e2e-stack.sh 的 cleanup 永不触发 → docker 容器 + stack.json +
    // worktree 泄漏（残留的 stack.json ready:true 还会让下次跑误判栈可用 = 二次假绿）。
    // 改发 SIGTERM（超时才 SIGKILL），脚本的 TERM trap 才能跑 cleanup。
    gracefulShutdown: { signal: 'SIGTERM', timeout: 30_000 }
  }
})
