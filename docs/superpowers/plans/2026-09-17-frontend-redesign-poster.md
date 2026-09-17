# 前端视觉重设计（平面海报）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按平面海报语言（纸底、墨描边、硬阴影、全直角、零渐变）重建全部界面，视觉约束可被守卫测试自动验证。

**Architecture:** 全部视觉改动收敛在 `src/app/styles/main.css` 的设计令牌与 `@layer components` 两个共享类（`.lift` / `.btn-ink`）中；组件只消费令牌类，不写内联样式。数据层、路由、筛选/排序/搜索算法、schema 一律不动。运行期唯一新增依赖是 `@phosphor-icons/vue`，字体自托管。

**Tech Stack:** Vue 3 · TypeScript（strict, verbatimModuleSyntax）· Vite 8 · Tailwind CSS v4（`@theme` 令牌）· Vitest · `@phosphor-icons/vue@^2.2.1` · Playwright（playwright-skill，仅做视觉验证，不进仓库）

**Spec:** `docs/superpowers/specs/2026-09-17-frontend-redesign-poster-design.md`

## Global Constraints

- 站点 npm 工程根 = `src/`；所有 `npm` 命令在 `src/` 执行。
- 设计约束（spec §3）：**零渐变**（`gradient`/`repeating-` 字符串不得出现）、**零圆角**（不使用任何 `rounded-*` 工具类；base 层全局 `border-radius: 0`）、硬阴影无模糊无透明度、悬停/按下只动 `transform` 与 `box-shadow`。
- 配色与字体栈逐字照抄 spec §3.1 / §3.2 / §7.3；不得新增 spec 之外的颜色令牌。
- 交互过渡 `140ms ease-out`；`prefers-reduced-motion: reduce` 下关闭过渡、动画与悬停位移；`color-scheme: light` 固定。
- 新增依赖只允许 `@phosphor-icons/vue`；字体 woff2 与 `OFL.txt` 作为资源提交，运行期与构建期均不访问 Google 域名。
- 路由、数据层（`src/app/data/**`）、`filter.ts` 算法、`markdown.ts`、schema、构建脚本不改（`filter.ts` 只新增计数纯函数）。
- TypeScript strict + `verbatimModuleSyntax`；测试与源码同目录同名（`foo.ts` ↔ `foo.test.ts`，Vitest），源码内一律 `@/` 别名导入（`@` → `src/app`）。
- 提交规范：conventional commits（`feat:` / `test:` / `chore:`），每个 Task 结束提交一次；不提交 `src/public/data/`（已 gitignore）。
- 每个 Task 收尾必须 `cd src && npm run check`（= `vitest run && vue-tsc --noEmit && vite build`）全绿。
- 视觉验证（spec 要求"实现期间查看当前样式"）：每个 UI Task 用 **playwright-skill** 跑 `/tmp/playwright-poster-check.js`，截图存 `/tmp`，用 `read` 工具读 PNG 核对；必须报告控制台错误、横向滚动、Google 域名字体请求。

---

## 文件结构总览

```
src/
├─ assets/fonts/playfair-display-900.woff2   # 新增（latin 子集，自托管）
├─ assets/fonts/OFL.txt                      # 新增（SIL OFL 1.1）
├─ app/styles/main.css                       # 重写（令牌 + @font-face + base + components + markdown-body）
├─ app/components/
│  ├─ AppHeader.vue        # 新增（logo / 导航 / 计数贴纸）
│  ├─ AppFooter.vue        # 新增
│  ├─ FilterSidebar.vue    # 新增（筛选行，桌面与抽屉共用）
│  ├─ FilterDrawer.vue     # 新增（原生 <dialog> 移动抽屉）
│  ├─ ResultMeta.vue       # 新增（结果数与排序行）
│  ├─ GameCard.vue         # 重写
│  ├─ GameCover.vue        # 重写（纯色兜底）
│  ├─ StatePanel.vue       # 重写（骨架/错误）
│  ├─ DocSidebar.vue       # 重写（list / tabs 两种形态）
│  ├─ DocToc.vue           # 重写
│  └─ GameFilters.vue      # 删除
├─ app/lib/
│  ├─ cover.ts / cover.test.ts   # 修改（删 coverGradient，加 COVER_COLORS/coverColor）
│  ├─ filter.ts / filter.test.ts # 修改（加 countByType/countByDuration/countByTag）
│  └─ no-gradient.test.ts        # 新增（守卫）
├─ app/views/{HomeView,GameView,DocsView,NotFoundView}.vue  # 重写
├─ app/App.vue             # 重写（仅骨架 + 页头/页脚）
├─ app/main.ts             # 不动
├─ index.html              # 修改（body 类 / color-scheme / theme-color）
├─ public/favicon.svg      # 重写（直角几何标记）
└─ package.json            # 新增 @phosphor-icons/vue
```

---

## Task 0: 环境预检与视觉基线

**Files:**
- 只读：整个仓库；不改任何受版本控制的文件

**Interfaces:**
- Consumes: 无
- Produces: 可运行的 dev server（`http://localhost:5173`）与复用脚本 `/tmp/playwright-poster-check.js`；基线截图供后续 Task 对照

- [ ] **Step 1: 安装依赖并确认基线全绿**

```bash
cd src && npm install && npm run check
```
Expected: vitest 全部通过、`vue-tsc` 无错误、vite build 成功。（仓库当前没有 `node_modules`，必须先装。）

- [ ] **Step 2: 启动 dev server（后台，持续到 Task 11）**

```bash
cd src && nohup npm run dev > /tmp/vite.log 2>&1 & sleep 4 && curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/
```
Expected: `200`。若 5173 被占用，改脚本里的 `BASE_URL` 环境变量。

- [ ] **Step 3: 写 Playwright 验证脚本**

写入 `/tmp/playwright-poster-check.js`（不改仓库）：

```js
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const OUT = process.env.PW_ARTIFACT_DIR || '/tmp';
const ROUTES = [
  ['home', '/'],
  ['game', '/games/2048'],
  ['docs', '/docs'],
  ['doc', '/docs/about'],
  ['404', '/definitely-missing'],
];
const VIEWPORTS = [
  ['mobile375', 375, 812],
  ['tablet768', 768, 1024],
  ['desktop1280', 1280, 900],
  ['wide1920', 1920, 1080],
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const consoleErrors = [];
  const fontRequests = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));
  page.on('request', (req) => { if (/fonts\.(googleapis|gstatic)\.com/.test(req.url())) fontRequests.push(req.url()); });

  const report = [];
  for (const [vpName, width, height] of VIEWPORTS) {
    await page.setViewportSize({ width, height });
    for (const [routeName, route] of ROUTES) {
      await page.goto(BASE + route);
      await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'));
      await page.evaluate(() => document.fonts.ready);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      const shot = path.join(OUT, `poster-${routeName}-${vpName}.png`);
      await page.screenshot({ path: shot, fullPage: true });
      report.push({ route, viewport: vpName, overflow, shot });
    }
  }
  console.log(JSON.stringify({ report, consoleErrors, fontRequests }, null, 2));
  await browser.close();
})();
```

- [ ] **Step 4: 跑基线截图并查看**

```bash
node ~/.config/opencode/skills/playwright-skill/run.js /tmp/playwright-poster-check.js
```
Expected: 20 张截图写到 `/tmp/poster-*.png`；`consoleErrors` 为空（允许 404 路由的 `Failed to load resource` 之外为空，若有请记录）；`fontRequests` 为空。用 `read` 工具打开 `/tmp/poster-home-desktop1280.png` 与 `/tmp/poster-home-mobile375.png`，确认看到的是现有深色/violet 旧样式，作为改造前基线。

- [ ] **Step 5: 不提交**（Task 0 无仓库改动）

---

## Task 1: 依赖、字体、设计令牌与全局样式

**Files:**
- Create: `src/assets/fonts/playfair-display-900.woff2`、`src/assets/fonts/OFL.txt`
- Rewrite: `src/app/styles/main.css`
- Rewrite: `src/public/favicon.svg`
- Modify: `src/index.html`、`src/package.json`（依赖）
- Test: 无单测；验证 = `npm run check` + Playwright 截图 + 字体检查

**Interfaces:**
- Consumes: 无
- Produces: Tailwind 令牌类 `bg-paper / text-ink / text-ink-soft / text-ink-faint / bg-accent / text-accent-ink / bg-highlight / bg-surface / font-display / font-mono / shadow-hard-sm|hard|hard-lg|hard-accent / animate-skeleton`；共享类 `.lift`、`.btn-ink`；`.markdown-body` 全套排版；`@font-face "Playfair Display" weight 900`

- [ ] **Step 1: 新增图标依赖**

```bash
cd src && npm i @phosphor-icons/vue@^2.2.1
```
Expected: `package.json` dependencies 出现 `@phosphor-icons/vue`。

- [ ] **Step 2: 下载并提交字体资源（Google 直连，已验证可达）**

```bash
mkdir -p src/assets/fonts
curl -fL -o src/assets/fonts/playfair-display-900.woff2 \
  "https://fonts.gstatic.com/s/playfairdisplay/v40/nuFvD-vYSZviVYUb_rj3ij__anPXJzDwcbmjWBN2PKfsunDXbtPK-F2qC0s.woff2"
curl -fL -o src/assets/fonts/OFL.txt \
  "https://raw.githubusercontent.com/google/fonts/main/ofl/playfairdisplay/OFL.txt"
ls -l src/assets/fonts/
```
Expected: woff2 约 30–40KB（绝不为 0），OFL.txt 以 `Copyright` 开头。
备选（若 Google 不可达）：`npm i -D @fontsource/playfair-display` → 复制 `node_modules/@fontsource/playfair-display/files/playfair-display-latin-900-normal.woff2` 为 `playfair-display-900.woff2` → `npm uninstall @fontsource/playfair-display`。

- [ ] **Step 3: 重写 `src/app/styles/main.css`**

