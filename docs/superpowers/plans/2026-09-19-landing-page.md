# crearte 落地页实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 给 crearte 新增独立落地页挂在 `/`，原目录整体迁到 `/games`；落地页 = 静态 hero（海报式三层刊头）+ 数据推导的统计条 + 按类型均衡取样的精选网格 + 投稿/文档两个入口卡。

**架构：** 路由层把 `/` 交给新视图 `LandingView.vue`，把原 `HomeView.vue` 重命名为 `CatalogView.vue` 并挂到 `/games`；精选列表由纯函数 `lib/featured.ts` 的 `pickFeatured()` 按 `type` 轮转取样得出；精选区复用既有 `GameCard` 与 `StatePanel`（三态），hero 与两个入口卡不依赖数据、永远渲染。

**技术栈：** Vue 3 + TypeScript strict + vue-router 4 + Tailwind CSS v4 + vitest + Playwright

---

**规格：** `docs/superpowers/specs/2026-09-19-landing-page-design.md`（权威；本计划与规格冲突时以规格为准，并同步修正本计划文本）

**执行前必查：**

- `git branch --show-current` 必须是 `feat/landing-page`（从 `master` 的 `8439eef` 切出，规格已在 `b674b07` 提交）
- 门禁命令在 `src/` 下执行；Node 用 `/root/.nvm/versions/node/v24.18.0/bin`
- e2e 之前先 `lsof -ti:4173 | xargs -r kill`（`playwright.config.ts` 里 `reuseExistingServer: !CI` 会复用旧服务）
- **绝不 `git add -A`**，逐个精确路径 `git add`；**不要提交 `src/package-lock.json`**（非本任务产物）
- 代码风格：TypeScript strict、无分号、单引号、2 空格缩进、**零注释**；只用平面海报令牌（零渐变、全直角）；`src/app/data/**` 一行不改；不新增依赖

**e2e 数据集基准（`build-data.mjs --with-fixtures` 产出，本计划多处依赖）：**

- 收录 **15 款**，`type` 去重后 **4 种**（`puzzle` / `idle` / `narrative` / `other`），最新 `addedAt` = `2026-09-17`
- `pickFeatured(games, 6)` 的期望顺序：`2048 → a-dark-room → arclight-nightcast → abs-paths → case-files → corrupt`
- 既有 e2e 在 master 上为 **26 passed**

---

## 文件结构

| 文件 | 职责 | 动作 |
|---|---|---|
| `src/app/lib/featured.ts` | `pickFeatured()` 纯函数：按 `type` 轮转取样 | 创建 |
| `src/app/lib/featured.test.ts` | 上者的单测 | 创建 |
| `src/app/views/LandingView.vue` | 落地页：hero、统计条、精选区、两个入口卡 | 创建 |
| `src/app/views/CatalogView.vue` | 目录页（原 `HomeView.vue`，内容一行不改） | 重命名 |
| `src/app/components/AppHeader.vue` | 导航激活判定与贴纸判定拆成两个 computed | 修改 |
| `src/app/router/index.ts` | `/` → `LandingView`、`/games` → `CatalogView` | 修改 |
| `src/e2e/landing.spec.ts` | 落地页与路由迁移的 e2e | 创建 |
| `docs/CHANGELOG.md` | 记 `0.5.0` | 修改 |

---

## 任务 1：精选取样纯函数 `pickFeatured`

**文件：**
- 创建：`src/app/lib/featured.ts`
- 测试：`src/app/lib/featured.test.ts`

- [ ] **步骤 1：编写失败的测试**

