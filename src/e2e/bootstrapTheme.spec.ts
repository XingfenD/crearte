import { expect, test, type Page } from '@playwright/test'
import { API, fixtureGame, gameOrigin } from './helpers'

// P15-B-T4 新增腿（spec §5-T4.3）：钉住**父侧 hash 注入**——这是改动①里唯一无法被
// 源码级守卫覆盖的运行时行为（bootstrapTheme.test.ts 腿5 只钉"注入的是 effectiveTheme()
// 而非响应式 ref"，钉不到"hash 里真的出现了 theme 键且值正确"）。
//
// 为何必须在真浏览器里：主题要跨源传到游戏子域，而 localStorage 按源隔离，子域读不到主域
// 的显式选择（spec D-A）。故本腿同时验两件事：
//   1. 系统暗色 → iframe 的 src hash 带 theme=dark
//   2. 显式 stored=light 压过系统暗色 → hash 带 theme=light
//      （证明传的是主应用的 effectiveTheme()，不是浏览器偏好——正是 D-A 的语义）
//
// 读的是**父文档里 iframe 元素的 src 属性**：子文档内部的 location.replace('/') 不会改写
// 父侧属性，故无需等游戏装完（也就不会被 45s bootstrap 超时拖慢）。

const THEME_KEY = 'crearte.theme.v1'
const VIRTUAL_FIXTURE = 'abs-paths' // runtime=virtual + version + bundle → 走 __bootstrap 加载屏

async function iframeSrc(page: Page): Promise<string> {
  const src = await page.locator('iframe').first().getAttribute('src')
  expect(src, '游玩区应已渲染 iframe（GameHost 挂载完成）').not.toBeNull()
  return src ?? ''
}

