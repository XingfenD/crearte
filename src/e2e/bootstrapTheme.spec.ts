import { expect, test, type BrowserContext, type Page } from '@playwright/test'
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

// 🔴 F-3（critical 级缺口在**子侧直访**路径上的鉴别格）：[系统暗色] × [hash=light] → 期望 light。
// （端到端亮色格是第二个鉴别格 → 不写「唯一」；终审 E2 实测该缺陷红 2 条腿，纪律 #4。）
// 审查实测：H1（白名单提取成变量 + prefers 优先）与 H3（拆中间变量的嵌套三元）两种语义等价的
// 缺陷形态都逃过源码腿2，**且 H1 同时逃过全部 5 条既有 e2e 腿**——覆盖矩阵缺的正是这一格
// （正确实现给 light，H1/H3 给 dark）。缺陷是真的：系统暗色 + hash 显式选亮色的用户会看到暗色
// 加载屏，违反 D-A「hash 优先」。对照主应用 dark.spec.ts:169 有反方向腿，bootstrap 侧此前缺。
test('加载屏子侧：系统暗色 + hash theme=light → 亮色（hash 优先的反方向格，H1/H3 鉴别）', async ({
  page
}) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  const { attr, bg } = await bootstrapThemeOf(page, 'theme=light&v=1')
  expect(attr, 'hash 显式选亮色须压过系统暗色偏好（D-A 第一级：hash 优先）').toBe('light')
  expect(bg, `body 应为亮色 paper，实得 ${bg}`).toBe(LIGHT_BG)
})

// —— F-2：端到端腿（偏离 5 被裁定**驳回**后加回）——
//
// 前任「刻意不做端到端腿」的归因错了。它四种手法用的都是 **page.route**，而审查者 PROBE-6A
// 实测三个 route 命中数全为 0——`page.route` 根本拦不到 SW 注册请求、SW 发起的请求、以及被
// SW `respondWith` 合成的导航（子文档已跑到 `/`）。故「挂起 sw.js → +3s 被顶掉」的观察真、归因错：
// 挂起从未生效，真 SW 照常安装 → `runtime:ready` → `location.replace('/')`，被误归因为「加载屏本质
// 瞬态、无法冻结」。换 **context.route**（浏览器上下文级）后 PROBE-7A `sw.js hits=1`、子文档稳定停在
// `/__bootstrap` 且 `attr=dark`；PROBE-7B T+0/T+10s/T+25s 三次全 `attr=dark` + `bg=rgb(23,20,15)`，
// T+25s 因 Playwright 自身 `timeout:45_000` 中断而**不是被顶掉** → 加载屏可确定性冻结。
//
// 手法：`context.route('**/sw.js', fulfill 惰性脚本)` 冻住安装流程，使加载屏停在 /__bootstrap。
// 三条腿：①暗色端到端（snap.url === 父侧 iframe src，因果链闭合）②亮色端到端（stored=light 压过
// 系统暗色）③**行为腿**（游戏页切主题 → iframe src 不变，= D-B critical 性质的唯一行为级防线）。

/** 用 context.route 冻住子域 sw.js（fulfill 惰性脚本，SW 装上但永不发 runtime:ready → 加载屏不离开）。 */
async function freezeBootstrapSw(ctx: BrowserContext): Promise<void> {
  await ctx.route('**/sw.js', (route) =>
    route.fulfill({ status: 200, contentType: 'text/javascript', body: '// inert sw: freeze bootstrap loader\n' })
  )
}

/**
 * 等到子域加载屏 frame 真的可快照，再返回它。
 *
 * ⚠️ 不能假定「读到 iframe src 属性时子 frame 已就绪」：属性由 Vue 先落，子文档随后才导航，
 * frame 对象出现前 evaluate 会抛。且子域与主域**跨源**（`<sub>.localhost` vs `localhost`），
 * 主 frame 的 waitForFunction 读不到它 → 只能用 Playwright 的 frame 句柄 + 轮询。
 * 轮询到 `data-theme` 非 null 才返回：该属性由 pre-paint 内联脚本在解析器阻塞期落地，
 * 读到非 null 即证明脚本已执行（不会快照到解析中途的空文档）。
 */