```css
@import "tailwindcss";

@theme {
  --color-paper: #f7f2e7;
  --color-surface: #ffffff;
  --color-ink: #141414;
  --color-ink-soft: #5c584d;
  --color-ink-faint: #6f6a5c;
  --color-accent: #e8552f;
  --color-accent-ink: #c03a1b;
  --color-highlight: #f5c518;
  --color-info: #2b62cc;
  --color-success: #2fa46a;

  --font-display: "Playfair Display", system-ui, "PingFang SC", "Microsoft YaHei", sans-serif;
  --font-sans: system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
  --font-mono: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;

  --shadow-hard-sm: 3px 3px 0 #141414;
  --shadow-hard: 4px 4px 0 #141414;
  --shadow-hard-lg: 6px 6px 0 #141414;
  --shadow-hard-accent: 4px 4px 0 #e8552f;

  --animate-skeleton: skeleton-pulse 1.4s ease-in-out infinite;

  @keyframes skeleton-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
}

@font-face {
  font-family: "Playfair Display";
  src: url("../../assets/fonts/playfair-display-900.woff2") format("woff2");
  font-weight: 900;
  font-style: normal;
  font-display: swap;
}

@layer base {
  html { color-scheme: light; }
  *, ::before, ::after { border-radius: 0; }
  ::placeholder { color: var(--color-ink-faint); }
  ::selection { background: var(--color-highlight); color: var(--color-ink); }
  :focus-visible { outline: 3px solid var(--color-accent); outline-offset: 2px; }
}

@layer components {
  .lift {
    transition: transform 140ms ease-out, box-shadow 140ms ease-out;
  }
  @media (prefers-reduced-motion: no-preference) {
    .lift:hover { transform: translate(-2px, -2px); }
    .lift:active { transform: translate(2px, 2px); }
  }
  .btn-ink {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    border: 2px solid var(--color-ink);
    background: var(--color-ink);
    color: var(--color-paper);
    padding: 0.5rem 1rem;
    font-size: 0.875rem;
    font-weight: 800;
    box-shadow: var(--shadow-hard-sm);
  }
}

@media (prefers-reduced-motion: reduce) {
  *, ::before, ::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}

.markdown-body {
  font-size: 0.875rem;
  line-height: 1.85;
}
.markdown-body h2 {
  margin: 2rem 0 0.75rem;
  padding-bottom: 0.4rem;
  font-size: 1.125rem;
  font-weight: 800;
  border-bottom: 2px solid var(--color-ink);
  scroll-margin-top: 1rem;
}
.markdown-body h3 {
  margin: 1.5rem 0 0.5rem;
  padding-left: 0.5rem;
  font-size: 0.9rem;
  font-weight: 800;
  border-left: 4px solid var(--color-accent);
  scroll-margin-top: 1rem;
}
.markdown-body p { margin: 0.75rem 0; }
.markdown-body strong {
  background: var(--color-highlight);
  color: var(--color-ink);
  padding: 0 3px;
}
.markdown-body a {
  color: var(--color-accent-ink);
  text-decoration: underline;
  text-decoration-thickness: 2px;
  text-underline-offset: 2px;
}
.markdown-body ul,
.markdown-body ol {
  margin: 0.75rem 0;
  padding-left: 1.6rem;
  list-style: none;
}
.markdown-body ul > li,
.markdown-body ol > li {
  position: relative;
  margin: 0.3rem 0;
}
.markdown-body ul > li::before {
  content: "";
  position: absolute;
  left: -1rem;
  top: 0.7em;
  width: 7px;
  height: 7px;
  background: var(--color-accent);
}
.markdown-body ol { counter-reset: item; }
.markdown-body ol > li { counter-increment: item; }
.markdown-body ol > li::before {
  content: counter(item) ".";
  position: absolute;
  left: -1.6rem;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--color-accent-ink);
}
.markdown-body code {
  background: var(--color-surface);
  border: 1.5px solid var(--color-ink);
  padding: 0.05rem 0.3rem;
  font-family: var(--font-mono);
  font-size: 0.85em;
}
.markdown-body pre {
  margin: 1rem 0;
  padding: 0.75rem 1rem;
  overflow-x: auto;
  background: var(--color-surface);
  border: 2px solid var(--color-ink);
  box-shadow: var(--shadow-hard);
}
.markdown-body pre code { background: transparent; border: 0; padding: 0; }
.markdown-body blockquote {
  margin: 1rem 0;
  padding: 0.4rem 0 0.4rem 0.9rem;
  border-left: 4px solid var(--color-ink);
  background: var(--color-paper);
  color: var(--color-ink-soft);
}
.markdown-body table {
  border-collapse: collapse;
  border: 2px solid var(--color-ink);
}
.markdown-body th {
  background: var(--color-ink);
  color: var(--color-paper);
  font-weight: 800;
  padding: 0.4rem 0.75rem;
  text-align: left;
}
.markdown-body td {
  border-bottom: 1.5px solid var(--color-ink);
  padding: 0.4rem 0.75rem;
}
.markdown-body img { border: 2px solid var(--color-ink); }
```

- [ ] **Step 4: 更新 `src/index.html`**

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="light" />
    <meta name="theme-color" content="#F7F2E7" />
    <title>网页游戏收藏馆</title>
  </head>
  <body class="bg-paper text-ink font-sans antialiased">
    <div id="app"></div>
    <script type="module" src="/app/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 5: 重写 `src/public/favicon.svg`（纸底 + 墨描边 + 墨/黄/红三色方块，无圆角）**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="#F7F2E7"/>
  <rect x="4" y="4" width="56" height="56" fill="none" stroke="#141414" stroke-width="6"/>
  <rect x="12" y="12" width="16" height="16" fill="#141414"/>
  <rect x="34" y="20" width="16" height="16" fill="#F5C518"/>
  <rect x="20" y="38" width="16" height="16" fill="#E8552F"/>
</svg>
```

- [ ] **Step 6: 构建校验**

```bash
cd src && npm run check
```
Expected: 全绿（此时旧组件仍用 neutral 类，不影响编译）。

- [ ] **Step 7: 视觉与字体验证**

```bash
node ~/.config/opencode/skills/playwright-skill/run.js -e "
const b = await chromium.launch({ headless: true });
try {
  const p = await b.newPage();
  await p.goto('http://localhost:5173/');
  await p.evaluate(() => document.fonts.load('900 24px \"Playfair Display\"'));
  console.log('playfair loaded:', await p.evaluate(() => document.fonts.check('900 24px \"Playfair Display\"')));
  console.log('body bg:', await p.evaluate(() => getComputedStyle(document.body).backgroundColor));
} finally { await b.close(); }
"
```
Expected: `playfair loaded: true`；`body bg: rgb(247, 242, 231)`。然后 `read /tmp/poster-home-desktop1280.png`（重跑 Task 0 脚本）确认页面底色已变纸色（组件仍是旧样式，属预期）。

- [ ] **Step 8: Commit**

```bash
cd /Users/xingfend/Documents/MyDocs/project/agent_workspace/webgame-collection
git add src/assets/fonts src/app/styles/main.css src/public/favicon.svg src/index.html src/package.json src/package-lock.json
git commit -m "feat: add poster design tokens, self-hosted Playfair and base layer"
```

---

## Task 2: 封面兜底色板（替换渐变）

**Files:**
- Modify: `src/app/lib/cover.ts`
- Modify: `src/app/lib/cover.test.ts`
- Modify: `src/app/components/GameCover.vue`

**Interfaces:**
- Consumes: Task 1 的令牌类
- Produces: `COVER_COLORS: readonly string[]`（8 色）、`coverColor(id: string): string`、`coverInitial(name: string): string`、`hashString(input: string): number`；`GameCover` props `{ game: GameSummary; ratio?: 'video' | 'hero' }`

- [ ] **Step 1: 先改测试（会失败）**

`src/app/lib/cover.test.ts` 整体替换为：

```ts
import { describe, expect, it } from 'vitest'
import { COVER_COLORS, coverColor, coverInitial, hashString } from './cover'

describe('cover fallback', () => {
  it('coverColor 对同一 id 稳定，且取值属于 8 色表', () => {
    expect(COVER_COLORS).toHaveLength(8)
    expect(coverColor('2048')).toBe(coverColor('2048'))
    expect(COVER_COLORS).toContain(coverColor('2048'))
    expect(COVER_COLORS).toContain(coverColor('hextris'))
  })

  it('不同 id 在色表上有分布', () => {
    const ids = ['2048', 'hextris', 'a-dark-room', 'alpha', 'beta', 'gamma']
    expect(new Set(ids.map(coverColor)).size).toBeGreaterThan(1)
  })

  it('hashString 稳定', () => {
    expect(hashString('2048')).toBe(hashString('2048'))
    expect(hashString('2048')).toBeGreaterThanOrEqual(0)
  })

  it('coverInitial 支持中文、emoji 与空串', () => {
    expect(coverInitial('  黑暗房间 ')).toBe('黑')
    expect(coverInitial('🎮游戏')).toBe('🎮')
    expect(coverInitial('')).toBe('?')
  })
})
```

- [ ] **Step 2: 运行确认失败**

```bash
cd src && npx vitest run app/lib/cover.test.ts
```
Expected: FAIL —— `coverColor` / `COVER_COLORS` 未导出。

- [ ] **Step 3: 实现 `src/app/lib/cover.ts`（删除 `coverGradient`）**

```ts
export const COVER_COLORS = [
  '#2F6DE0',
  '#C03A1B',
  '#1F7A4D',
  '#6B4FD8',
  '#B35C00',
  '#0F6E6E',
  '#A3256B',
  '#141414'
] as const

export function hashString(input: string): number {
  let hash = 0
  for (const char of input) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) | 0
  return Math.abs(hash)
}

export function coverColor(id: string): string {
  return COVER_COLORS[hashString(id) % COVER_COLORS.length]
}

export function coverInitial(name: string): string {
  return [...name.trim()][0] ?? '?'
}
```

- [ ] **Step 4: 运行确认通过**

```bash
cd src && npx vitest run app/lib/cover.test.ts
```
Expected: PASS（4 个用例）。

- [ ] **Step 5: 重写 `src/app/components/GameCover.vue`**

```vue
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { GameSummary } from '@/data/types'
import { coverColor, coverInitial } from '@/lib/cover'

