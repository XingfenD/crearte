import { expect, test, type Page } from '@playwright/test'
import { API, seedSession } from './helpers'

// P13-T5 暗色模式 e2e（spec §5 T5 / D-B / D-D / D-E / D-I / D-J / D-K）。
// 覆盖单测测不到的东西：真实构建产物上的令牌翻转、Tailwind 构建期烘焙的 --tw-shadow
// 是否随 var() 传导（spike 6 的复验）、::backdrop 的真实解析值、pre-paint 无 FOUC。
// 本文件自动进 CI 主腿（playwright.config.ts testIgnore 只排除 noauth.spec.ts）。

const ASCII60 = 'x'.repeat(60) // 与 responsive.spec.ts 同源的最坏格长名
const THEME_KEY = 'crearte.theme.v1'
const DARK_PAPER = 'rgb(23, 20, 15)' // #17140f
const DARK_INK = 'rgb(247, 242, 231)' // #f7f2e7

const toggle = (page: Page): ReturnType<Page['locator']> => page.getByTestId('theme-toggle')

/** 记录 data-theme 的变更序列（验 pre-paint：全程不得出现 'light'）。 */
async function installThemeRecorder(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const seq: Array<string | null> = []
    const start = (): void => {
      const el = document.documentElement
      if (!el) {
        requestAnimationFrame(start)
        return
      }
      seq.push(el.getAttribute('data-theme'))
      new MutationObserver(() => seq.push(el.getAttribute('data-theme'))).observe(el, {
        attributes: true,
        attributeFilter: ['data-theme']
      })
    }
    start()
    ;(window as unknown as { __themeSeq: Array<string | null> }).__themeSeq = seq
  })
}

function themeSeq(page: Page): Promise<Array<string | null>> {
  return page.evaluate(() => (window as unknown as { __themeSeq: Array<string | null> }).__themeSeq)
}

/**
 * 从 CSS 颜色串解析 alpha，兼容三种序列化形态：
 * - `rgba(13, 11, 8, 0.8)` —— 逗号形态，第四个数即 alpha
 * - `rgb(13 11 8 / 0.8)` / `color(srgb … / 0.8)` —— CSS Color 4 斜杠形态
 * - `rgb(13 11 8 / 80%)` —— **百分比 alpha**：裸取数字会得到 80 而非 0.8 → 假红
 *   （控制者实测该形态确实解析错），故百分比必须除以 100。
 * 无 alpha = 不透明（1），对本守卫而言同样偏离 D-E 钉的「scrim 80% 遮罩」。
 *
 * ⚠️ 本文件注释**不得写出 Tailwind 类名字面量**（spec §8-5b）：Tailwind v4 扫描全部源文件
 * 含 `.spec.ts`，会把注释里的候选类名当真、生成死 utility 烧进产物。控制者实测：本文件
 * 两处注释写了该类名 → 产物多出一条无 backdrop 前缀的死规则、`var(--color-*)` 从 75 涨到
 * 76、哈希 C7966Gm- → CV7wAyTH。故此处只用散文描述「scrim 80% 遮罩」。
 */
function parseAlpha(css: string, nums: number[]): number {
  const tail = css.trim()
  // 斜杠形态（CSS Color 4）：alpha = 最后一个 `/` 之后、`)` 之前的值，可为指数记号或百分比。
  // 终审 N3：旧版 `[\d.]+` 不含 `e`，`/ 8e-1)` 只抓到 8；旧版 percent 正则只认斜杠形态，
  // 逗号形态 `rgba(…, 80%)` 落到 nums[3]=80。三个形态均实测过。
  const slash = /\/\s*([\d.eE+-]+)\s*(%)?\s*\)$/.exec(tail)
  if (slash) return slash[2] ? Number(slash[1]) / 100 : Number(slash[1])
  // 逗号形态：仅当有四个及以上数字时第四个才是 alpha（否则 `rgb(13, 11, 8)` 的 8 会被误当 alpha）。
  if (nums.length >= 4) {
    const commaPercent = /,\s*([\d.eE+-]+)\s*%\s*\)$/.exec(tail)
    if (commaPercent) return Number(commaPercent[1]) / 100
    return nums[3]
  }
  return 1 // 无 alpha = 不透明；对本守卫而言同样偏离 D-E 钉的 80% 遮罩
}