async function waitForBootstrapFrame(page: Page) {
  const find = () => page.frames().find((f) => f.url().includes('/__bootstrap'))
  await expect
    .poll(() => find() !== undefined, {
      message: `父页应出现停在 /__bootstrap 的子 frame，实得 ${JSON.stringify(page.frames().map((f) => f.url()))}`,
      timeout: 20_000
    })
    .toBe(true)
  const child = find()!
  await child.waitForLoadState('domcontentloaded')
  await expect
    .poll(() => child.evaluate(() => document.documentElement.getAttribute('data-theme')), {
      message: '加载屏的 pre-paint 脚本应已落地 data-theme',
      timeout: 20_000
    })
    .not.toBeNull()
  return child
}

/** 子域加载屏 iframe 的原子快照：url + data-theme + body 底色 + h1 + theme-color meta。 */
async function bootstrapFrameSnap(page: Page): Promise<{
  url: string
  attr: string | null
  bg: string
  h1: string
  meta: string | null
}> {
  const child = await waitForBootstrapFrame(page)
  return child.evaluate(() => ({
    url: location.href,
    attr: document.documentElement.getAttribute('data-theme'),
    bg: getComputedStyle(document.body).backgroundColor,
    h1: document.querySelector('h1')?.textContent ?? '',
    meta: document.querySelector('meta[name="theme-color"]')?.getAttribute('content') ?? null
  }))
}

test('端到端：暗色用户进真游戏页 → iframe 内加载屏渲染为暗色（snap.url === 父侧 src，因果链闭合）', async ({
  browser
}) => {
  const ctx = await browser.newContext({ colorScheme: 'dark' })
  await freezeBootstrapSw(ctx)
  const page = await ctx.newPage()
  const { id } = fixtureGame(VIRTUAL_FIXTURE)

  await page.goto(`${API}/games/${id}`)
  const src = await iframeSrc(page)
  expect(src, `iframe 应指向 __bootstrap 加载屏，实得 ${src}`).toContain('/__bootstrap')

  const snap = await bootstrapFrameSnap(page)
  // 🔴 因果链闭合：子文档读到的 url 就是父侧 adapters.ts 算出的那个 src（不是测试手搓的 hash）。
  // ⚠️ 鉴别力精确定位（终审 §9.3，RE-PIN 2026-10-04）：本断言钉的是「**子文档停在父侧算出的那个 url**」
  // —— hash 被子侧改写（P1 实测红）、子文档被导航走、冻结失效（E3 实测红 28.5s）三类。
  // 它**抓不到**「父侧算出的 hash 键名/编码与子侧解析是否一致」：E1 把键名 theme→t、E4 传大写
  // theme=DARK 时父子两侧**同步**变化，等式恒成立 → 本腿仍绿。那一环由**腿1/腿2 的
  // `hashParam(src,'theme')`（父侧断言）与端到端亮色格**覆盖（前任 0fd2c5a 已覆盖，非本腿新增）。
  expect(snap.url, `子文档 url 应逐字等于父侧 iframe src（因果链闭合），父侧=${src} 子侧=${snap.url}`).toBe(src)
  expect(snap.attr, '暗色用户加载屏应落地 data-theme=dark').toBe('dark')
  expect(snap.bg, `body 应为暗色 paper，实得 ${snap.bg}`).toBe(DARK_BG)
  expect(snap.h1, '应仍停在加载屏（h1=正在准备…）').toContain('正在准备游戏运行环境')
  expect(snap.meta, 'theme-color meta 应同步为暗色 paper').toBe('#17140f')
  // +8s 后仍在加载屏（证明 context.route 冻住了 SW，不是瞬态快照）
  await page.waitForTimeout(8_000)
  const later = await bootstrapFrameSnap(page)
  expect(new URL(later.url).pathname, '+8s 后 path 应仍是 /__bootstrap（加载屏未被顶掉）').toBe('/__bootstrap')
  await ctx.close()
})