创建 `src/app/lib/featured.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import type { GameSummary } from '@/data/types'
import { pickFeatured } from './featured'

function game(id: string, type: GameSummary['type'], addedAt = '2026-01-01'): GameSummary {
  return {
    id,
    name: id,
    url: 'https://example.com/',
    author: { name: '作者' },
    description: '描述',
    durationMinutes: { min: 5, max: 20 },
    type,
    tags: [],
    addedAt
  }
}

function rawGame(id: string, type: string, addedAt: string): GameSummary {
  return { ...game(id, 'other', addedAt), type: type as GameSummary['type'] }
}

describe('pickFeatured', () => {
  it('空数组与 limit <= 0 都返回空数组', () => {
    expect(pickFeatured([])).toEqual([])
    expect(pickFeatured([game('a', 'puzzle')], 0)).toEqual([])
    expect(pickFeatured([game('a', 'puzzle')], -3)).toEqual([])
  })

  it('单一类型：addedAt 倒序，并列按 id 升序，并截断到 limit', () => {
    const sameDay = [game('b', 'puzzle'), game('a', 'puzzle'), game('old', 'puzzle', '2025-12-01')]
    expect(pickFeatured(sameDay, 2).map((g) => g.id)).toEqual(['a', 'b'])
    expect(pickFeatured(sameDay, 9).map((g) => g.id)).toEqual(['a', 'b', 'old'])
  })

  it('多类型：按 GAME_TYPES 顺序轮转取样', () => {
    const mixed = [
      game('p1', 'puzzle', '2026-03-01'),
      game('p2', 'puzzle', '2026-02-01'),
      game('i1', 'idle', '2026-01-01'),
      game('n1', 'narrative', '2026-01-01'),
      game('a1', 'action', '2026-01-01')
    ]
    expect(pickFeatured(mixed, 6).map((g) => g.id)).toEqual(['p1', 'a1', 'i1', 'n1', 'p2'])
    expect(pickFeatured(mixed, 2).map((g) => g.id)).toEqual(['p1', 'a1'])
  })

  it('结果不依赖入参顺序，且同一输入两次调用一致', () => {
    const mixed = [
      game('p1', 'puzzle', '2026-03-01'),
      game('p2', 'puzzle', '2026-02-01'),
      game('i1', 'idle', '2026-01-01'),
      game('n1', 'narrative', '2026-01-01')
    ]
    const expected = pickFeatured(mixed, 6).map((g) => g.id)
    expect(pickFeatured(mixed, 6).map((g) => g.id)).toEqual(expected)
    expect(pickFeatured([...mixed].reverse(), 6).map((g) => g.id)).toEqual(expected)
    expect(pickFeatured([mixed[2], mixed[0], mixed[3], mixed[1]], 6).map((g) => g.id)).toEqual(expected)
  })

  it('不修改入参', () => {
    const mixed = [game('p1', 'puzzle', '2026-03-01'), game('p2', 'puzzle', '2026-02-01')]
    const snapshot = JSON.stringify(mixed)
    pickFeatured(mixed, 1)
    expect(JSON.stringify(mixed)).toBe(snapshot)
  })

  it('未知 type 排在已知类型之后，按类型名字典序', () => {
    const weird = [rawGame('zz', 'zen', '2026-01-01'), rawGame('oo', 'other', '2026-01-01'), rawGame('aa', 'alpha', '2026-01-01')]
    expect(pickFeatured(weird, 6).map((g) => g.id)).toEqual(['oo', 'aa', 'zz'])
  })
})
```

- [ ] **步骤 2：运行测试验证失败**

运行：`cd src && npx vitest run app/lib/featured.test.ts`
预期：FAIL，报错 `Failed to resolve import "./featured"`（或 `pickFeatured is not a function`）

- [ ] **步骤 3：编写最少实现代码**

创建 `src/app/lib/featured.ts`：