const props = withDefaults(defineProps<{ game: GameSummary; ratio?: 'video' | 'hero' }>(), {
  ratio: 'video'
})
const failed = ref(false)

watch(() => props.game.cover, () => { failed.value = false })

const color = computed(() => coverColor(props.game.id))
const initial = computed(() => coverInitial(props.game.name))
const ratioClass = computed(() => (props.ratio === 'hero' ? 'aspect-[16/7]' : 'aspect-video'))
</script>

<template>
  <div class="w-full overflow-hidden" :class="ratioClass">
    <img
      v-if="game.cover && !failed"
      :src="game.cover"
      :alt="game.name"
      loading="lazy"
      class="h-full w-full object-cover"
      @error="failed = true"
    />
    <div
      v-else
      class="flex h-full w-full select-none items-center justify-center border-b-2 border-ink font-display text-4xl font-black text-white"
      :style="{ background: color }"
    >
      {{ initial }}
    </div>
  </div>
</template>
```

- [ ] **Step 6: 全部测试 + 类型检查**

```bash
cd src && npm run check
```
Expected: 全绿。

- [ ] **Step 7: 视觉验证**

```bash
node ~/.config/opencode/skills/playwright-skill/run.js /tmp/playwright-poster-check.js
```
Expected: `consoleErrors` 为空；`read /tmp/poster-home-desktop1280.png` 可见无封面游戏的兜底块为纯色 + 首字，无渐变。用 `-e` 抽查规则：

```bash
node ~/.config/opencode/skills/playwright-skill/run.js -e "
const b = await chromium.launch({ headless: true });
try {
  const p = await b.newPage();
  await p.goto('http://localhost:5173/');
  await p.waitForFunction(() => !document.querySelector('[aria-busy=\"true\"]'));
  const bad = await p.evaluate(() => [...document.querySelectorAll('*')].some(el => getComputedStyle(el).backgroundImage.includes('gradient')));
  console.log('has gradient:', bad);
} finally { await b.close(); }
"
```
Expected: `has gradient: false`。

- [ ] **Step 8: Commit**

```bash
git add src/app/lib/cover.ts src/app/lib/cover.test.ts src/app/components/GameCover.vue
git commit -m "feat: replace cover gradient with flat color palette"
```

---

## Task 3: 筛选计数纯函数

**Files:**
- Modify: `src/app/lib/filter.ts`（只新增，不改既有函数）
- Modify: `src/app/lib/filter.test.ts`（追加 describe 块）

**Interfaces:**
- Consumes: 既有 `GAME_TYPES`、`durationBucket`
- Produces: `countByType(games: GameSummary[]): Record<GameType, number>`（含 0 计数）；`countByDuration(games: GameSummary[]): Record<DurationBucket, number>`；`countByTag(games: GameSummary[], limit = 16): Array<[string, number]>`（次数降序，同次数 `localeCompare`）

- [ ] **Step 1: 在 `src/app/lib/filter.test.ts` 末尾追加失败测试（两个 import 加到文件顶部已有 import 之后）**

```ts
// 追加到 src/app/lib/filter.test.ts 末尾；并把下面两个 import 合并到文件顶部
import { countByDuration, countByTag, countByType } from './filter'
import { GAME_TYPES } from '@/data/types'

describe('countByType / countByDuration / countByTag', () => {
  it('countByType 覆盖全部类型且 0 计数保留', () => {
    const counts = countByType(games)
    expect(Object.keys(counts)).toHaveLength(GAME_TYPES.length)
    expect(counts.puzzle).toBe(1)
    expect(counts.idle).toBe(1)
    expect(counts.action).toBe(1)
    expect(counts.music).toBe(0)
  })

  it('countByDuration 按 max 分桶统计', () => {
    expect(countByDuration(games)).toEqual({ short: 1, mid: 1, long: 1 })
  })

  it('countByTag 按出现次数降序，默认取前 16', () => {
    const counts = countByTag(games)
    expect(counts[0]).toEqual(['数字', 2])
    expect(counts.map(([, n]) => n)).toEqual([2, 1, 1])
    const many = Array.from({ length: 20 }, (_, i) => game({ id: `g${i}`, tags: [`tag-${String(i).padStart(2, '0')}`] }))
    expect(countByTag(many)).toHaveLength(16)
  })
})
```
（`games` 与 `game()` 复用该文件已有的夹具：alpha=解谜/max 10、beta=放置/max 300、gamma=动作/max 4。）

- [ ] **Step 2: 运行确认失败**

```bash
cd src && npx vitest run app/lib/filter.test.ts
```
Expected: FAIL —— `countByType` 等未导出。

- [ ] **Step 3: 在 `src/app/lib/filter.ts` 末尾追加实现**

```ts
export function countByType(games: GameSummary[]): Record<GameType, number> {
  const counts = Object.fromEntries(GAME_TYPES.map((type) => [type, 0])) as Record<GameType, number>
  for (const game of games) counts[game.type] += 1
  return counts
}

export function countByDuration(games: GameSummary[]): Record<DurationBucket, number> {
  const counts: Record<DurationBucket, number> = { short: 0, mid: 0, long: 0 }
  for (const game of games) counts[durationBucket(game)] += 1
  return counts
}

export function countByTag(games: GameSummary[], limit = 16): Array<[string, number]> {
  const counts = new Map<string, number>()
  for (const game of games) for (const tag of game.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit)
}
```

- [ ] **Step 4: 运行确认通过**

```bash
cd src && npx vitest run app/lib/filter.test.ts
```
Expected: PASS（含既有 parse/toQuery/filterGames 用例）。

- [ ] **Step 5: 全量检查 + Commit**

```bash
cd src && npm run check
cd .. && git add src/app/lib/filter.ts src/app/lib/filter.test.ts
git commit -m "feat: add catalog filter count helpers"
```

---

## Task 4: 应用外壳（页头 / 页脚 / App.vue）

**Files:**
- Create: `src/app/components/AppHeader.vue`、`src/app/components/AppFooter.vue`
- Rewrite: `src/app/App.vue`

**Interfaces:**
- Consumes: `repo.listGames()` / `repo.listDocs()`（仓库已按 Promise 缓存）、`useAsync`、Task 1 令牌
- Produces: 全站页头（logo `bg-ink text-paper`、导航「游戏」精确高亮 /「文档」前缀高亮、右侧贴纸 `hidden sm:inline-block`）与页脚；`App.vue` 只保留骨架 + 挂载

- [ ] **Step 1: 新建 `src/app/components/AppHeader.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { repo, type DocMeta, type GameSummary } from '@/data'
import { useAsync } from '@/composables/useAsync'

const route = useRoute()
const onCatalog = computed(() => route.name === 'home')
const onDocs = computed(() => route.name === 'docs' || route.name === 'doc')

const { data: games } = useAsync<GameSummary[] | null>(
  () => (onCatalog.value ? repo.listGames() : Promise.resolve(null)),
  [onCatalog]
)
const { data: docs } = useAsync<DocMeta[] | null>(
  () => (onDocs.value ? repo.listDocs() : Promise.resolve(null)),
  [onDocs]
)

const sticker = computed(() => {
  if (onCatalog.value && games.value) return `共 ${games.value.length} 款`
  if (onDocs.value && docs.value) return `共 ${docs.value.length} 篇`
  return 'STATIC WEB GAMES'
})
</script>

<template>
  <header class="border-b-[3px] border-ink bg-paper">
    <div class="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-4">
      <RouterLink to="/" class="bg-ink px-2 py-1 text-sm font-extrabold tracking-[0.04em] text-paper">
        网页游戏收藏馆
      </RouterLink>
      <nav class="flex gap-4 text-sm font-bold">
        <RouterLink
          to="/"
          class="border-b-[3px] border-b-transparent pb-0.5 text-ink-soft [&.router-link-exact-active]:border-b-accent-ink [&.router-link-exact-active]:text-accent-ink"
        >游戏</RouterLink>
        <RouterLink
          to="/docs"
          class="border-b-[3px] border-b-transparent pb-0.5 text-ink-soft [&.router-link-active]:border-b-accent-ink [&.router-link-active]:text-accent-ink"
        >文档</RouterLink>
      </nav>
      <span
        class="ml-auto hidden border-2 border-ink bg-highlight px-2 py-0.5 font-mono text-[0.6875rem] tracking-[0.05em] sm:inline-block"
      >{{ sticker }}</span>
    </div>
  </header>
</template>
```

- [ ] **Step 2: 新建 `src/app/components/AppFooter.vue`**

```vue
<template>
  <footer class="border-t-[3px] border-ink">
    <div class="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-4">
      <span class="font-mono text-[0.6875rem] tracking-[0.18em]">STATIC WEB GAMES</span>
      <span class="text-xs text-ink-soft">数据来自社区 PR 收录，游戏版权归原作者所有。</span>
    </div>
  </footer>
</template>
```

- [ ] **Step 3: 重写 `src/app/App.vue`**

```vue
<script setup lang="ts">
import { RouterView } from 'vue-router'
import AppHeader from '@/components/AppHeader.vue'
import AppFooter from '@/components/AppFooter.vue'
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <AppHeader />
    <main class="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
      <RouterView />
    </main>
    <AppFooter />
  </div>
