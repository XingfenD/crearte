import { expect, test, type Page } from '@playwright/test'
import { API, fixtureGame } from './helpers'

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