```ts
import { GAME_TYPES, type GameSummary } from '@/data/types'

const KNOWN_TYPES: readonly string[] = GAME_TYPES

function compareTypes(a: string, b: string): number {
  const indexA = KNOWN_TYPES.indexOf(a)
  const indexB = KNOWN_TYPES.indexOf(b)
  const rankA = indexA === -1 ? KNOWN_TYPES.length : indexA
  const rankB = indexB === -1 ? KNOWN_TYPES.length : indexB
  if (rankA !== rankB) return rankA - rankB
  if (a === b) return 0
  return a < b ? -1 : 1
}

function compareByRecency(a: GameSummary, b: GameSummary): number {
  if (a.addedAt !== b.addedAt) return a.addedAt < b.addedAt ? 1 : -1
  if (a.id === b.id) return 0
  return a.id < b.id ? -1 : 1
}

export function pickFeatured(games: GameSummary[], limit = 6): GameSummary[] {
  if (limit <= 0) return []

  const groups = new Map<string, GameSummary[]>()
  for (const game of games) {
    const bucket = groups.get(game.type)
    if (bucket) bucket.push(game)
    else groups.set(game.type, [game])
  }

  const types = [...groups.keys()].sort(compareTypes)
  const ordered: GameSummary[][] = []
  let depth = 0
  for (const type of types) {
    const bucket = groups.get(type) ?? []
    bucket.sort(compareByRecency)
    ordered.push(bucket)
    depth = Math.max(depth, bucket.length)
  }

  const picked: GameSummary[] = []
  for (let round = 0; round < depth && picked.length < limit; round += 1) {
    for (const bucket of ordered) {
      const game = bucket[round]
      if (!game) continue
      picked.push(game)
      if (picked.length === limit) break
    }
  }
  return picked
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`cd src && npx vitest run app/lib/featured.test.ts`
预期：PASS，6 个用例全绿

- [ ] **步骤 5：类型检查**

运行：`cd src && npm run typecheck`
预期：无输出（退出码 0）

- [ ] **步骤 6：Commit**

```bash
cd /root/crearte_mono/crearte
git add src/app/lib/featured.ts src/app/lib/featured.test.ts
git commit -m "feat: add pickFeatured balanced type sampling"
```

---

## 任务 2：目录迁站 + 落地页上线（hero 与统计条）

**这一步是原子的**：重命名、路由、页头判定、落地页 hero 必须同一提交完成，否则中间态会出现「导航高亮错位」。

**文件：**
- 重命名：`src/app/views/HomeView.vue` → `src/app/views/CatalogView.vue`
- 创建：`src/app/views/LandingView.vue`
- 修改：`src/app/router/index.ts`
- 修改：`src/app/components/AppHeader.vue:1-33`（判定拆分 + 导航「游戏」改指 `/games`）
- 修改：`src/app/views/GameView.vue:28,37,42`（「退出游戏」的程序化导航 + 两处「返回目录」改指 `/games`）
- 修改：`src/app/views/NotFoundView.vue:14`（「返回目录」改指 `/games`）
- 测试：`src/e2e/landing.spec.ts`

- [ ] **步骤 1：重命名目录页文件（内容一行不改）**

```bash
cd /root/crearte_mono/crearte
git mv src/app/views/HomeView.vue src/app/views/CatalogView.vue
grep -rn "HomeView" src/app src/e2e
```

预期：`git mv` 无输出；`grep` 只剩 `src/app/router/index.ts` 一处引用（下一步处理）。

- [ ] **步骤 2：改造路由**

把 `src/app/router/index.ts` 的 `routes` 数组整体替换为（`scrollBehavior` 不动）：

```ts
  routes: [
    { path: '/', name: 'home', component: () => import('@/views/LandingView.vue') },
    { path: '/games', name: 'catalog', component: () => import('@/views/CatalogView.vue') },
    { path: '/games/:id', name: 'game', component: () => import('@/views/GameView.vue'), props: true },
    { path: '/docs', name: 'docs', component: () => import('@/views/DocsView.vue') },
    { path: '/docs/:slug', name: 'doc', component: () => import('@/views/DocsView.vue'), props: true },
    { path: '/out', name: 'outbound', component: () => import('@/views/OutboundView.vue') },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('@/views/NotFoundView.vue') }
  ],