test('默认跟随系统：prefers-color-scheme=dark 且无 stored 时首屏即暗色（D-J / D-K 无 FOUC）', async ({
  page
}) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await installThemeRecorder(page)

  await page.goto(`${API}/`, { waitUntil: 'load' })

  // 首屏就是暗色，且全程没有闪回亮色（pre-paint 内联脚本在 CSS/Vue 之前落地）
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  const seq = await themeSeq(page)
  expect(seq, `data-theme 变更序列不得出现 light（FOUC）：${JSON.stringify(seq)}`).not.toContain(
    'light'
  )
  expect(seq[seq.length - 1], '最终态应为 dark').toBe('dark')

  // Vue 确实挂载了（排除「页面根本没跑起来所以看着像暗色」的假绿）
  expect(
    await page.evaluate(() => document.querySelector('#app')?.children.length ?? 0),
    'Vue 应已挂载'
  ).toBeGreaterThan(0)
  // 计算值实证：body 底色/文字色已翻转（不只查属性）
  const body = await page.evaluate(() => {
    const cs = getComputedStyle(document.body)
    return { bg: cs.backgroundColor, color: cs.color }
  })
  expect(body.bg).toBe(DARK_PAPER)
  expect(body.color).toBe(DARK_INK)
})

test('pre-paint 归因：Vue 包被拦截时 data-theme 仍为 dark（证明是内联脚本而非挂载后设置）', async ({
  page
}) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  // 拦掉全部构建产物 JS：Vue 永不挂载。若 data-theme 仍是 dark，则只能来自 <head> 内联脚本。
  await page.route('**/assets/*.js', (route) => route.abort())

  await page.goto(`${API}/`, { waitUntil: 'domcontentloaded' })

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  expect(
    await page.evaluate(() => document.querySelector('#app')?.children.length ?? 0),
    'Vue 不应挂载（JS 已被拦截）'
  ).toBe(0)
  // theme-color meta 同步为暗色 paper（内联脚本的第二职责）
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#17140f')
})

test('开关切换：data-theme / theme-color meta / localStorage 三者同步翻转（D-I / D-J）', async ({
  page
}) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto(`${API}/`)

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(toggle(page)).toHaveAccessibleName('切换为暗色主题（当前：亮色）')

  await toggle(page).click()

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#17140f')
  expect(await page.evaluate((k) => localStorage.getItem(k), THEME_KEY)).toBe('dark')
  // 图标字形翻转（☾ → ☀），且字形对 AT 隐藏（可访问名来自 aria-label）
  await expect(toggle(page).locator('span')).toHaveText('☀')
  await expect(toggle(page).locator('span')).toHaveAttribute('aria-hidden', 'true')
  await expect(toggle(page)).toHaveAccessibleName('切换为亮色主题（当前：暗色）')

  await toggle(page).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#f7f2e7')
  expect(await page.evaluate((k) => localStorage.getItem(k), THEME_KEY)).toBe('light')
})

