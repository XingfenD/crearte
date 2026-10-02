import { expect, test, type Page, type Route } from '@playwright/test'
import { API, seedSession } from './helpers'

// P12-T4 机器守卫（spec D-H / §5 T4）：窄屏横向溢出。
// 断言口径统一为 document.documentElement.scrollWidth <= clientWidth + 1。
// 本文件自动进 CI 主腿（playwright.config.ts testIgnore 只排除 noauth.spec.ts）。
//
// 矩阵按 spec §5 T4 收敛（不跑满 3×3×10）：
//   {320,375} × {60字ASCII, 短名} × {全部 10 路由}  —— 复现缺口 A(+380/+325)、C(+3)、D(+76/+21/+38)
//   {375} × {60字CJK} × {/, /account, /admin/users} —— CJK 可断行，两种相位都应过（钉住 truncate 不破 CJK）
// 另有三条钉桩：下拉菜单不逃逸（缺口 E）、caret ▾ 可见（防「整体 truncate」吞字形）、
// 表格修溢出后仍可横向滚动（内容可达，非靠裁剪藏内容）。

const SHORT = '安'
const ASCII60 = 'x'.repeat(60) // 60 字不可断行 ASCII（word-break:normal 下无断点）→ 缺口 A 触发条件
const CJK60 = '汉'.repeat(60) // 60 字 CJK（字符间可断行）→ 不触发缺口 A

type NameKey = 'short' | 'ascii60' | 'cjk60'
const NAME_OF: Record<NameKey, string> = { short: SHORT, ascii60: ASCII60, cjk60: CJK60 }

// 全部 10 路由（后四个需 admin seed + mock）。统一以 admin 身份 seed：admin 对公开路由/
// /account（requiresAuth）/ /admin*（requiresAdmin）均可达，且页头长名（缺口 A）在每种路由都常驻。
const ROUTES = [
  '/', '/games', '/docs', '/creator', '/login', '/register',
  '/account', '/admin/users', '/admin', '/admin/audit'
] as const
const ADMIN_ROUTES = new Set<string>(['/admin', '/admin/users', '/admin/audit'])

// 各路由渲染就绪信号：数据页须等异步内容落地再量，否则会量到骨架屏（假绿）。
const READY: Record<string, string> = {
  '/games': '#catalog-sort', // ResultMeta 排序 select（缺口 C 的驱动元素）
  '/account': 'dl',
  '/docs': 'article',
  '/admin/users': 'table',
  '/admin': 'table',
  '/admin/audit': 'table'
}

const json = (route: Route, body: unknown): Promise<void> =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })

// 最小 admin mock：每个表格端点返回**至少一条短数据**——表格由 v-else 门控，
// 空数据下 <thead> 不渲染、守卫空跑（假绿）。短字段确保复现的是缺口 D（表格 min-content）
// 而非长名污染。沿用 a11y.spec.ts:26 / admin-flow.spec.ts:30-56 的端点范式。
async function installAdminMocks(page: Page): Promise<void> {
  // 短数据（短邮箱/短用户名）：表格溢出由 auto 布局的 min-content 宽驱动（缺口 D），
  // 与 display_name 长度无关——spec §1 的 +76/+21/+38 即短数据实测。mock 字段越短，
  // 表格 min-content 越窄，溢出 px 越小；此处取最短可渲染数据以贴近 spec 基线。
  await page.route(`${API}/api/admin/users**`, (route) => {
    if (route.request().method() !== 'GET') return void json(route, { ok: true })
    return void json(route, {
      users: [{ id: 'u1', email: 'a@b.co', username: 'ab', display_name: 'AB', role: 'user', created_at: '2026-09-30T00:00:00Z' }],
      total: 1
    })
  })
  await page.route(`${API}/api/admin/audit**`, (route) =>
    void json(route, {
      entries: [{ id: 'au1', actor_id: 'u1', actor_email: 'a@b.co', method: 'GET', route: '/api/admin/users', path: '/api/admin/users', status: 200, created_at: '2026-09-30T00:00:00Z' }],
      total: 1
    })
  )
  await page.route(`${API}/api/admin/submissions**`, (route) => {
    const sub = {
      id: 'sub-1', kind: 'new_work', status: 'pending', work_id: 'mock/g',
      payload: { id: 'mock/g', name: 'G', url: 'https://e.com/g', author: { name: 'a' }, description: 'd', durationMinutes: { min: 1, max: 2 }, type: 'puzzle', tags: [], runtime: 'external' },
      created_at: '2026-09-27T00:00:00Z', updated_at: '2026-09-27T00:00:00Z'
    }
    return void json(route, { submissions: [sub], total: 1 })
  })
  await page.route(`${API}/api/admin/works/**`, (route) => void json(route, { ok: true }))
  await page.route(`${API}/api/games`, (route) =>
    void json(route, { schemaVersion: 1, generatedAt: 'x', games: [] })
  )
}