```

要点：`/games` 必须排在 `/games/:id` 之前；`name` 变化只有两处——`/` 仍叫 `home`（现在是落地页），目录新占 `catalog`。

- [ ] **步骤 3：拆分 `AppHeader` 的两个判定**

`src/app/components/AppHeader.vue` 的 `<script setup>` 中，把 `route.name === 'home'` 这一处判定拆成两个 computed——**一个管导航激活，一个管贴纸**（合成一个会让落地页上「游戏」错误高亮）：

```ts
const route = useRoute()
const onCatalog = computed(() => route.name === 'catalog')
const showGameCount = computed(() => route.name === 'catalog' || route.name === 'home')
const onDocs = computed(() => route.name === 'docs' || route.name === 'doc')

const { data: games } = useAsync<GameSummary[] | null>(
  () => (showGameCount.value ? repo.listGames() : Promise.resolve(null)),
  [showGameCount]
)
```

`sticker` computed 里的 `onCatalog.value` 也改为 `showGameCount.value`：

```ts
const sticker = computed(() => {
  if (showGameCount.value && games.value) return `共 ${games.value.length} 款`
  if (onDocs.value && docs.value) return `共 ${docs.value.length} 篇`
  return 'STATIC WEB GAMES'
})
```

模板**不动**（导航 `:class` 继续用 `onCatalog`，`:aria-current` 条件也不动）。

- [ ] **步骤 4：把所有「回目录」的导航改指 `/games`**

`/` 的语义从「目录」变成「落地页」，五处语义为「回目录」的导航必须一起改，否则点下去回的是落地页。注意最后一行是**程序化导航**，写在 `<script>` 里，`grep 'to="/"'` 看不见：

```
app/components/AppHeader.vue:36   to="/"              →  to="/games"
app/views/GameView.vue:37         to="/"              →  to="/games"
app/views/GameView.vue:42         to="/"              →  to="/games"
app/views/NotFoundView.vue:14     to="/"              →  to="/games"
app/views/GameView.vue:28         router.push('/')     →  router.push('/games')
```

两处**保持 `/` 不动**（语义是「回首页」而非「回目录」）：
- `AppHeader.vue:31` 品牌 `crearte` 贴纸
- `OutboundView.vue:42` `goBack()` 无历史时的兜底 `router.replace('/')`

验收判据（先 `grep`，再复核语义）：

```bash
grep -rn 'to="/"' src/app      # 预期只剩 AppHeader.vue:31
grep -rn "push('/')" src/app   # 预期无输出
```

- [ ] **步骤 5：创建落地页（hero + 统计条）**

创建 `src/app/views/LandingView.vue`：

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { repo, type GameSummary } from '@/data'
import { useAsync } from '@/composables/useAsync'

const SLOGAN = 'STATIC WEB GAMES'
const TAGLINE = '收集可直接开玩的静态网页游戏 · 打开即玩、无需安装'

const { data: games } = useAsync<GameSummary[]>(() => repo.listGames())

const total = computed(() => games.value?.length ?? 0)

const stats = computed(() => {
  const list = games.value ?? []
  if (!list.length) return null
  const dates = list.map((game) => game.addedAt).sort()
  return { types: new Set(list.map((game) => game.type)).size, latest: dates[dates.length - 1] ?? '' }
})
</script>

<template>
  <section class="border-[3px] border-ink bg-surface px-6 py-10 text-center shadow-hard sm:px-10 sm:py-14">
    <h1 class="font-display text-4xl leading-none font-black tracking-tight sm:text-5xl md:text-6xl">crearte</h1>
    <p class="mt-3 font-mono text-[0.6875rem] tracking-[0.3em] text-ink-soft">{{ SLOGAN }}</p>
    <div class="mx-auto my-5 h-[3px] w-16 bg-ink"></div>
    <p class="text-sm text-ink-soft">{{ TAGLINE }}</p>
    <div class="mt-6 flex flex-wrap justify-center gap-3">
      <RouterLink to="/games" class="btn-ink lift hover:shadow-hard active:shadow-none">进入游戏目录</RouterLink>
      <RouterLink to="/docs/about" class="btn-surface lift hover:shadow-hard active:shadow-none">关于本站</RouterLink>
    </div>
    <p v-if="stats" class="mt-6 flex flex-wrap justify-center gap-x-4 gap-y-1 font-mono text-[0.6875rem] tracking-[0.05em] text-ink-soft">
      <span>收录 {{ total }} 款</span>
      <span>{{ stats.types }} 种类型</span>
      <span>更新 {{ stats.latest }}</span>
    </p>
  </section>
</template>
```