test('端到端（亮色格）：stored=light 压过系统暗色 → iframe 内加载屏渲染为亮色', async ({
  browser
}) => {
  const ctx = await browser.newContext({ colorScheme: 'dark' })
  await freezeBootstrapSw(ctx)
  const page = await ctx.newPage()
  await page.addInitScript(([key]) => localStorage.setItem(key, 'light'), [THEME_KEY] as const)
  const { id } = fixtureGame(VIRTUAL_FIXTURE)

  await page.goto(`${API}/games/${id}`)
  const src = await iframeSrc(page)
  const snap = await bootstrapFrameSnap(page)
  expect(snap.url, '子文档 url 应逐字等于父侧 iframe src').toBe(src)
  expect(
    hashParam(src, 'theme'),
    `stored=light 应压过系统暗色 → hash 带 theme=light，实得 src=${src}`
  ).toBe('light')
  expect(snap.attr, '显式 stored=light 的加载屏应渲染亮色').toBe('light')
  expect(snap.bg, `body 应为亮色 paper，实得 ${snap.bg}`).toBe(LIGHT_BG)
  await ctx.close()
})

// 🔴 F-1 的**行为级解药**（adjudication §三-3）：D-B 那个 critical 性质（targets computed 不得依赖
// 主题 ref）的唯一行为级防线。源码腿5 改回全文后仍有残留局限（抓不住模块级作用域读 ref 再传值），
// 本腿在运行时钉死性质本身：游戏页切主题 → iframe 的 src 属性**逐字不变** = 不触发重载。
// ⚠️ 措辞收窄（终审 §8.1(c)）：inert sw.js 是「纯注释的合法 JS」→ 注册成功、install 完成、
// 但无 fetch handler → 永不发 runtime:ready → 加载屏不离开，**游戏严格说并未启动**。
// 钉的性质仍然成立且与游戏是否在跑无关：`src` 变 → Vue 的 `:src` 绑定变 → iframe **必然**重载（浏览器语义）。
// 手法同上（context.route 冻住 SW，加载屏停在 /__bootstrap，src 稳定可读）。
test('行为腿（D-B）：游戏页切主题 → iframe src 不变（= 不触发重载）', async ({
  browser
}) => {
  const ctx = await browser.newContext({ colorScheme: 'light' })
  await freezeBootstrapSw(ctx)
  const page = await ctx.newPage()
  const { id } = fixtureGame(VIRTUAL_FIXTURE)

  await page.goto(`${API}/games/${id}`)
  const before = await iframeSrc(page)
  expect(before, '前置：iframe 应已渲染并指向加载屏').toContain('/__bootstrap')

  // 在主应用文档里点主题开关（游戏页 header 仍在）→ useTheme 单例翻转 → 若 targets 依赖主题 ref，
  // computed 会重算 → iframe src 变 → 游戏重载。正确实现（effectiveTheme() 快照）下 src 不变。
  await page.getByTestId('theme-toggle').click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark') // 确认切换真的发生了
  // ⚠️ 窗口是**启发式**：延迟传导形态的检出下界 = 窗口长度。终审 N9/N10 实测 3s 延迟传导下
  // 1s 窗口漏（源码腿也漏 → 双防线同时失守），6s 即红。不声称覆盖所有延迟形态（纪律 #4）。
  await page.waitForTimeout(6_000) // 给响应式重算留窗口（若存在）

  const after = await iframeSrc(page)
  expect(
    after,
    `切主题后 iframe src 必须逐字不变（D-B：targets 不得依赖主题 ref，否则运行中的游戏被重载、存档丢失），切前=${before} 切后=${after}`
  ).toBe(before)
  // 子文档也确实没导航走（仍在加载屏，url 未变）
  const snap = await bootstrapFrameSnap(page)
  expect(snap.url, `子文档 url 也不应变（未重载），实得 ${snap.url}`).toBe(before)
  await ctx.close()
})