function measure(page: Page): Promise<{ scrollWidth: number; clientWidth: number; overflow: number }> {
  return page.evaluate(() => {
    const de = document.documentElement
    return { scrollWidth: de.scrollWidth, clientWidth: de.clientWidth, overflow: de.scrollWidth - de.clientWidth }
  })
}

async function gotoReady(page: Page, route: string): Promise<void> {
  await page.goto(`${API}${route}`)
  const sel = READY[route]
  if (sel) await page.waitForSelector(sel, { state: 'visible' })
  // 两帧 rAF：等布局/字体落地，避免量到重排前的瞬时宽度
  await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))))
}

async function collectOverflow(page: Page, routes: readonly string[], vp: number, label: string): Promise<string[]> {
  const bad: string[] = []
  for (const route of routes) {
    await gotoReady(page, route)
    const m = await measure(page)
    if (m.overflow > 1) {
      bad.push(`${route} @${vp}px ${label}: scrollWidth=${m.scrollWidth} clientWidth=${m.clientWidth} → +${m.overflow}px`)
    }
  }
  return bad
}

// —— 主矩阵：{320,375} × {ascii60, short} × 全 10 路由 ——
for (const vp of [320, 375]) {
  for (const nameKey of ['ascii60', 'short'] as NameKey[]) {
    test(`全站零横向溢出：@${vp}px name=${nameKey}`, async ({ page }) => {
      await page.setViewportSize({ width: vp, height: 800 })
      await installAdminMocks(page)
      await seedSession(page, 'admin', NAME_OF[nameKey])
      const bad = await collectOverflow(page, ROUTES, vp, nameKey)
      expect(bad, `横向溢出路由（口径 scrollWidth-clientWidth>1）：\n${bad.join('\n')}`).toEqual([])
    })
  }
}

// —— CJK 腿：60 字 CJK 可断行，RED/GREEN 都应零溢出（钉住 truncate 修复不破 CJK）——
test('全站零横向溢出：@375px name=cjk60（CJK 可断行）', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await installAdminMocks(page)
  await seedSession(page, 'admin', CJK60)
  const bad = await collectOverflow(page, ['/', '/account', '/admin/users'], 375, 'cjk60')
  expect(bad, `横向溢出路由：\n${bad.join('\n')}`).toEqual([])
})

// —— 768px 钉桩（spec §5 T3 显式覆盖要求）：/account 在 60 字名下 768px 零溢出 ——
// spike 实测 baseline @768 /account docW=808 → +40px（spec §1 归因缺口 B 的 dd 逃逸）。
// 但实现者 mutation 实测纠正：单独回退 dd 修复（T3）@768px 仍 GREEN——max-w-xl(576px)
// 减 px-4 后 dd(542px) 在 flex-wrap 下能折到自成一行的 544px 内，768px 的 +40px 实为
// 缺口 A（页头 summary 484px）驱动，与全站每个路由同源，由 T1 修复。dd 修复的牙在
// @320px：mutation 回退 T3 后 /account @320px ascii60 → +272px（scrollWidth=592，
// 恰为 spec 记录的 ddRight=592）。本腿钉住 768px 这个「桌面窄窗口」的页头回归。
test('/account @768px 长名零溢出（spec §5 T3：+40px 症状显式覆盖）', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 800 })
  await seedSession(page, 'user', ASCII60)
  await gotoReady(page, '/account')
  const m = await measure(page)
  expect(m.overflow, `@768px /account scrollWidth=${m.scrollWidth} clientWidth=${m.clientWidth} → +${m.overflow}px`).toBeLessThanOrEqual(1)
})