test('持久化：stored=dark 时 reload 后主题保持且不闪回（显式选择压过系统偏好）', async ({
  page
}) => {
  // 系统偏好亮色，但用户已显式选暗色 → stored 优先
  await page.emulateMedia({ colorScheme: 'light' })
  await page.addInitScript(([key]) => localStorage.setItem(key, 'dark'), [THEME_KEY] as const)
  await installThemeRecorder(page)

  await page.goto(`${API}/`)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

  await page.reload({ waitUntil: 'load' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  const seq = await themeSeq(page)
  expect(seq, `reload 后 data-theme 序列不得出现 light：${JSON.stringify(seq)}`).not.toContain(
    'light'
  )
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#17140f')
})

// 审查 finding #2 的解药：themeBootstrap.test.ts 用「三个子串文本先后位置」钉判定优先级，
// 对**语义重排**无鉴别力——把 index.html 的三元改成 system-before-stored 后子串位置不变、
// 守卫仍绿，但在 stored=light & system=dark 一格会造成内联脚本(dark) 与 useTheme(light)
// 真实分歧 = 首屏暗、挂载后闪亮的 FOUC（审查者 M3 实证，控制者 node 模拟复算确认）。
// 上面那条持久化腿是 stored=dark + system=light（方向相反），抓不到该重排。
// 这条腿钉**反方向的真实行为**：stored=light 必须压过系统暗色偏好，且首屏即是。
test('stored 压过 system（反方向）：stored=light + 系统暗色时首屏即亮色（D-J / finding #2）', async ({
  page
}) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.addInitScript(([key]) => localStorage.setItem(key, 'light'), [THEME_KEY] as const)
  await installThemeRecorder(page)

  await page.goto(`${API}/`)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

  // 首屏就是 light：序列里不得出现 dark（若内联脚本让 system 优先，这里会先记到 dark）
  const seq = await themeSeq(page)
  expect(seq, `stored=light 时首屏序列不得出现 dark：${JSON.stringify(seq)}`).not.toContain(
    'dark'
  )
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#f7f2e7')
  // 终审 N9：与 leg1 一致，另钉 body 计算值——属性/序列/meta 之外的第四重证据，
  // 证明首屏真渲染成了亮色而不只是 data-theme 属性对。
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  expect(bg, `stored=light 时 body 背景应为亮色 paper：实得 ${bg}`).toBe('rgb(247, 242, 231)')
})

// 终审 N2 / F-b：themeBootstrap 只钉三个子串的文本位置，对「index.html 放宽 stored 校验」
// 这类语义破坏无鉴别力——F-b 实测把校验放宽成 `stored ? stored` 后，themeBootstrap 6/6 绿、
// useTheme.test 14/14 绿、**两边都不红**，而放宽后 stored=垃圾值 + 系统暗色会让内联脚本落地
// `data-theme="neon"`（不匹配暗色块 `html[data-theme="dark"]` → 渲染亮色）、挂载后 useTheme
// 回退 system=dark → **首屏亮、挂载后暗的 FOUC**（正是 D-K 要防的）。
// 交付代码本身有正确校验（故 F-b 非真缺陷，是守卫盲区）；这条腿钉**行为**作解药：
// 垃圾 stored 必须被忽略、首屏即跟随系统偏好。
test('垃圾 stored 被忽略：stored=neon + 系统暗色时首屏即暗色（D-J / 终审 N2）', async ({
  page
}) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.addInitScript(([key]) => localStorage.setItem(key, 'neon'), [THEME_KEY] as const)
  await installThemeRecorder(page)

  await page.goto(`${API}/`)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

  const seq = await themeSeq(page)
  expect(seq, `垃圾 stored 不得产生无效 data-theme 帧：${JSON.stringify(seq)}`).not.toContain(
    'neon'
  )
  expect(
    seq,
    `垃圾 stored 应回退系统偏好，首屏序列不得出现 light：${JSON.stringify(seq)}`
  ).not.toContain('light')
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  expect(bg, `body 应渲染暗色 paper：实得 ${bg}`).toBe(DARK_PAPER)
})

test('暗色下硬阴影跟随翻转（spike 6 的 var() 传导在真产物上复验，D-D）', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto(`${API}/`)

  // 亮色基线：hero section.shadow-hard 的 box-shadow 用亮色 ink
  const light = await page.evaluate(() => {
    const el = document.querySelector('main section.shadow-hard') ?? document.querySelector('.shadow-hard')
    return el ? getComputedStyle(el).boxShadow : ''
  })
  expect(light, '亮色下应能读到 .shadow-hard 的 box-shadow').not.toBe('')
  expect(light, `亮色 box-shadow 应含 ink rgb(20, 20, 20)，实得 ${light}`).toContain('rgb(20, 20, 20)')

  await toggle(page).click()

  // 关键断言：阴影颜色由构建期烘焙的字面量变成 var() 后，运行时翻转令牌即可传导
  const dark = await page.evaluate(() => {
    const el = document.querySelector('main section.shadow-hard') ?? document.querySelector('.shadow-hard')
    return el ? getComputedStyle(el).boxShadow : ''
  })
  expect(dark, `暗色 box-shadow 应含暗色 ink rgb(247, 242, 231)，实得 ${dark}`).toContain(
    'rgb(247, 242, 231)'
  )
  expect(dark, `暗色 box-shadow 不得仍是亮色 ink，实得 ${dark}`).not.toContain('rgb(20, 20, 20)')
})

