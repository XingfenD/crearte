import { existsSync, readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { zipSync } from 'fflate'

const stackFile = new URL('../fixtures/generated/stack.json', import.meta.url)
const stack = existsSync(stackFile)
  ? (JSON.parse(readFileSync(stackFile, 'utf8')) as { ready: boolean; apiBase: string; adminEmail: string; adminPassword: string })
  : null

test.skip(!stack?.ready, '真栈不可用（docker/后端仓/go 缺失），跳过 full-loop smoke')

const WEB = 'http://localhost:4175'
const workId = `stack-work-${Date.now().toString(36)}`
const userEmail = `submitter-${Date.now()}@stack.local`
const userPassword = 'stack-user-password'
const ZIP = zipSync({
  // ⚠️ 不可写成 `[new TextEncoder().encode(…)]`：fflate 的 `ZippableFile = Uint8Array | Zippable |
  // [Uint8Array | Zippable, ZipOptions]`（index.d.ts:1020），单元素数组不是合法的 [file, options]
  // 元组 → typecheck 红。Task 10 偏差① 已实测确认，此处照正确写法。
  'index.html': new TextEncoder().encode(
    '<!doctype html><html><body><script>document.body.dataset.ok="stack";document.body.dataset.ready="1"</script></body></html>'
  )
})

test('全链路：注册→提交→过审→目录可见→可玩→revoke→降级', async ({ page, browser }) => {
  test.setTimeout(240_000)

  // 1. 用户注册（真实 UI + 真实后端）
  await page.goto(`${WEB}/register`)
  await page.locator('#register-email').fill(userEmail)
  await page.locator('#register-name').fill('Stack Submitter')
  await page.locator('#register-password').fill(userPassword)
  await page.getByRole('button', { name: '注册' }).click()
  await expect(page).toHaveURL(`${WEB}/`)

  // 2. 新建 virtual 提交 + 真实上传（服务端加密）
  await page.goto(`${WEB}/submit/new`)
  await page.getByLabel('名称').fill('Stack Work')
  await page.locator('[data-testid=work-id]').fill(workId)
  await page.getByLabel('作品原始链接').fill(`https://example.com/${workId}`)
  await page.getByLabel('作者名').fill('Stack Submitter')
  await page.getByLabel('描述').fill('Real-stack smoke work.')
  await page.locator('[data-testid=runtime-virtual]').check()
  await page.locator('[data-testid=version]').fill('v1')
  await page.locator('[data-testid=bundle-file]').setInputFiles({ name: 'bundle.zip', mimeType: 'application/zip', buffer: Buffer.from(ZIP) })
  await expect(page.locator('[data-testid=bundle-done]')).toBeVisible({ timeout: 30_000 })
  page.once('dialog', (d) => void d.accept())
  await page.locator('[data-testid=submit-review]').click()
  await expect(page).toHaveURL(`${WEB}/submit`)
  await expect(page.getByText('审核中')).toBeVisible()

  // 3. admin（独立 context，脚本预置账号）审核通过
  const adminCtx = await browser.newContext()
  const adminPage = await adminCtx.newPage()
  await adminPage.goto(`${WEB}/login`)
  await adminPage.locator('#login-email').fill(stack!.adminEmail)
  await adminPage.locator('#login-password').fill(stack!.adminPassword)
  await adminPage.getByRole('button', { name: '登录' }).click()
  await adminPage.goto(`${WEB}/admin`)
  await adminPage.getByRole('link', { name: '审核' }).first().click()
  adminPage.once('dialog', (d) => void d.accept())
  await adminPage.getByRole('button', { name: '通过' }).click()
  await expect(adminPage).toHaveURL(`${WEB}/admin`, { timeout: 15_000 })

  // 4. 目录可见（API 源）且可玩（SW 解密链，依赖计划 A）
  await page.goto(`${WEB}/games`)
  await expect(page.getByRole('heading', { name: 'Stack Work' })).toBeVisible({ timeout: 15_000 })
  await page.goto(`${WEB}/games/${workId}`)
  const frame = page.frameLocator('iframe')
  await expect(frame.locator('body')).toHaveAttribute('data-ready', '1', { timeout: 60_000 })
  await expect(frame.locator('body')).toHaveAttribute('data-ok', 'stack')

  // 5. revoke 当前版本 → 全新上下文重进：安装失败（bundle-key 410），不再可玩
  await adminPage.goto(`${WEB}/admin`)
  await adminPage.getByRole('button', { name: '作品管理' }).click()
  const row = adminPage.locator(`[data-testid=work-row-${workId}]`)
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: '查看' }).click()
  await row.getByRole('button', { name: '吊销密钥' }).click()
  await expect(adminPage.getByText('网络连接失败')).toHaveCount(0)

  const freshCtx = await browser.newContext()

  // 🔴 正向证明吊销真生效：直接打 bundle-key 端点，后端对已吊销版本返 410
  // （bundlekey.go:40 `WriteError(c, http.StatusGone, "revoked", …)`；后端自己的
  // integration_test.go:149 就是同款断言）。
  // ⚠️ 不用 page.waitForResponse：取钥是 **SW** 发起的（keyfetch.ts），页面级拦截看不到。
  const keyResp = await freshCtx.request.get(
    `${stack!.apiBase}/api/games/${workId}/bundle-key?version=v1`
  )
  expect(keyResp.status()).toBe(410)

  const freshPage = await freshCtx.newPage()
  await freshPage.goto(`${WEB}/games/${workId}`)
  const freshFrame = freshPage.frameLocator('iframe')
  // 安装失败 → 无 hosted 回退 → 降级 external（离开本站）或错误态。
  // 保留这条负向断言作双保险：`data-ok` 是**夹具页面自己写的**（产品代码零命中），
  // external 目标（example.com）本就没这个 dataset，故单看它会在「iframe 压根没加载」
  // 时也恒真通过 —— 上面的 410 才是真正的因果证明。
  await expect(freshFrame.locator('body')).not.toHaveAttribute('data-ok', 'stack', { timeout: 30_000 })
})