</template>
```

- [ ] **Step 4: 检查**

```bash
cd src && npm run check
```
Expected: 全绿。

- [ ] **Step 5: 视觉验证（页头贴纸计数与路由切换）**

```bash
node ~/.config/opencode/skills/playwright-skill/run.js -e "
const b = await chromium.launch({ headless: true });
try {
  const p = await b.newPage();
  await p.goto('http://localhost:5173/');
  await p.waitForFunction(() => !document.querySelector('[aria-busy=\"true\"]'));
  console.log('home sticker:', await p.locator('header span').last().innerText());
  await p.goto('http://localhost:5173/docs');
  await p.waitForFunction(() => !document.querySelector('[aria-busy=\"true\"]'));
  console.log('docs sticker:', await p.locator('header span').last().innerText());
  await p.goto('http://localhost:5173/definitely-missing');
  console.log('404 sticker:', await p.locator('header span').last().innerText());
  await p.setViewportSize({ width: 375, height: 812 });
  await p.goto('http://localhost:5173/');
  console.log('sticker visible@375:', await p.locator('header span').last().isVisible());
} finally { await b.close(); }
"
```
Expected: `共 3 款` / `共 2 篇` / `STATIC WEB GAMES` / `false`（3 款、2 篇以实际数据为准；`src/games/` 有 3 个 json、`src/docs/` 有 2 个 md）。再 `read /tmp/poster-home-desktop1280.png` 与 `poster-mobile375.png` 核对页头页脚样式。

- [ ] **Step 6: Commit**

```bash
git add src/app/App.vue src/app/components/AppHeader.vue src/app/components/AppFooter.vue
git commit -m "feat: rebuild app shell with poster header and footer"
```

---

## Task 5: 游戏卡片

**Files:**
- Rewrite: `src/app/components/GameCard.vue`

**Interfaces:**
- Consumes: `GameCover`（Task 2）、`GAME_TYPE_LABELS`、`durationText`、`.lift`、`shadow-hard*`
- Produces: 目录网格卡片（16:9 封面 + 旋转类型贴纸 + 名称 + 两行简介 + 时长/标签片；整卡 `RouterLink`）

- [ ] **Step 1: 重写 `src/app/components/GameCard.vue`**

```vue
<script setup lang="ts">
import { RouterLink } from 'vue-router'
import type { GameSummary } from '@/data/types'
import { GAME_TYPE_LABELS, durationText } from '@/lib/labels'
import GameCover from './GameCover.vue'

defineProps<{ game: GameSummary }>()
</script>

<template>
  <RouterLink
    :to="`/games/${game.id}`"
    class="lift block border-2 border-ink bg-surface shadow-hard hover:shadow-hard-lg active:shadow-none"
  >
    <div class="relative">
      <GameCover :game="game" />
      <span
        class="absolute left-2 top-2 -rotate-3 border-2 border-ink bg-surface px-2 py-0.5 font-mono text-[0.625rem] font-bold tracking-[0.05em]"
      >{{ GAME_TYPE_LABELS[game.type] }}</span>
    </div>
    <div class="space-y-2 p-3">
      <h2 class="truncate font-display text-[0.875rem] font-black">{{ game.name }}</h2>
      <p class="line-clamp-2 text-xs leading-relaxed text-ink-soft">{{ game.description }}</p>
      <div class="flex flex-wrap items-center gap-1.5">
        <span class="border-[1.5px] border-ink px-1.5 py-0.5 font-mono text-[0.625rem]">
          {{ durationText(game.durationMinutes) }}
        </span>
        <span
          v-for="tag in game.tags"
          :key="tag"
          class="border-[1.5px] border-ink px-1.5 py-0.5 font-mono text-[0.625rem]"
        >{{ tag }}</span>
      </div>
    </div>
  </RouterLink>