要点：`<h1>` 是**可见**的（目录页那个 `sr-only` h1 不动）；统计条在 `stats` 为 `null`（数据未就绪 / 失败 / 收录为空）时整条隐藏；hero 不包在 `StatePanel` 里，因此任何数据状态都渲染。

- [ ] **步骤 6：编写 e2e**

创建 `src/e2e/landing.spec.ts`：

```ts
import { expect, test } from '@playwright/test'

test('首页是落地页：hero 文案与统计条', async ({ page }) => {
  await page.goto('http://localhost:4173/')

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('crearte')
  await expect(page.getByText('收集可直接开玩的静态网页游戏 · 打开即玩、无需安装')).toBeVisible()
  await expect(page.getByText('收录 15 款')).toBeVisible()
  await expect(page.getByText('4 种类型')).toBeVisible()
  await expect(page.getByText('更新 2026-09-17')).toBeVisible()
})

test('落地页上页头导航都不激活，但贴纸显示收录数', async ({ page }) => {
  await page.goto('http://localhost:4173/')

  await expect(page.getByRole('link', { name: '游戏', exact: true })).not.toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('link', { name: '文档', exact: true })).not.toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('link', { name: '游戏', exact: true })).toHaveAttribute('href', '/games')
  await expect(page.getByText('共 15 款')).toBeVisible()
})

test('回目录的链接都指向 /games', async ({ page }) => {
  await page.goto('http://localhost:4173/games')
  await expect(page.getByRole('link', { name: '游戏', exact: true })).toHaveAttribute('href', '/games')

  await page.goto('http://localhost:4173/games/2048')
  await expect(page.getByRole('link', { name: '返回目录' })).toHaveAttribute('href', '/games')

  await page.goto('http://localhost:4173/no-such-page')
  await expect(page.getByRole('link', { name: '返回目录' })).toHaveAttribute('href', '/games')

  await page.goto('http://localhost:4173/games/does-not-exist')
  await expect(page.getByRole('link', { name: '返回目录' })).toHaveAttribute('href', '/games')
})

test('目录迁到 /games 且导航激活', async ({ page }) => {
  await page.goto('http://localhost:4173/games')

  await expect(page.locator('#game-search')).toBeVisible()
  await expect(page.getByRole('link', { name: '游戏', exact: true })).toHaveAttribute('aria-current', 'page')
})

test('从落地页进入目录', async ({ page }) => {
  await page.goto('http://localhost:4173/')
  await page.getByRole('link', { name: '进入游戏目录' }).click()

  await expect(page).toHaveURL('http://localhost:4173/games')
  await expect(page.locator('#game-search')).toBeVisible()
})
```

- [ ] **步骤 7：类型检查与构建**

运行：`cd src && npm run typecheck && npm run build`
预期：`typecheck` 无输出；`build` 末尾出现 `✓ built in …` 与 `[build-runtime] dist/sw.js, dist/agent.js, dist/bootstrap/index.html (self-contained)`

- [ ] **步骤 8：运行 e2e**

运行：`cd src && lsof -ti:4173 | xargs -r kill; npm run e2e`
预期：**31 passed**（master 基线 26 + 本次新增 5）

- [ ] **步骤 9：Commit**

```bash
cd /root/crearte_mono/crearte
git add src/app/views/CatalogView.vue src/app/views/HomeView.vue src/app/views/LandingView.vue src/app/views/GameView.vue src/app/views/NotFoundView.vue src/app/router/index.ts src/app/components/AppHeader.vue src/e2e/landing.spec.ts
git commit -m "feat: add landing page at / and move the catalog to /games"
```