test('遮罩不泛白：暗色下 FilterDrawer 的 ::backdrop 仍是深色（D-E / spike 4）', async ({
  page
}) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto(`${API}/games`)

  // 筛选按钮是 lg:hidden，窄屏可见；点开后 dialog 走 showModal()
  await page.getByRole('button', { name: '筛选' }).click()
  const dialog = page.locator('dialog[open]')
  await expect(dialog).toBeVisible()

  const backdrop = await page.evaluate(() => {
    const d = document.querySelector('dialog')
    return d ? getComputedStyle(d, '::backdrop').backgroundColor : ''
  })
  expect(backdrop, '应读到 ::backdrop 的 background-color').not.toBe('')

  // 实现期实测：Tailwind 产出 `color-mix(in oklab, var(--color-scrim) 80%, transparent)`，
  // Chromium 对 ::backdrop 的 getComputedStyle 保留 oklab 形态（实测 `oklab(0.150853
  // 0.00139775 0.00721639 / 0.8)`），故亮度判据必须按色彩空间解析，不能假设 rgb。
  // spike 4 的失败形态 = color-mix(var(--color-ink) 60%) 在暗色下 L≈0.962（近白）。
  const oklab = /^oklab\(([\d.e+-]+)\s+([\d.e+-]+)\s+([\d.e+-]+)(?:\s*\/\s*[\d.]+%?)?\)$/i.exec(
    backdrop.trim()
  )
  if (oklab) {
    const L = Number(oklab[1])
    // scrim(#0d0b08) 实测 L=0.1509；失败形态 L=0.962 → 阈值 0.4 有充分鉴别力
    expect(L, `暗色遮罩泛白（::backdrop=${backdrop}）：oklab L=${L} 应 < 0.4`).toBeLessThan(0.4)
    expect(
      parseAlpha(backdrop, []),
      `遮罩透明度应为 80%（D-E），实得 ${backdrop}`
    ).toBeCloseTo(0.8, 2)
  } else {
    // 兼容 rgb()/rgba()/color(srgb …) 序列化形态（未来浏览器行为变化不至于假绿）。
    // ⚠️ 兜底分支必须与 oklab 主分支**同等严格**：只断言最大通道会让全透明遮罩
    // rgba(0,0,0,0)（= 遮罩功能完全失效）通过——控制者实测 GREEN。故一并钉 alpha≈0.8。
    // 若浏览器返回不带 alpha 的三数形态，说明遮罩不透明，同样偏离 D-E 钉的 80% 遮罩。
    const nums = (backdrop.match(/[\d.]+/g) ?? []).map(Number)
    expect(nums.length, `无法解析 ::backdrop 颜色：${backdrop}`).toBeGreaterThanOrEqual(3)
    const scale = Math.max(nums[0], nums[1], nums[2]) <= 1 ? 255 : 1
    const maxChannel = Math.max(nums[0], nums[1], nums[2]) * scale
    expect(
      maxChannel,
      `暗色遮罩泛白（::backdrop=${backdrop}）：最大通道 ${maxChannel.toFixed(0)} 应 < 128`
    ).toBeLessThan(128)
    expect(
      parseAlpha(backdrop, nums),
      `遮罩透明度应为 80%（D-E），实得 ${backdrop}；不带 alpha 的形态意味着遮罩不透明，同样偏离 D-E`
    ).toBeCloseTo(0.8, 2)
  }
})

test('开关尺寸与落点钉桩：32px、shrink-0、在 authEnabled 块之外（D-I / spike 2 否决 S6）', async ({
  page
}) => {
  await page.goto(`${API}/`)
  const box = await toggle(page).boundingBox()
  expect(box, '开关应有边界盒').not.toBeNull()
  expect(box!.width, '开关宽必须 32px（spike 3：28px 在最坏格 margin 仅 5px）').toBe(32)
  expect(box!.height, '开关高必须 32px').toBe(32)

  // 登出态也必须能切换主题（S6「塞进用户下拉菜单」被否的理由）
  await toggle(page).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

test('暗色下零横向溢出：@320/@375 × 登录态 ascii60（gap 变更的回归钉桩）', async ({ page }) => {
  for (const vp of [320, 375] as const) {
    await page.setViewportSize({ width: vp, height: 800 })
    await page.emulateMedia({ colorScheme: 'dark' })
    await seedSession(page, 'user', ASCII60)

    for (const route of ['/', '/account'] as const) {
      await page.goto(`${API}${route}`)
      if (route === '/account') await page.waitForSelector('dl', { state: 'visible' })
      // 两帧 rAF：等布局/字体落地（与 responsive.spec.ts 同口径）
      await page.evaluate(
        () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
      )
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
      const m = await page.evaluate(() => {
        const de = document.documentElement
        return { scrollWidth: de.scrollWidth, clientWidth: de.clientWidth }
      })
      expect(
        m.scrollWidth - m.clientWidth,
        `暗色 @${vp}px ${route} 横向溢出：scrollWidth=${m.scrollWidth} clientWidth=${m.clientWidth}`
      ).toBeLessThanOrEqual(1)
    }
  }
})