</template>
```

- [ ] **Step 2: 检查**

```bash
cd src && npm run check
```
Expected: 全绿。

- [ ] **Step 3: 视觉验证（悬停抬起 + 按下压入 + 无布局漂移）**

```bash
node ~/.config/opencode/skills/playwright-skill/run.js -e "
const b = await chromium.launch({ headless: true });
try {
  const p = await b.newPage();
  await p.setViewportSize({ width: 1280, height: 900 });
  await p.goto('http://localhost:5173/');
  const card = p.locator('a[href^=\"/games/\"]').first();
  await card.waitFor();
  const before = await card.boundingBox();
  await card.hover();
  await p.waitForTimeout(300);
  const after = await card.boundingBox();
  console.log('hover shift:', { dx: after.x - before.x, dy: after.y - before.y });
  await p.mouse.down();
  await p.waitForTimeout(300);
  console.log('active transform:', await card.evaluate((el) => getComputedStyle(el).transform));
  await p.mouse.up();
} finally { await b.close(); }
"
```
Expected: `hover shift: { dx: -2, dy: -2 }`（位移不改变其他卡片布局，`boundingBox` 只动自身）；按下时 `transform` 为 `matrix(1, 0, 0, 1, 2, 2)`。再 `read /tmp/poster-home-desktop1280.png` 核对贴纸、硬阴影与直角。

- [ ] **Step 4: Commit**

```bash
git add src/app/components/GameCard.vue
git commit -m "feat: rebuild game card with flat poster style"
```

---

## Task 6: 状态组件（骨架 / 错误）

**Files:**
- Rewrite: `src/app/components/StatePanel.vue`

**Interfaces:**
- Consumes: `animate-skeleton`、`.btn-ink`、`.lift`、`bg-[#EFE9DA]`、`PhWarningCircle`
- Produces: props `{ loading: boolean; error: Error | null }`、emit `retry`；loading 渲染 3 张骨架卡（容器 `aria-busy="true"` + 读屏「加载中」），error 渲染白面板错误条（`role="alert"`，含 `PhWarningCircle`）

- [ ] **Step 1: 重写 `src/app/components/StatePanel.vue`**

```vue
<script setup lang="ts">
import { PhWarningCircle } from '@phosphor-icons/vue'

defineProps<{ loading: boolean; error: Error | null }>()
defineEmits<{ retry: [] }>()
</script>

<template>
  <div v-if="loading" aria-busy="true">
    <span class="sr-only">加载中</span>
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div
        v-for="n in 3"
        :key="n"
        class="animate-skeleton border-2 border-ink bg-surface shadow-hard"
      >
        <div class="aspect-video border-b-2 border-ink bg-[#EFE9DA]" />
        <div class="space-y-3 p-4">
          <div class="h-4 w-2/3 bg-[#EFE9DA]" />
          <div class="h-3 w-full bg-[#EFE9DA]" />
          <div class="h-3 w-1/2 bg-[#EFE9DA]" />
        </div>
      </div>
    </div>
  </div>

  <div v-else-if="error" role="alert" class="border-2 border-ink bg-surface p-6 shadow-hard">
    <p class="inline-flex items-center gap-1.5 bg-accent-ink px-2 py-0.5 font-mono text-[0.6875rem] font-bold tracking-[0.05em] text-paper">
      <PhWarningCircle :size="14" weight="bold" aria-hidden="true" />
      ERROR · 加载失败
    </p>
    <p class="mt-3 font-mono text-xs text-ink-soft">{{ error.message }}</p>
    <button type="button" class="btn-ink lift mt-4 hover:shadow-hard active:shadow-none" @click="$emit('retry')">
      重试
    </button>
  </div>

  <slot v-else />
</template>
```

- [ ] **Step 2: 检查**

```bash
cd src && npm run check
```
Expected: 全绿。

- [ ] **Step 3: 视觉验证（拦截网络制造骨架与错误态）**

```bash
node ~/.config/opencode/skills/playwright-skill/run.js -e "
const b = await chromium.launch({ headless: true });
try {
  const p = await b.newPage();
  await p.route('**/data/index.json', async (route) => { await new Promise((r) => setTimeout(r, 1200)); await route.continue(); });
  await p.goto('http://localhost:5173/');
  console.log('skeleton count:', await p.locator('[aria-busy=\"true\"] .animate-skeleton').count());
  await p.screenshot({ path: '/tmp/poster-loading.png' });
  await p.unroute('**/data/index.json');
  await p.route('**/data/index.json', (route) => route.abort('failed'));
  await p.goto('http://localhost:5173/');
  await p.locator('[role=alert]').waitFor();
  console.log('error panel:', (await p.locator('[role=alert]').innerText()).split('\n')[0]);
  await p.screenshot({ path: '/tmp/poster-error.png' });
} finally { await b.close(); }
"
```
Expected: `skeleton count: 3`；`error panel: ERROR · 加载失败`。`read /tmp/poster-loading.png` 与 `/tmp/poster-error.png` 核对样式。

- [ ] **Step 4: Commit**

```bash
git add src/app/components/StatePanel.vue
git commit -m "feat: rebuild loading skeleton and error panel"
```

---

## Task 7: 目录页（侧栏 + 结果行 + 移动抽屉）

**Files:**
- Create: `src/app/components/FilterSidebar.vue`、`src/app/components/FilterDrawer.vue`、`src/app/components/ResultMeta.vue`
- Rewrite: `src/app/views/HomeView.vue`
- Delete: `src/app/components/GameFilters.vue`

**Interfaces:**
- Consumes: `filterGames`、`DEFAULT_FILTER`、`countByType/countByDuration/countByTag`（Task 3）、`GameCard`（Task 5）、`StatePanel`（Task 6）、`PhMagnifyingGlass/PhFunnelSimple/PhX/PhArrowsDownUp`
- Produces:
  - `FilterSidebar` props `{ games: GameSummary[] }`：类型 / 时长 / 标签三节，各含「全部」行；选中行 `bg-highlight border-2 border-ink font-bold`；底部「重置筛选」→ `update(DEFAULT_FILTER)`；不含外框背景（父容器决定 `bg-surface` 或 `bg-paper`）
  - `FilterDrawer` props `{ open: boolean; games: GameSummary[]; count: number }`、emit `update:open`；原生 `<dialog>` + `showModal()`
  - `ResultMeta` props `{ count: number }`、emit `openFilters`；结果数 `aria-live="polite"`、排序 `<select>`、`lg:hidden` 筛选按钮带生效条件数角标

- [ ] **Step 1: 新建 `src/app/components/FilterSidebar.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { GameSummary, GameType } from '@/data/types'
import { GAME_TYPES } from '@/data/types'
import { GAME_TYPE_LABELS } from '@/lib/labels'
import { DEFAULT_FILTER, countByDuration, countByTag, countByType, type DurationBucket } from '@/lib/filter'
import { useFilterState } from '@/composables/useFilterState'

const props = defineProps<{ games: GameSummary[] }>()
const { state, update } = useFilterState()

const typeCounts = computed(() => countByType(props.games))
const durationCounts = computed(() => countByDuration(props.games))
const tagCounts = computed(() => countByTag(props.games))

interface Row<K extends string> {
  key: K
  label: string
  count: number
}

const typeRows = computed<Array<Row<GameType | 'all'>>>(() => [
  { key: 'all', label: '全部', count: props.games.length },
  ...GAME_TYPES.filter((type) => typeCounts.value[type] > 0).map((type) => ({
    key: type as GameType | 'all',
    label: GAME_TYPE_LABELS[type],
    count: typeCounts.value[type]
  }))
])

const durationRows = computed<Array<Row<DurationBucket | 'all'>>>(() => {
  const options: Array<{ value: DurationBucket | 'all'; label: string }> = [
    { value: 'all', label: '全部时长' },
    { value: 'short', label: '≤5 分钟' },
    { value: 'mid', label: '5–30 分钟' },
    { value: 'long', label: '>30 分钟' }
  ]
  return options
    .filter((option) => option.value === 'all' || durationCounts.value[option.value as DurationBucket] > 0)
    .map((option) => ({
      key: option.value,
      label: option.label,
      count: option.value === 'all' ? props.games.length : durationCounts.value[option.value as DurationBucket]
    }))
})

function toggleTag(tag: string): void {
  const tags = state.value.tags.includes(tag)
    ? state.value.tags.filter((t) => t !== tag)
    : [...state.value.tags, tag]
  update({ tags })
}
</script>

<template>
  <div class="space-y-6">
    <section>
      <h2 class="text-[0.625rem] font-extrabold tracking-[0.22em] text-accent-ink">类型</h2>
      <ul class="mt-2">
        <li
          v-for="row in typeRows"
          :key="row.key"
          class="border-b-[1.5px] border-dashed"
          :class="state.type === row.key ? 'border-transparent' : 'border-ink'"
        >
          <button
            type="button"
            class="flex min-h-11 w-full items-center justify-between gap-2 border-2 px-2 text-left text-[0.8125rem] lg:min-h-9"
            :class="state.type === row.key ? 'border-ink bg-highlight font-bold' : 'border-transparent hover:bg-paper'"
            @click="update({ type: row.key })"
          >
            <span class="truncate">{{ row.label }}</span>
            <span class="font-mono text-[0.6875rem]">{{ row.count }}</span>
          </button>
        </li>
      </ul>
    </section>

    <section>
      <h2 class="text-[0.625rem] font-extrabold tracking-[0.22em] text-accent-ink">时长</h2>
      <ul class="mt-2">
        <li
          v-for="row in durationRows"
          :key="row.key"
          class="border-b-[1.5px] border-dashed"
          :class="state.dur === row.key ? 'border-transparent' : 'border-ink'"
        >
          <button
            type="button"
            class="flex min-h-11 w-full items-center justify-between gap-2 border-2 px-2 text-left text-[0.8125rem] lg:min-h-9"
            :class="state.dur === row.key ? 'border-ink bg-highlight font-bold' : 'border-transparent hover:bg-paper'"
            @click="update({ dur: row.key })"
          >
            <span class="truncate">{{ row.label }}</span>
            <span class="font-mono text-[0.6875rem]">{{ row.count }}</span>
          </button>
        </li>
      </ul>
    </section>

    <section v-if="tagCounts.length">
      <h2 class="text-[0.625rem] font-extrabold tracking-[0.22em] text-accent-ink">标签</h2>
      <ul class="mt-2">
        <li
          class="border-b-[1.5px] border-dashed"
          :class="state.tags.length === 0 ? 'border-transparent' : 'border-ink'"
        >
          <button
            type="button"
            class="flex min-h-11 w-full items-center justify-between gap-2 border-2 px-2 text-left text-[0.8125rem] lg:min-h-9"
            :class="state.tags.length === 0 ? 'border-ink bg-highlight font-bold' : 'border-transparent hover:bg-paper'"
            @click="update({ tags: [] })"
          >
            <span class="truncate">全部</span>
            <span class="font-mono text-[0.6875rem]">{{ games.length }}</span>
          </button>
        </li>
        <li
          v-for="[tag, tagCount] in tagCounts"
          :key="tag"
          class="border-b-[1.5px] border-dashed"
          :class="state.tags.includes(tag) ? 'border-transparent' : 'border-ink'"
        >
          <button
            type="button"
            class="flex min-h-11 w-full items-center justify-between gap-2 border-2 px-2 text-left text-[0.8125rem] lg:min-h-9"
            :class="state.tags.includes(tag) ? 'border-ink bg-highlight font-bold' : 'border-transparent hover:bg-paper'"
            @click="toggleTag(tag)"
          >
            <span class="truncate">{{ tag }}</span>
            <span class="font-mono text-[0.6875rem]">{{ tagCount }}</span>
          </button>
        </li>
      </ul>
    </section>

    <button
      type="button"
      class="lift w-full border-2 border-ink bg-surface px-3 py-2 text-sm font-extrabold shadow-hard-sm hover:shadow-hard active:shadow-none"
      @click="update(DEFAULT_FILTER)"
    >重置筛选</button>
  </div>
</template>
```

- [ ] **Step 2: 新建 `src/app/components/FilterDrawer.vue`**

```vue
<script setup lang="ts">
import { ref, watch } from 'vue'
import { PhX } from '@phosphor-icons/vue'
import type { GameSummary } from '@/data/types'
import FilterSidebar from './FilterSidebar.vue'

const props = defineProps<{ open: boolean; games: GameSummary[]; count: number }>()
const emit = defineEmits<{ 'update:open': [boolean] }>()

const dialog = ref<HTMLDialogElement | null>(null)

watch(
  () => props.open,
  (open) => {
    const el = dialog.value
    if (!el) return
    if (open && !el.open) el.showModal()
    else if (!open && el.open) el.close()
  }
)

function onClose(): void {
  emit('update:open', false)
}
</script>

<template>
  <dialog
    ref="dialog"
    class="m-0 mt-auto max-h-[85vh] w-full max-w-none overflow-y-auto border-t-[3px] border-ink bg-paper backdrop:bg-ink/60"
    @close="onClose"
  >
    <div class="flex items-center justify-between border-b-[1.5px] border-ink px-4 py-3">
      <span class="text-[0.625rem] font-extrabold tracking-[0.22em] text-accent-ink">筛选</span>
      <button
        type="button"
        class="border-2 border-ink bg-surface p-1.5"
        aria-label="关闭筛选"
        @click="dialog?.close()"
      >
        <PhX :size="16" weight="bold" aria-hidden="true" />
      </button>
    </div>
    <div class="p-4">
      <FilterSidebar :games="games" />
    </div>
    <div class="border-t-[1.5px] border-ink p-4">
      <button
        type="button"
        class="btn-ink lift w-full hover:shadow-hard active:shadow-none"
        @click="dialog?.close()"
      >查看 {{ count }} 款结果</button>
    </div>
  </dialog>
</template>
```

- [ ] **Step 3: 新建 `src/app/components/ResultMeta.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { PhArrowsDownUp, PhFunnelSimple } from '@phosphor-icons/vue'
import type { SortKey } from '@/lib/filter'
import { useFilterState } from '@/composables/useFilterState'

defineProps<{ count: number }>()
defineEmits<{ openFilters: [] }>()

const { state, update } = useFilterState()
const activeCount = computed(
  () => (state.value.type !== 'all' ? 1 : 0) + (state.value.dur !== 'all' ? 1 : 0) + state.value.tags.length
)
</script>

<template>
  <div class="flex items-center gap-3">
    <p class="shrink-0 text-[0.9375rem] font-extrabold" aria-live="polite">{{ count }} 款游戏</p>
    <div class="h-0 flex-1 border-t-2 border-ink" aria-hidden="true" />
    <PhArrowsDownUp :size="14" weight="bold" aria-hidden="true" class="hidden shrink-0 text-ink-soft sm:block" />
    <label for="catalog-sort" class="sr-only">排序</label>
    <select
      id="catalog-sort"
      :value="state.sort"
      class="shrink-0 appearance-none border-2 border-ink bg-surface px-2 py-1.5 font-mono text-xs"
      @change="update({ sort: ($event.target as HTMLSelectElement).value as SortKey })"
    >
      <option value="new">最新收录</option>
      <option value="name">名称</option>
      <option value="duration">时长（短到长）</option>
    </select>
    <button
      type="button"
      class="lift flex shrink-0 items-center gap-1.5 border-2 border-ink bg-surface px-3 py-2 text-xs font-extrabold shadow-hard-sm hover:shadow-hard active:shadow-none lg:hidden"
      @click="$emit('openFilters')"
    >
      <PhFunnelSimple :size="14" weight="bold" aria-hidden="true" />
      筛选
      <span
        v-if="activeCount"
        class="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center bg-accent px-1 font-mono text-[0.625rem] text-ink"
      >{{ activeCount }}</span>
    </button>
  </div>
</template>
```

- [ ] **Step 4: 重写 `src/app/views/HomeView.vue`**

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import { PhMagnifyingGlass } from '@phosphor-icons/vue'
import { repo, type GameSummary } from '@/data'
import { useAsync } from '@/composables/useAsync'
import { DEFAULT_FILTER, filterGames } from '@/lib/filter'
import { useFilterState } from '@/composables/useFilterState'
import GameCard from '@/components/GameCard.vue'
import FilterSidebar from '@/components/FilterSidebar.vue'
import FilterDrawer from '@/components/FilterDrawer.vue'
import ResultMeta from '@/components/ResultMeta.vue'
import StatePanel from '@/components/StatePanel.vue'

const { data: games, error, loading, reload } = useAsync<GameSummary[]>(() => repo.listGames())
const { state, update } = useFilterState()
const visible = computed(() => filterGames(games.value ?? [], state.value))
const drawerOpen = ref(false)
</script>

<template>
  <StatePanel :loading="loading" :error="error" @retry="reload">
    <div class="flex items-start gap-6">
      <aside class="hidden w-[215px] shrink-0 self-stretch border-r-[3px] border-ink bg-surface p-4 lg:block">
        <FilterSidebar :games="games ?? []" />
      </aside>

      <div class="min-w-0 flex-1 space-y-4">
        <div class="relative">
          <label for="game-search" class="sr-only">搜索游戏</label>
          <PhMagnifyingGlass
            :size="16"
            weight="bold"
            aria-hidden="true"
            class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
          />
          <input
            id="game-search"
            :value="state.q"
            type="search"
            placeholder="搜索游戏名、简介、作者或标签…"
            class="w-full appearance-none border-2 border-ink bg-surface py-2.5 pl-10 pr-3 text-sm shadow-hard-sm"
            @input="update({ q: ($event.target as HTMLInputElement).value })"
          />
        </div>

        <ResultMeta :count="visible.length" @open-filters="drawerOpen = true" />

        <div v-if="visible.length" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <GameCard v-for="game in visible" :key="game.id" :game="game" />
        </div>
        <div v-else class="border-2 border-dashed border-ink p-10 text-center">
          <p class="font-mono text-[0.6875rem] tracking-[0.05em] text-ink-soft">NO MATCH · 0 款</p>
          <p class="mt-3 text-sm text-ink-soft">
            {{ (games?.length ?? 0) > 0 ? '没有匹配的游戏，试试调整筛选条件。' : '还没有收录游戏。' }}
          </p>
          <button
            v-if="(games?.length ?? 0) > 0"
            type="button"
            class="btn-ink lift mt-5 hover:shadow-hard active:shadow-none"
            @click="update(DEFAULT_FILTER)"
          >重置筛选</button>
        </div>
      </div>
    </div>

    <FilterDrawer v-model:open="drawerOpen" :games="games ?? []" :count="visible.length" />
  </StatePanel>
</template>
```

- [ ] **Step 5: 删除旧组件**

```bash
git rm src/app/components/GameFilters.vue
```

- [ ] **Step 6: 检查**

```bash
cd src && npm run check
```
Expected: 全绿（若 `GameFilters` 仍有引用会在此暴露）。

- [ ] **Step 7: 视觉与交互验证**

```bash
node ~/.config/opencode/skills/playwright-skill/run.js -e "
const b = await chromium.launch({ headless: true });
try {
  const p = await b.newPage();
  await p.setViewportSize({ width: 1280, height: 900 });
  await p.goto('http://localhost:5173/');
  await p.waitForFunction(() => !document.querySelector('[aria-busy=\"true\"]'));
  const total = await p.locator('a[href^=\"/games/\"]').count();
  await p.getByRole('button', { name: /^解谜/ }).click();
  await p.waitForTimeout(150);
  console.log('url:', p.url());
  console.log('filtered cards:', await p.locator('a[href^=\"/games/\"]').count(), 'of', total);
  console.log('result text:', await p.locator('[aria-live=polite]').innerText());
  await p.getByRole('button', { name: '重置筛选' }).click();
  await p.waitForTimeout(150);
  console.log('after reset url:', p.url());

  await p.setViewportSize({ width: 375, height: 812 });
  await p.goto('http://localhost:5173/');
  await p.waitForFunction(() => !document.querySelector('[aria-busy=\"true\"]'));
  const trigger = p.getByRole('button', { name: /筛选/ });
  await trigger.click();
  console.log('dialog open:', await p.locator('dialog[open]').count());
  console.log('drawer rows:', await p.locator('dialog [class*=min-h]').count());
  await p.keyboard.press('Escape');
  await p.waitForTimeout(150);
  console.log('dialog closed:', await p.locator('dialog[open]').count());
  console.log('focus back:', await p.evaluate(() => document.activeElement?.textContent?.trim()));
} finally { await b.close(); }
"
```
Expected: 点击类型后 URL 含 `type=puzzle`，卡片数减少且 `[aria-live]` 文本同步；`重置筛选` 后 URL 回到 `/`；375px 下 dialog 打开、Escape 关闭、焦点回到「筛选」按钮。再 `read /tmp/poster-home-desktop1280.png`（重跑 Task 0 脚本）与 `/tmp/poster-home-mobile375.png` 核对侧栏（1280 可见、375 隐藏）与抽屉样式。

- [ ] **Step 8: Commit**

```bash
git add -A src/app/components src/app/views/HomeView.vue
git commit -m "feat: rebuild catalog page with filter sidebar and mobile drawer"
```

---

## Task 8: 文档页

**Files:**
- Rewrite: `src/app/components/DocSidebar.vue`、`src/app/components/DocToc.vue`
- Rewrite: `src/app/views/DocsView.vue`

**Interfaces:**
- Consumes: `DocMeta`、`TocItem`、`.markdown-body`（Task 1）
- Produces: `DocSidebar` props `{ docs: DocMeta[]; activeSlug: string; variant?: 'list' | 'tabs' }`（默认 `'list'`，`'tabs'` 为移动横向滑动标签）；`DocToc` props `{ items: TocItem[] }`（3px 左标，当前节红）；三栏布局：列表 200px / 正文 max 640px / 本页目录 170px

- [ ] **Step 1: 重写 `src/app/components/DocSidebar.vue`**

```vue
<script setup lang="ts">
import { RouterLink } from 'vue-router'
import type { DocMeta } from '@/data/types'

withDefaults(defineProps<{ docs: DocMeta[]; activeSlug: string; variant?: 'list' | 'tabs' }>(), {
  variant: 'list'
})
</script>

<template>
  <nav v-if="variant === 'list'" aria-label="文档列表" class="flex flex-col gap-1">
    <RouterLink
      v-for="doc in docs"
      :key="doc.slug"
      :to="`/docs/${doc.slug}`"
      class="flex items-baseline gap-2 border-2 border-transparent px-2 py-1.5"
      :class="doc.slug === activeSlug ? 'border-ink bg-highlight font-bold' : 'hover:bg-surface'"
    >
      <span class="font-mono text-[0.625rem]">{{ String(doc.order).padStart(2, '0') }}</span>
      <span class="text-sm">{{ doc.title }}</span>
    </RouterLink>
  </nav>

  <nav v-else aria-label="文档列表" class="flex gap-2 overflow-x-auto pb-1">
    <RouterLink
      v-for="doc in docs"
      :key="doc.slug"
      :to="`/docs/${doc.slug}`"
      class="shrink-0 border-2 border-ink px-3 py-2 font-mono text-xs"
      :class="doc.slug === activeSlug ? 'bg-highlight font-bold' : 'bg-surface'"
    >{{ doc.title }}</RouterLink>
  </nav>
</template>
```

- [ ] **Step 2: 重写 `src/app/components/DocToc.vue`（脚本部分保持不变，只换模板类）**

```vue
<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { TocItem } from '@/lib/markdown'

const props = defineProps<{ items: TocItem[] }>()
const activeId = ref('')
let observer: IntersectionObserver | undefined

function observe(): void {
  observer?.disconnect()
  const headings = props.items
    .map((item) => document.getElementById(item.id))
    .filter((el): el is HTMLElement => el !== null)
  if (!headings.length) return
  observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
      if (visible[0]) activeId.value = visible[0].target.id
    },
    { rootMargin: '0px 0px -70% 0px' }
  )
  for (const heading of headings) observer.observe(heading)
}