预期：`git status --short` 显示为 `R` 重命名 + `A` 新增 + `M` 修改，工作区干净。

---

## 任务 3：精选区（均衡取样 + 三态）

**文件：**
- 修改：`src/app/views/LandingView.vue`
- 测试：`src/e2e/landing.spec.ts`

- [ ] **步骤 1：接入 `pickFeatured` 与三态**

把 `src/app/views/LandingView.vue` 的 `<script setup>` 改成：

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { repo, type GameSummary } from '@/data'
import { useAsync } from '@/composables/useAsync'
import { pickFeatured } from '@/lib/featured'
import GameCard from '@/components/GameCard.vue'
import StatePanel from '@/components/StatePanel.vue'

const SLOGAN = 'STATIC WEB GAMES'
const TAGLINE = '收集可直接开玩的静态网页游戏 · 打开即玩、无需安装'
const FEATURED_LIMIT = 6

const { data: games, error, loading, reload } = useAsync<GameSummary[]>(() => repo.listGames())

const total = computed(() => games.value?.length ?? 0)
const featured = computed(() => pickFeatured(games.value ?? [], FEATURED_LIMIT))

const stats = computed(() => {
  const list = games.value ?? []
  if (!list.length) return null
  const dates = list.map((game) => game.addedAt).sort()
  return { types: new Set(list.map((game) => game.type)).size, latest: dates[dates.length - 1] ?? '' }
})
</script>
```

模板在 hero 的 `</section>` **之后**插入：

```vue
  <section class="mt-8">
    <div class="flex items-baseline gap-2">
      <h2 class="font-mono text-[0.6875rem] font-bold tracking-[0.08em]">精选 · SELECTED</h2>
      <RouterLink v-if="featured.length" to="/games" class="ml-auto text-xs text-ink-soft underline">
        查看全部 {{ total }} 款 →
      </RouterLink>
    </div>
    <StatePanel :loading="loading" :error="error" @retry="reload">
      <div v-if="featured.length" class="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <GameCard v-for="game in featured" :key="game.id" :game="game" />
      </div>
      <p v-else class="mt-3 border-2 border-dashed border-ink p-10 text-center text-sm text-ink-soft">
        还没有收录游戏。
      </p>
    </StatePanel>
  </section>
```

要点：`StatePanel` 只包精选区，hero 与统计条在它之外；空态措辞与目录页一致；「查看全部」只在有精选时渲染；错误态的兜底是 hero 里那个「进入游戏目录」主 CTA，**不在错误框里重复加同义按钮**。

- [ ] **步骤 2：扩展 e2e**

在 `src/e2e/landing.spec.ts` 末尾追加：

```ts
test('精选区按类型均衡取样、上限 6', async ({ page }) => {
  await page.goto('http://localhost:4173/')

  const cards = page.locator('a[href^="/games/"]')
  await expect(cards).toHaveCount(6)
  expect(await cards.evaluateAll((els) => els.map((el) => el.getAttribute('href')))).toEqual([
    '/games/2048',
    '/games/a-dark-room',
    '/games/arclight-nightcast',
    '/games/abs-paths',
    '/games/case-files',
    '/games/corrupt'
  ])
})

test('查看全部进入目录', async ({ page }) => {
  await page.goto('http://localhost:4173/')
  await page.getByRole('link', { name: /^查看全部/ }).click()

  await expect(page).toHaveURL('http://localhost:4173/games')
  await expect(page.locator('#game-search')).toBeVisible()
})

test('数据失败时 hero 仍在、精选区显示错误态', async ({ page }) => {
  await page.route('**/data/index.json', (route) => route.fulfill({ status: 500, body: 'boom' }))
  await page.goto('http://localhost:4173/')

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('crearte')
  await expect(page.getByText('收集可直接开玩的静态网页游戏 · 打开即玩、无需安装')).toBeVisible()
  await expect(page.getByText('加载失败')).toBeVisible()
  await expect(page.getByRole('button', { name: '重试' })).toBeVisible()
})