// —— 缺口 E 钉桩：长名下用户下拉菜单不逃逸视口右缘 ——
for (const vp of [320, 375]) {
  test(`长名下拉菜单不逃逸视口：@${vp}px（缺口 E）`, async ({ page }) => {
    await page.setViewportSize({ width: vp, height: 800 })
    await seedSession(page, 'admin', ASCII60)
    await page.goto(`${API}/`)
    await page.waitForSelector('header details summary')
    // 程序性展开（RED 相位 summary 宽 484px、中心在屏外，click 会超时；直接置 open 更稳）
    await page.locator('header details').evaluate((el) => { (el as HTMLDetailsElement).open = true })
    const menu = page.locator('header details > div')
    await expect(menu).toBeVisible()
    const box = await menu.boundingBox()
    expect(box, '菜单应有边界盒').not.toBeNull()
    const right = box!.x + box!.width
    expect(right, `菜单 right=${right.toFixed(0)} 应 <= innerWidth=${vp}`).toBeLessThanOrEqual(vp)
  })
}

// —— caret 钉桩：60 字名下 <summary> 的 ▾ 仍可见且在视口内 ——
// 防将来有人用「整体 truncate」把 caret 一起吞掉（spike 15 实测那条路 caret=HIDDEN）。
test('长名 summary 的 caret ▾ 仍可见（防整体 truncate 吞字形）', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await seedSession(page, 'user', ASCII60)
  await page.goto(`${API}/`)
  await page.waitForSelector('header details summary')
  const caret = page.locator('header details summary span[aria-hidden="true"]')
  await expect(caret).toHaveText('▾')
  await expect(caret).toBeVisible()
  const box = await caret.boundingBox()
  expect(box, 'caret 应有边界盒').not.toBeNull()
  expect(box!.x + box!.width, `caret right=${(box!.x + box!.width).toFixed(0)} 应 <= 320`).toBeLessThanOrEqual(320)
})

// —— 表格可达性钉桩（spec §5 T2.4）：修溢出靠包裹层滚动，不靠裁剪藏内容 ——
for (const route of ['/admin/users', '/admin', '/admin/audit']) {
  test(`表格仍可横向滚动、内容可达：${route} @320px`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 })
    await installAdminMocks(page)
    await seedSession(page, 'admin', SHORT)
    await gotoReady(page, route)
    const r = await page.evaluate(() => {
      const table = document.querySelector('table')
      if (!table) return { hasTable: false, wrapperClass: '', wrapperScrollWidth: 0, wrapperClientWidth: 0, tableWidth: 0 }
      const wrapper = table.parentElement
      return {
        hasTable: true,
        wrapperClass: wrapper?.className ?? '',
        wrapperScrollWidth: wrapper?.scrollWidth ?? 0,
        wrapperClientWidth: wrapper?.clientWidth ?? 0,
        tableWidth: table.getBoundingClientRect().width
      }
    })
    expect(r.hasTable, '表格应存在').toBe(true)
    expect(r.wrapperClass, `表格父元素应为 overflow-x-auto 滚动容器，实际 class="${r.wrapperClass}"`).toContain('overflow-x-auto')
    // 表格 min-content 宽于包裹层时，包裹层必须可滚（scrollWidth>clientWidth）→ 内容可达而非被裁掉
    if (r.tableWidth > r.wrapperClientWidth) {
      expect(r.wrapperScrollWidth, `包裹层应可横向滚动 scrollWidth=${r.wrapperScrollWidth} clientWidth=${r.wrapperClientWidth}`).toBeGreaterThan(r.wrapperClientWidth)
    }
  })
}