onMounted(() => void nextTick(observe))
watch(() => props.items, () => void nextTick(observe))
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <nav v-if="items.length" class="sticky top-6 border-l-[3px] border-ink text-xs" aria-label="本页目录">
    <p class="pb-2 pl-3 text-[0.625rem] font-extrabold tracking-[0.2em] text-ink-soft">本页目录</p>
    <a
      v-for="item in items"
      :key="item.id"
      :href="`#${item.id}`"
      class="-ml-[3px] block border-l-[3px] py-1"
      :class="[
        item.level === 3 ? 'pl-6' : 'pl-3',
        item.id === activeId
          ? 'border-accent-ink font-bold text-accent-ink'
          : 'border-transparent text-ink-soft hover:text-ink'
      ]"
    >{{ item.text }}</a>
  </nav>
</template>
```

- [ ] **Step 3: 重写 `src/app/views/DocsView.vue`**

```vue
<script setup lang="ts">
import { computed, watchEffect } from 'vue'
import { useRouter } from 'vue-router'
import { repo, type Doc, type DocMeta } from '@/data'
import { useAsync } from '@/composables/useAsync'
import { extractToc, renderMarkdown } from '@/lib/markdown'
import DocSidebar from '@/components/DocSidebar.vue'
import DocToc from '@/components/DocToc.vue'
import StatePanel from '@/components/StatePanel.vue'

const props = defineProps<{ slug?: string }>()
const router = useRouter()

const { data: docs, error: listError, loading: listLoading } = useAsync<DocMeta[]>(() => repo.listDocs())
const { data: doc, error: docError, loading: docLoading, reload } = useAsync<Doc | null>(
  () => (props.slug ? repo.getDoc(props.slug) : Promise.resolve(null)),
  [computed(() => props.slug ?? '')]
)

watchEffect(() => {
  if (!props.slug && docs.value?.length) void router.replace(`/docs/${docs.value[0].slug}`)
})

const html = computed(() => (doc.value ? renderMarkdown(doc.value.content) : ''))
const toc = computed(() => (doc.value ? extractToc(doc.value.content) : []))
</script>

<template>
  <StatePanel :loading="listLoading || docLoading" :error="listError ?? docError" @retry="reload">
    <DocSidebar :docs="docs ?? []" :active-slug="slug ?? ''" variant="tabs" class="mb-6 sm:hidden" />

    <div class="flex items-start gap-8">
      <DocSidebar :docs="docs ?? []" :active-slug="slug ?? ''" class="hidden w-[200px] shrink-0 sm:block" />
      <article class="min-w-0 flex-1 max-w-[640px]">
        <h1 class="mb-5 font-display text-[1.625rem] font-black">{{ doc?.title }}</h1>
        <div class="markdown-body" v-html="html" />
      </article>
      <DocToc :items="toc" class="hidden w-[170px] shrink-0 lg:block" />
    </div>
  </StatePanel>