test('空数据时统计条隐藏、精选区显示空态', async ({ page }) => {
  await page.route('**/data/index.json', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ schemaVersion: 1, generatedAt: '2026-09-19T00:00:00.000Z', games: [] })
    })
  )
  await page.goto('http://localhost:4173/')

  await expect(page.getByText('还没有收录游戏。')).toBeVisible()
  await expect(page.getByText('收录 0 款')).toHaveCount(0)
})
```

- [ ] **步骤 3：类型检查与 e2e**

运行：`cd src && npm run typecheck && npm run build && lsof -ti:4173 | xargs -r kill; npm run e2e`
预期：typecheck 无输出；**35 passed**（上一任务 31 + 本次新增 4）

- [ ] **步骤 4：Commit**

```bash
cd /root/crearte_mono/crearte
git add src/app/views/LandingView.vue src/e2e/landing.spec.ts
git commit -m "feat: add the featured grid to the landing page"
```

---

## 任务 4：投稿入口卡与文档入口卡

**文件：**
- 修改：`src/app/views/LandingView.vue`
- 测试：`src/e2e/landing.spec.ts`

- [ ] **步骤 1：加常量与两个入口卡**

在 `src/app/views/LandingView.vue` 的 `<script setup>` 里，`TAGLINE` 那一行之后加：

```ts
const CONTACT_EMAIL = 'xingfen.fendy@outlook.com'
```

模板在精选区 `</section>` **之后**插入：

```vue
  <div class="mt-8 flex flex-col gap-4 sm:flex-row">
    <section class="flex-1 border-2 border-ink bg-surface p-4 shadow-hard-sm">
      <h3 class="text-sm font-black">想被收录？</h3>
      <p class="mt-2 text-xs leading-relaxed text-ink-soft">
        提交 issue 或 PR，也可以发邮件到
        <a :href="`mailto:${CONTACT_EMAIL}`" class="underline">{{ CONTACT_EMAIL }}</a>
      </p>
    </section>
    <section class="flex-1 border-2 border-ink bg-surface p-4 shadow-hard-sm">
      <h3 class="text-sm font-black">文档</h3>
      <p class="mt-2 text-xs leading-relaxed text-ink-soft">
        收录标准、投稿方式与本站说明，见
        <RouterLink to="/docs" class="underline">文档</RouterLink>。
      </p>
    </section>
  </div>
```

要点：邮箱是普通 `mailto:` 锚点，**不经 `/out` 中间页**（与中间页规格 §4.3 一致）；两块不依赖数据，任何状态都渲染。

- [ ] **步骤 2：扩展 e2e**

在 `src/e2e/landing.spec.ts` 末尾追加：

```ts
test('投稿卡邮箱走 mailto、不套中间页', async ({ page }) => {
  await page.goto('http://localhost:4173/')

  await expect(page.getByRole('link', { name: 'xingfen.fendy@outlook.com' })).toHaveAttribute(
    'href',
    'mailto:xingfen.fendy@outlook.com'
  )
})

test('文档入口卡指向 /docs', async ({ page }) => {
  await page.goto('http://localhost:4173/')

  await expect(page.locator('main').getByRole('link', { name: '文档', exact: true })).toHaveAttribute('href', '/docs')
})