function hashParam(src: string, key: string): string | null {
  return new URL(src).hash.replace(/^#/, '') === ''
    ? null
    : new URLSearchParams(new URL(src).hash.replace(/^#/, '')).get(key)
}

test('虚拟游戏加载屏：暗色用户的 iframe src hash 带 theme=dark（P15-B D-A/D-B）', async ({
  page
}) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  const { id } = fixtureGame(VIRTUAL_FIXTURE)

  await page.goto(`${API}/games/${id}`)

  const src = await iframeSrc(page)
  expect(src, `iframe 应指向 __bootstrap 加载屏，实得 ${src}`).toContain('/__bootstrap')
  expect(
    hashParam(src, 'theme'),
    `系统暗色时 hash 应带 theme=dark（子域读不到主域 localStorage，只能靠父侧传入），实得 src=${src}`
  ).toBe('dark')
  // 主应用文档自身也应是暗色（排除"两边都没主题"的假绿）
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

test('虚拟游戏加载屏：显式 stored=light 压过系统暗色 → hash 带 theme=light（D-A 语义）', async ({
  page
}) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.addInitScript(([key]) => localStorage.setItem(key, 'light'), [THEME_KEY] as const)
  const { id } = fixtureGame(VIRTUAL_FIXTURE)

  await page.goto(`${API}/games/${id}`)

  const src = await iframeSrc(page)
  expect(src, `iframe 应指向 __bootstrap 加载屏，实得 ${src}`).toContain('/__bootstrap')
  expect(
    hashParam(src, 'theme'),
    `传下去的应是主应用的 effectiveTheme()（stored 优先于系统偏好），实得 src=${src}`
  ).toBe('light')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
})

// —— 子侧：加载屏自己的 pre-paint 脚本是否真的把 hash 落成了暗色 ——
// 上面两条只钉“父侧把 theme 传进了 hash”；bootstrapTheme.test.ts 腿1-8 只读源码文本、
// 不执行脚本。本组腿提供**运行时**证据：加载屏确实渲染成暗色（= 白闪真的消除）。
// 直访子域的 /__bootstrap（serve-runtime 对任意游戏子域服务该路径），避开“游戏装完后
// location.replace('/') 离开加载屏”的竞态；且加载屏的 main.ts 因缺启动参数而报错不影响本组断言
// （pre-paint 脚本在 module 之前就已落地 data-theme）。
const DARK_BG = 'rgb(23, 20, 15)' // #17140f = 暗色 paper
const LIGHT_BG = 'rgb(247, 242, 231)' // #f7f2e7 = 亮色 paper

let probeSeq = 0

/**
 * 直访子域加载屏并回读 data-theme + body 计算底色。
 *
 * ⚠️ `probe` 参数是**必需**的，不是装饰：实测（playwright DBG1）向同一页面 goto 一个
 * **仅 hash 不同**的 URL 属 same-document navigation——文档不重载，pre-paint 脚本不再执行，
 * 于是第二格读到的是第一格的残留值（实测：先暗后亮两格，亮格仍返回 dark）。
 * 带不同的 **query** 才会触发真导航，改完 emulateMedia 后脚本才会用新偏好重跑。
 */
async function bootstrapThemeOf(page: Page, hash: string): Promise<{ attr: string | null; bg: string }> {
  probeSeq += 1
  await page.goto(`${gameOrigin(VIRTUAL_FIXTURE)}/__bootstrap?probe=${probeSeq}#${hash}`)
  const attr = await page.locator('html').getAttribute('data-theme')
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  return { attr, bg }
}

test('加载屏子侧：hash theme=dark → 首屏即暗色（data-theme + body 底色双证据）', async ({
  page
}) => {
  // 系统亮色，但 hash 显式传 dark → 必须暗色（证明 hash 优先级高于系统偏好，D-A 第一级）
  await page.emulateMedia({ colorScheme: 'light' })

  const { attr, bg } = await bootstrapThemeOf(page, 'theme=dark&v=1')
  expect(attr, 'hash theme=dark 应落地 data-theme=dark').toBe('dark')
  expect(bg, `body 应渲染暗色 paper（而不只是属性对），实得 ${bg}`).toBe(DARK_BG)
  // theme-color meta 也应同步为暗色 paper（pre-paint 脚本的第二职责）
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#17140f')
})

test('加载屏子侧：无 theme 键时回落系统偏好（亮/暗两格）', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  const dark = await bootstrapThemeOf(page, 'v=1')
  expect(dark.attr, '无 hash theme + 系统暗色 → 应回落 dark').toBe('dark')
  expect(dark.bg, `body 应为暗色 paper，实得 ${dark.bg}`).toBe(DARK_BG)

  await page.emulateMedia({ colorScheme: 'light' })
  const light = await bootstrapThemeOf(page, 'v=1')
  expect(light.attr, '无 hash theme + 系统亮色 → 应回落 light').toBe('light')
  expect(light.bg, `body 应为亮色 paper，实得 ${light.bg}`).toBe(LIGHT_BG)
})

// mutation (c) 的运行时等价物（对应主应用 dark.spec.ts 的“垃圾 stored”腿）：
// 源码级腿3 只能钉“文本里有白名单”，本腿钉“垃圾值真的被忽略”。
test('加载屏子侧：垃圾 hash theme=neon 被忽略，回落系统偏好（白名单行为）', async ({
  page
}) => {
  await page.emulateMedia({ colorScheme: 'dark' })

  const { attr, bg } = await bootstrapThemeOf(page, 'theme=neon&v=1')
  expect(attr, `垃圾值不得产生无效 data-theme，应回落系统偏好 dark，实得 ${attr}`).toBe('dark')
  expect(attr, 'data-theme 不得是 neon').not.toBe('neon')
  expect(bg, `body 应为暗色 paper，实得 ${bg}`).toBe(DARK_BG)
})

// ⚠️ 刻意**不做**「进真游戏页后读 iframe 内加载屏底色」的端到端腿：加载屏按设计是**瞬态**的，
// 对它做第二次 await 必然与导航赛跑 = flaky 测试，不是实现缺陷。实测过四种拦截手法都无法
// 确定性冻结它（证据：.superpowers/sdd-p15b/impl-evidence/t4-e2e-end-to-end-evidence.log）：
//   · 只拦 bundle    → SW 装完 location.replace('/') 离开（报 Execution context was destroyed）
//   · abort sw.js    → 走 fail() → signalDegrade → 父侧降级到下一目标（读到空白文档）
//   · 挂起 sw.js     → 首次原子快照**正确**（hash 含 theme=dark、data-theme=dark、
//                     body 底色 rgb(23,20,15)、h1=「正在准备游戏运行环境…」），但 +3s 后仍被顶掉
//   · abort 子域根导航 → 文档变空白（styleTags=0）
// 上面那次正确的原子快照已作为端到端证据落盘存档（含逐项判读）。
//
// 本文件保留的 5 条腿是确定性的，且**组合覆盖同一性质**（两半各自对且接口对得上）：
//   腿1/2 读**父文档**的 iframe src 属性——子文档内部导航不会改写父侧属性，故无竞态；
//   腿3/4/5 直访子域加载屏（不经父页启动安装流程），验子侧 pre-paint 的真实渲染值。