</template>
```

- [ ] **Step 4: 检查**

```bash
cd src && npm run check
```
Expected: 全绿。

- [ ] **Step 5: 视觉验证（三栏 / 移动标签 / TOC 高亮）**

```bash
node ~/.config/opencode/skills/playwright-skill/run.js -e "
const b = await chromium.launch({ headless: true });
try {
  const p = await b.newPage();
  await p.setViewportSize({ width: 1280, height: 900 });
  await p.goto('http://localhost:5173/docs/about');
  await p.waitForFunction(() => !document.querySelector('[aria-busy=\"true\"]'));
  console.log('h1:', await p.locator('h1').innerText());
  console.log('active nav:', await p.locator('nav[aria-label=文档列表] a.bg-highlight').first().innerText());
  console.log('toc links:', await p.locator('nav[aria-label=本页目录] a').count());
  await p.setViewportSize({ width: 375, height: 812 });
  await p.goto('http://localhost:5173/docs/about');
  await p.waitForFunction(() => !document.querySelector('[aria-busy=\"true\"]'));
  console.log('tabs visible:', await p.locator('nav[aria-label=文档列表]').first().isVisible());
  console.log('toc hidden@375:', await p.locator('nav[aria-label=本页目录]').isHidden());
  console.log('overflow@375:', await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth));
} finally { await b.close(); }
"
```
Expected: `h1: 关于本站`；选中列表项为当前文档；TOC 有链接；375px 下横向标签可见、右栏目录隐藏、无横向滚动。再读 `/tmp/poster-doc-desktop1280.png` 与 `poster-doc-mobile375.png`。

- [ ] **Step 6: Commit**

```bash
git add src/app/components/DocSidebar.vue src/app/components/DocToc.vue src/app/views/DocsView.vue
git commit -m "feat: rebuild docs page with poster typography"
```

---

## Task 9: 详情页与 404

**Files:**
- Rewrite: `src/app/views/GameView.vue`、`src/app/views/NotFoundView.vue`

**Interfaces:**
- Consumes: `GameCover`（Task 2，`ratio="hero"`）、`.markdown-body`、`.btn-ink`、`.lift`、`PhArrowLeft / PhArrowSquareOut`
- Produces: 详情页（返回链接 → 16:7 大封面 → display-2 游戏名 → mono 元数据行 → 简介 → 标签片 → 墨底 CTA 带 `4px 4px 0 accent` 硬阴影 → 3px 分隔线 → Markdown）；游戏不存在面板；404 页（display-1 巨字 + 红斜印章）

- [ ] **Step 1: 重写 `src/app/views/GameView.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { PhArrowLeft, PhArrowSquareOut } from '@phosphor-icons/vue'
import { NotFoundError, repo, type Game } from '@/data'
import { useAsync } from '@/composables/useAsync'
import { renderMarkdown } from '@/lib/markdown'
import { durationText } from '@/lib/labels'
import GameCover from '@/components/GameCover.vue'
import StatePanel from '@/components/StatePanel.vue'

const props = defineProps<{ id: string }>()
const { data: game, error, loading, reload } = useAsync<Game>(
  () => repo.getGame(props.id),
  [computed(() => props.id)]
)

const notFound = computed(() => error.value instanceof NotFoundError)
const introHtml = computed(() => (game.value?.intro ? renderMarkdown(game.value.intro) : ''))
</script>

<template>
  <StatePanel :loading="loading" :error="notFound ? null : error" @retry="reload">
    <div v-if="notFound" class="border-2 border-dashed border-ink p-10 text-center">
      <p class="font-mono text-[0.6875rem] tracking-[0.05em] text-ink-soft">GAME NOT FOUND</p>
      <p class="mt-3 text-sm">该游戏不存在或已移除。</p>
      <RouterLink to="/" class="btn-ink lift mt-5 hover:shadow-hard active:shadow-none">返回目录</RouterLink>
    </div>

    <article v-else-if="game" class="mx-auto max-w-3xl space-y-6">
      <RouterLink
        to="/"
        class="inline-flex items-center gap-1.5 font-mono text-xs text-accent-ink underline decoration-2 underline-offset-2"
      >
        <PhArrowLeft :size="14" weight="bold" aria-hidden="true" />返回目录
      </RouterLink>

      <div class="border-2 border-ink shadow-hard-lg">
        <GameCover :game="game" ratio="hero" />
      </div>

      <div class="space-y-3">
        <h1 class="font-display text-[2.125rem] font-black leading-[1.1]">{{ game.name }}</h1>
        <p class="font-mono text-[0.6875rem] tracking-[0.05em] text-ink-soft">
          作者：
          <a
            v-if="game.author.url"
            :href="game.author.url"
            target="_blank"
            rel="noopener noreferrer"
            class="text-accent-ink underline decoration-2 underline-offset-2"
          >{{ game.author.name }}</a>
          <span v-else>{{ game.author.name }}</span>
          <span class="mx-2">·</span>预计时长：{{ durationText(game.durationMinutes) }}
          <span class="mx-2">·</span>收录于 {{ game.addedAt }}
        </p>
        <p class="text-sm leading-[1.8] text-ink-soft">{{ game.description }}</p>
        <div class="flex flex-wrap gap-1.5">
          <span
            v-for="tag in game.tags"
            :key="tag"
            class="border-[1.5px] border-ink bg-surface px-2 py-0.5 font-mono text-[0.6875rem]"
          >{{ tag }}</span>
        </div>
      </div>

      <a
        :href="game.url"
        target="_blank"
        rel="noopener noreferrer"
        class="lift inline-flex items-center gap-2 border-2 border-ink bg-ink px-5 py-2.5 font-extrabold text-paper shadow-hard-accent hover:shadow-[6px_6px_0_#e8552f] active:shadow-none"
      >
        开始游戏
        <PhArrowSquareOut :size="16" weight="bold" aria-hidden="true" />
      </a>

      <div v-if="introHtml" class="border-t-[3px] border-ink pt-6">
        <div class="markdown-body" v-html="introHtml" />
      </div>
    </article>
  </StatePanel>
</template>
```

- [ ] **Step 2: 重写 `src/app/views/NotFoundView.vue`**

```vue
<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <div class="flex min-h-[50vh] flex-col items-center justify-center gap-6 px-4 text-center">
    <p class="font-display text-[clamp(2.25rem,6vw,3.25rem)] font-black leading-[1.05]">404</p>
    <p class="-rotate-6 border-[2.5px] border-accent-ink px-3 py-1 font-mono text-xs font-bold tracking-[0.2em] text-accent-ink">
      PAGE NOT FOUND
    </p>
    <p class="text-sm text-ink-soft">页面不存在。</p>
    <RouterLink to="/" class="btn-ink lift hover:shadow-hard active:shadow-none">返回目录</RouterLink>
  </div>
</template>
```

- [ ] **Step 3: 检查**

```bash
cd src && npm run check
```
Expected: 全绿。

- [ ] **Step 4: 视觉验证**

```bash
node ~/.config/opencode/skills/playwright-skill/run.js -e "
const b = await chromium.launch({ headless: true });
try {
  const p = await b.newPage();
  await p.setViewportSize({ width: 1280, height: 900 });
  await p.goto('http://localhost:5173/games/2048');
  await p.waitForFunction(() => !document.querySelector('[aria-busy=\"true\"]'));
  console.log('h1:', await p.locator('h1').innerText());
  console.log('cover ratio:', await p.locator('article > div.border-2').first().evaluate((el) => el.clientWidth / el.clientHeight));
  console.log('cta shadow:', await p.locator('a[target=_blank]').last().evaluate((el) => getComputedStyle(el).boxShadow));
  await p.goto('http://localhost:5173/games/does-not-exist');
  await p.waitForTimeout(300);
  console.log('not found:', await p.getByText('GAME NOT FOUND').isVisible());
  await p.goto('http://localhost:5173/definitely-missing');
  console.log('404:', await p.getByText('404', { exact: true }).isVisible(), await p.getByText('PAGE NOT FOUND').isVisible());
} finally { await b.close(); }
"
```
Expected: `h1: 2048`；封面比例 ≈ 2.286（16/7）；CTA `box-shadow` 含 `rgb(232, 85, 47)`；不存在游戏与 404 文案可见。再读 `/tmp/poster-game-desktop1280.png` 与 `poster-404-desktop1280.png`。

- [ ] **Step 5: Commit**

```bash
git add src/app/views/GameView.vue src/app/views/NotFoundView.vue
git commit -m "feat: rebuild game detail and 404 pages"
```

---

## Task 10: 无渐变 / 直角守卫测试

**Files:**
- Create: `src/app/lib/no-gradient.test.ts`

**Interfaces:**
- Consumes: 无
- Produces: Vitest 守卫，扫描 `src/app/**/*.{vue,ts,css}`（排除 `*.test.ts`）与 `src/index.html`，命中即失败并输出「文件:行号: 内容」；关键词以字符串拼接书写，避免自命中

- [ ] **Step 1: 新建 `src/app/lib/no-gradient.test.ts`**

```ts
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC_ROOT = fileURLToPath(new URL('../..', import.meta.url))
const APP_DIR = join(SRC_ROOT, 'app')
const SCAN_EXTENSIONS = ['.vue', '.ts', '.css']
const BANNED = ['grad' + 'ient', 'repeat' + 'ing-', 'round' + 'ed-']

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const target = join(dir, entry)
    if (statSync(target).isDirectory()) yield* walk(target)
    else yield target
  }
}

function candidates(): string[] {
  const files: string[] = []
  for (const file of walk(APP_DIR)) {
    if (file.endsWith('.test.ts')) continue
    if (SCAN_EXTENSIONS.some((ext) => file.endsWith(ext))) files.push(file)
  }
  files.push(join(SRC_ROOT, 'index.html'))
  return files
}

function violations(file: string): string[] {
  const found: string[] = []
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, index) => {
      const lower = line.toLowerCase()
      for (const banned of BANNED) {
        if (lower.includes(banned)) found.push(`${relative(SRC_ROOT, file)}:${index + 1}: ${line.trim()}`)
      }
    })
  return found
}