test('数据失败时两个入口卡仍在', async ({ page }) => {
  await page.route('**/data/index.json', (route) => route.fulfill({ status: 500, body: 'boom' }))
  await page.goto('http://localhost:4173/')

  await expect(page.getByRole('heading', { name: '想被收录？' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '文档' })).toBeVisible()
})
```

- [ ] **步骤 3：类型检查与 e2e**

运行：`cd src && npm run typecheck && npm run build && lsof -ti:4173 | xargs -r kill; npm run e2e`
预期：typecheck 无输出；**38 passed**（上一任务 35 + 本次新增 3）

- [ ] **步骤 4：Commit**

```bash
cd /root/crearte_mono/crearte
git add src/app/views/LandingView.vue src/e2e/landing.spec.ts
git commit -m "feat: add submit and docs entry cards to the landing page"
```

---

## 任务 5：CHANGELOG 记 0.5.0

**文件：**
- 修改：`docs/CHANGELOG.md`（顶部说明之后、`## [0.4.1]` 之前）

- [ ] **步骤 1：写入 0.5.0 条目**

在 `docs/CHANGELOG.md` 第 8 行（说明段之后）插入：

```markdown
## [0.5.0] - 2026-09-19

### Added / 新增

- Added a landing page at `/` with a poster-style hero, a collection counter, and a featured grid sampled by balanced type rotation; the catalog moved to `/games`.
- 新增 `/` 落地页：海报式 hero、收录统计条，以及按类型均衡取样得出的精选网格；目录迁至 `/games`。

### Changed / 变更

- The header badge shows the collection count on the landing page too, while navigation highlighting still follows the catalog route only.
- 页头贴纸在落地页也显示收录数；导航激活仍只看目录路由。

```

格式约束：同一条目的英文行紧接中文行（中间无空行），条目之间空一行，高版本在上（`## [X.Y.Z] - YYYY-MM-DD`）。

- [ ] **步骤 2：验证渲染位置**

运行：`cd /root/crearte_mono/crearte && head -30 docs/CHANGELOG.md`
预期：`0.5.0` 在最上，其下依次 `0.4.1`、`0.4.0`、`0.3.0`

- [ ] **步骤 3：Commit**

```bash
cd /root/crearte_mono/crearte
git add docs/CHANGELOG.md
git commit -m "docs: record 0.5.0 landing page"
```

---

## 任务 6：全量验收

- [ ] **步骤 1：跑完整门禁**

运行：`cd src && lsof -ti:4173 | xargs -r kill; npm run check && npm run e2e`
预期：`check` 里 vitest 全绿（含新增 6 个 `featured` 用例）、`vue-tsc` 无输出、`vite build` 成功；e2e **38 passed**

- [ ] **步骤 2：逐节核对规格**

对照 `docs/superpowers/specs/2026-09-19-landing-page-design.md`，逐条确认：

- §4.1 路由表：`/` → LandingView、`/games` → CatalogView、`/games` 在 `/games/:id` 之前
- §4.2 hero 六个元素自上而下齐全（h1 / 标语 / 分隔线 / 定位语 / 双 CTA / 统计条）
- §4.3 `onCatalog` 与 `showGameCount` 是两个独立判定；落地页导航无激活项、贴纸显示收录数
- §5 `pickFeatured` 五条规则与 §10.1 的 6 类用例都在
- §6 统计条在 `null`/空数组时隐藏；空态措辞为「还没有收录游戏。」
- §7 文案与规格逐字一致（含 `STATIC WEB GAMES`、定位语、`精选 · SELECTED`、`查看全部 N 款 →`、邮箱）
- §8 h1 可见且全页唯一；精选标题 `h2`、入口卡标题 `h3`；无渐变（`no-gradient` 守卫通过）
- §9 无新增依赖；`git diff --stat 8439eef..HEAD` 里 `src/app/data/**` 与 `src/package-lock.json` **不出现**

任一不符：按规格修代码，并把本计划对应文本同步改掉。

- [ ] **步骤 3：确认分支状态**

运行：`cd /root/crearte_mono/crearte && git status --short && git log --oneline 8439eef..HEAD | cat`
预期：工作区干净；5 个提交（任务 1、2、3、4、5 各一）

- [ ] **步骤 4：交回控制者**

不要自行合并。汇报：门禁输出、e2e 条数、与规格的核对结论；由控制者决定是否 `git merge --no-ff` 回 `master` 并删分支。