describe('平面海报守卫', () => {
  it('源码中不得出现渐变与圆角工具类', () => {
    expect(candidates().flatMap(violations)).toEqual([])
  })
})
```

- [ ] **Step 2: 运行确认通过**

```bash
cd src && npx vitest run app/lib/no-gradient.test.ts
```
Expected: PASS。若失败，按输出逐个修掉遗留的 `rounded-*` / 渐变（此时应该已全部清理）。

- [ ] **Step 3: 验证守卫真的会失败（spec §8 验收项）**

```bash
cd src
cat > app/styles/__guard-probe.css <<'EOF'
.probe-gradient { background: linear-gradient(#ffffff, #000000); }
.probe-rounded { @apply rounded-lg; }
EOF
npx vitest run app/lib/no-gradient.test.ts ; echo "exit=$?"
rm app/styles/__guard-probe.css
npx vitest run app/lib/no-gradient.test.ts
```
Expected: 第一次 FAIL 且输出 `app/styles/__guard-probe.css:1` 与 `:2` 两行；`exit=1`；删除探针后第二次 PASS。

- [ ] **Step 4: 全量检查 + Commit**

```bash
cd src && npm run check
cd .. && git add src/app/lib/no-gradient.test.ts
git commit -m "test: add no-gradient and square-corner source guard"
```

---

## Task 11: 端到端验收

**Files:**
- 不改源码（发现问题则回到对应 Task 修复，并重跑该 Task 的验证）

**Interfaces:**
- Consumes: 前面全部 Task
- Produces: 验收证据（截图 + 控制台输出 + `npm run check` 结果）

- [ ] **Step 1: 全量截图扫描（375 / 768 / 1280 / 1920 × 5 路由）**

```bash
node ~/.config/opencode/skills/playwright-skill/run.js /tmp/playwright-poster-check.js
```
Expected: 20 张截图；`consoleErrors` 为空；`fontRequests` 为空；所有 `overflow: false`。逐张抽查（至少 home / game / docs / 404 各一张 1280 与 375）。

- [ ] **Step 2: reduced-motion 全局降级**

```bash
node ~/.config/opencode/skills/playwright-skill/run.js -e "
const b = await chromium.launch({ headless: true });
try {
  const p = await b.newPage({ reducedMotion: 'reduce' });
  await p.setViewportSize({ width: 1280, height: 900 });
  await p.goto('http://localhost:5173/');
  await p.waitForFunction(() => !document.querySelector('[aria-busy=\"true\"]'));
  const card = p.locator('a[href^=\"/games/\"]').first();
  await card.hover();
  await p.waitForTimeout(300);
  console.log('hover transform under reduce:', await card.evaluate((el) => getComputedStyle(el).transform));
  console.log('btn transition under reduce:', await card.evaluate((el) => getComputedStyle(el).transitionDuration));
} finally { await b.close(); }
"
```
Expected: `hover transform under reduce: none`；`transitionDuration: 0.01ms`（或 `0s`）。

- [ ] **Step 3: 键盘闭环（搜索 → 筛选 → 重置 → 抽屉 → 卡片）**

```bash
node ~/.config/opencode/skills/playwright-skill/run.js -e "
const b = await chromium.launch({ headless: true });
try {
  const p = await b.newPage();
  await p.setViewportSize({ width: 375, height: 812 });
  await p.goto('http://localhost:5173/');
  await p.waitForFunction(() => !document.querySelector('[aria-busy=\"true\"]'));
  const order = [];
  let reached = false;
  for (let i = 0; i < 10; i++) {
    await p.keyboard.press('Tab');
    const focus = await p.evaluate(() => {
      const el = document.activeElement;
      return el ? (el.id || el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 12) || el.tagName) : '';
    });
    order.push(focus);
    if (focus === 'game-search') { reached = true; break; }
  }
  console.log('tab order:', order.join(' -> '));
  console.log('reached search:', reached);
  await p.keyboard.type('2048');
  await p.waitForTimeout(200);
  console.log('result:', await p.locator('[aria-live=polite]').innerText());
  console.log('cards:', await p.locator('a[href^=\"/games/\"]').count());
  for (let i = 0; i < 10; i++) {
    await p.keyboard.press('Tab');
    const label = await p.evaluate(() => document.activeElement?.textContent?.trim() || '');
    if (label.startsWith('筛选')) break;
  }
  await p.keyboard.press('Enter');
  await p.waitForTimeout(150);
  console.log('dialog open:', await p.locator('dialog[open]').count());
  await p.keyboard.press('Escape');
  await p.waitForTimeout(150);
  console.log('dialog closed:', await p.locator('dialog[open]').count());
  console.log('focus restored:', await p.evaluate(() => document.activeElement?.textContent?.trim().startsWith('筛选')));
  await p.screenshot({ path: '/tmp/poster-keyboard-focus.png' });
} finally { await b.close(); }
"
```
Expected（375px 下侧栏隐藏，Tab 顺序即视觉顺序）：`tab order: 网页游戏收藏馆 -> 游戏 -> 文档 -> game-search`（允许中间多出可聚焦项，`reached search: true`）；输入 `2048` 后 `[aria-live]` 为 `1 款游戏`、卡片数为 1；Tab 到「筛选」→ Enter 打开 `dialog[open]` → Escape 关闭 → `focus restored: true`；截图可见红色 3px 焦点环。

- [ ] **Step 4: 断网字体回退**

```bash
node ~/.config/opencode/skills/playwright-skill/run.js -e "
const b = await chromium.launch({ headless: true });
try {
  const p = await b.newPage();
  await p.route('**/*.woff2', (route) => route.abort('failed'));
  await p.goto('http://localhost:5173/games/2048');
  await p.waitForFunction(() => !document.querySelector('[aria-busy=\"true\"]'));
  console.log('playfair available:', await p.evaluate(() => document.fonts.check('900 24px \"Playfair Display\"')));
  console.log('overflow:', await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth));
  await p.screenshot({ path: '/tmp/poster-fontless.png', fullPage: true });
} finally { await b.close(); }
"
```
Expected: `playfair available: false`（字体未加载，页面用系统字体渲染），`overflow: false`；`read /tmp/poster-fontless.png` 确认 H1 布局不破。

- [ ] **Step 5: 最终 `npm run check`**

```bash
cd src && npm run check
```
Expected: vitest（含守卫 + 计数 + 封面）全绿；`vue-tsc` 无错误；vite build 成功。

- [ ] **Step 6: 对照 spec §8 验收清单逐条确认**

- [ ] 目录 / 详情 / 文档 / 404 / 游戏不存在 / 空结果 / 加载 / 错误 全部实现，无圆角、无渐变（Task 1/5/6/7/8/9/10 的证据）
- [ ] 加入 `rounded-lg` 或 `linear-gradient(...)` 会让守卫失败（Task 10 Step 3 输出）
- [ ] 侧栏与抽屉筛选实时同步 URL query；重置清空 query 并恢复默认排序（Task 7 Step 7）
- [ ] 侧栏计数与目录数据一致，0 计数项不渲染（Task 7 截图 + 目测）
- [ ] 键盘可完成搜索、筛选、重置、开关抽屉、进入卡片、返回（Task 11 Step 3）
- [ ] 375px 与 1280px 无横向滚动、无内容遮挡（Task 11 Step 1）
- [ ] reduced-motion 下无脉动与位移（Task 11 Step 2）
- [ ] 断网时 Playfair 回退系统字体且布局不破；Network 面板无 Google 域名请求（Task 11 Step 1 + Step 4）
- [ ] `npm run check` 全绿（Task 11 Step 5）

- [ ] **Step 7: 若全部通过，无需提交**（如有修复，随对应文件一并提交）

---

## 依赖关系与执行顺序

```
Task 0（预检）
  └─ Task 1（令牌/字体/基础层）
       ├─ Task 2（封面）──┐
       ├─ Task 3（计数）  │
       ├─ Task 4（外壳）  │
       ├─ Task 5（卡片）◄─┘（GameCover）
       ├─ Task 6（状态）
       │    └─ Task 7（目录页，依赖 2/3/5/6）
       │         └─ Task 8（文档页）
       │              └─ Task 9（详情/404）
       │                   └─ Task 10（守卫）
       │                        └─ Task 11（验收）
```

---

## 执行后注记（2026-09-17 执行完成）

本计划已按 subagent-driven 流程执行完毕（11 个提交，`b2feedd..a3fd260`），`npm run check` 全绿。执行中发现并裁定的偏差与遗留项：

1. **导航当前项机制**：Task 4 原代码用的 `[&.router-link-active]` 对 `/docs/:slug` 无效——`/docs` 与 `/docs/:slug` 是兄弟路由记录，前缀匹配不会激活。实现改为 `onCatalog` / `onDocs` 计算属性驱动 `:class`。「游戏」仅在首页高亮（与计划及原实现一致）。
2. **守卫关键词扩展**：spec §7.4 的三条关键词之外，实测裸 `rounded` 与非零 `border-radius` / `borderRadius` 会漏过（`class="rounded"` 能带着绿色 CI 上线）。`no-gradient.test.ts` 已补上这两类检测，同时放行全局直角复位 `border-radius: 0`（spec §7.4 已同步修订）。
3. **「游戏不存在」状态在 Vite dev 不可达**：缺失的 `/data/games/*.json` 被 dev server 的 SPA fallback 返回 `index.html`（200），`staticRepo` 抛 `SyntaxError` 而非 `NotFoundError`；生产 `deploy/nginx.conf`（`location /data/ { try_files $uri =404; }`）返回真 404。数据层按约束未改动，该状态在 dev 用 `page.route` 打桩验证。
4. **h2 下划线取 2px**：spec §3.3 与 §4.7 冲突，按组件级更具体的 §4.7 执行（§3.3 已同步修订）。
5. **验证脚本冷启动竞态**：计划内 `-e` 片段以 `aria-busy` 为等待条件，在路由懒加载完成前即为真（Task 6 起 `aria-busy` 才真实存在）。共享截图脚本已加 400ms settle；后续复用请在 `goto` 后等待内容选择器。
6. **遗留 Minor（评审裁定不阻塞合并）**：文档导航缺 `aria-current`；无封面详情页底线偏粗（见 spec §4.5 注记）；主 CTA hover 硬编码强调色十六进制；抽屉关闭按钮约 28px；`package-lock.json` 的 `libc` 元数据变动；404 / 游戏不存在用 `<p>` 而非 `<h1>`；骨架卡在 `xl` 为 3 列而目录网格为 4 列。
