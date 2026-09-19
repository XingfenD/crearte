# 外链跳转提示页（中间页）实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 站内所有离开本站的链接统一经过站内中间页 `/out`，用户明确点击「继续访问」后才真正离开。

**架构：** 纯函数层（`lib/externalLink.ts`）负责「是不是外链」「怎么生成中间页 URL」「怎么解析目标」；`lib/markdown.ts` 在渲染期用这层把文档/简介里的外链改写为中间页链接；`views/OutboundView.vue` 是唯一的中间页视图（三种态：game / link / invalid），详情页两处入口只做 href 替换。

**技术栈：** Vue 3 + TypeScript（strict）+ vue-router 5 + vitest + Playwright；不新增任何依赖。

---

## 前置约束

- **仓库与分支：** `/root/crearte_mono/crearte`，分支 `docs/external-link-interstitial`（基于 `master`）。每个任务开始前跑 `git branch --show-current` 核对；若不在该分支，**停下报 BLOCKED**，不要自行切分支。
- **环境：** 会话内先执行一次 `export PATH=/root/.nvm/versions/node/v24.18.0/bin:$PATH`；`src/` 下已装好 `node_modules`。
- **门禁命令（每个任务结束必跑）：** `cd /root/crearte_mono/crearte/src && npx vitest run` + `npm run typecheck`，必须全绿。涉及视图/路由的任务额外跑 `npm run build`。
- **风格：** TypeScript strict、无分号、单引号、2 空格缩进；视觉只用平面海报令牌（`.lift`、`.btn-ink`、`.btn-surface`、`border-ink`、`bg-surface`、`shadow-hard`、`font-mono`、`text-ink-soft`、`bg-highlight`、`text-accent-ink`）；零渐变、全直角——`app/lib/no-gradient.test.ts` 会扫描 `src/app/**` 与 `index.html`，出现 `gradient`/`rounded`/`repeating-` 或非零圆角即失败。
- **不可改：** `src/app/data/**`（内容仓库）、`src/app/composables/**`、`src/app/styles/**`。生成物 `src/public/data/**` 已在 `.gitignore` 中，不进提交。
- **提交信息：** 用每个任务给出的原文。前端分支命名 `{feat|fix|docs|chore}/{branch-name}`，不提交到 `master`。
- **CHANGELOG 版本：** 本分支基线是 `master`（最新条目 `0.2.0`），但 `integration/backend` 线已占用 `0.3.0`（账号系统），本功能按 `0.4.0` 记录，避免后并时冲突。

## 文件结构

| 文件 | 职责 | 动作 |
| --- | --- | --- |
| `src/app/lib/externalLink.ts` | 判定外链、生成中间页 URL、解析目标（纯函数，`origin` 参数注入） | 新建 |
| `src/app/lib/externalLink.test.ts` | 上述纯函数的单测 | 新建 |
| `src/app/lib/markdown.ts` | 渲染期把外链改写为中间页链接（`link_open` 规则） | 修改 |
| `src/app/lib/markdown.test.ts` | 追加改写用例 | 修改 |
| `src/app/views/OutboundView.vue` | 中间页视图（game / link / invalid 三态） | 新建 |
| `src/app/views/GameView.vue` | 详情页两处入口改走中间页；`renderMarkdown` 传 origin | 修改 |
| `src/app/views/DocsView.vue` | `renderMarkdown` 传 origin | 修改 |
| `src/app/router/index.ts` | 注册 `/out` 路由 | 修改 |
| `src/docs/about.md` | 免责声明补邮箱反馈渠道 | 修改 |
| `src/fixtures/catalog/abs-paths.json` | 给夹具加 `intro`（含一条外链），供 e2e 实测 markdown 改写 | 修改 |
| `src/e2e/outbound.spec.ts` | 中间页 e2e（5 条） | 新建 |
| `docs/CHANGELOG.md` | `0.4.0` 条目 | 修改 |

## 规格覆盖对照

| 规格章节 | 由哪个任务实现 |
| --- | --- |
| §4.1 `/out` 路由与 query | 任务 3 |
| §4.2 覆盖的入口（详情页两处、markdown 改写） | 任务 2、任务 4 |
| §4.3 判定规则（同源/相对/锚点/mailto/协议相对） | 任务 1 |
| §5 参数与安全（协议白名单、超长、错误态、不外泄 `to`） | 任务 1、任务 3 |
| §6 文案与内容（两套文案、错误态、关于页） | 任务 3、任务 5 |
| §7 交互与视觉（新标签、replace、返回、Tab 顺序、令牌） | 任务 3、任务 4 |
| §8 代码组织 | 全部任务 |
| §9 测试与验收 | 任务 1、2、6、7 |
| §10 风险与已知限制 | 无需实现（记录性章节） |

---

### 任务 1：外链纯函数层

**文件：**
- 创建：`src/app/lib/externalLink.ts`
- 测试：`src/app/lib/externalLink.test.ts`

- [ ] **步骤 1：先写失败的测试**

创建 `src/app/lib/externalLink.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import {
  MAX_TARGET_LENGTH,
  isExternalHref,
  normalizeKind,
  parseTarget,
  toInterstitial
} from './externalLink'

const ORIGIN = 'https://crearte.yoresee.cc'

describe('isExternalHref', () => {
  it('跨域 http(s) 视为外链', () => {
    expect(isExternalHref('https://play2048.co/', ORIGIN)).toBe(true)
    expect(isExternalHref('http://example.com/a/b?x=1#h', ORIGIN)).toBe(true)
  })

  it('同源绝对地址不算外链', () => {
    expect(isExternalHref(`${ORIGIN}/games/2048`, ORIGIN)).toBe(false)
    expect(isExternalHref(ORIGIN, ORIGIN)).toBe(false)
  })

  it('站内路径、相对路径、锚点与空值不算外链', () => {
    expect(isExternalHref('/games/x', ORIGIN)).toBe(false)
    expect(isExternalHref('./x', ORIGIN)).toBe(false)
    expect(isExternalHref('#toc', ORIGIN)).toBe(false)
    expect(isExternalHref('', ORIGIN)).toBe(false)
    expect(isExternalHref(null, ORIGIN)).toBe(false)
    expect(isExternalHref(undefined, ORIGIN)).toBe(false)
  })

  it('mailto/tel 不算外链', () => {
    expect(isExternalHref('mailto:xingfen.fendy@outlook.com', ORIGIN)).toBe(false)
    expect(isExternalHref('tel:+8613800000000', ORIGIN)).toBe(false)
  })

  it('协议相对地址算外链', () => {
    expect(isExternalHref('//evil.com/x', ORIGIN)).toBe(true)
  })

  it('解析不了的串不算外链', () => {
    expect(isExternalHref('http://[', ORIGIN)).toBe(false)
  })
})

describe('toInterstitial', () => {
  it('kind 缺省为 link，目标完整编码', () => {
    expect(toInterstitial('https://example.com/a?b=1&c=2#d')).toBe(
      '/out?kind=link&to=https%3A%2F%2Fexample.com%2Fa%3Fb%3D1%26c%3D2%23d'
    )
  })

  it('kind=game 原样保留', () => {
    expect(toInterstitial('https://example.com/', 'game')).toBe(
      '/out?kind=game&to=https%3A%2F%2Fexample.com%2F'
    )
  })

  it('中文与空格按 UTF-8 百分号编码', () => {
    expect(toInterstitial('https://example.com/搜 索')).toBe(
      '/out?kind=link&to=https%3A%2F%2Fexample.com%2F%E6%90%9C%20%E7%B4%A2'
    )
  })
})

describe('normalizeKind', () => {
  it('只认 game，其余一律归 link', () => {
    expect(normalizeKind('game')).toBe('game')
    expect(normalizeKind('link')).toBe('link')
    expect(normalizeKind('GAME')).toBe('link')
    expect(normalizeKind('')).toBe('link')
    expect(normalizeKind(null)).toBe('link')
    expect(normalizeKind(undefined)).toBe('link')
  })
})

describe('parseTarget', () => {
  it('http/https 绝对地址通过，host 含端口', () => {
    expect(parseTarget('https://example.com:8443/x?y=1', ORIGIN)).toEqual({
      status: 'external',
      url: 'https://example.com:8443/x?y=1',
      host: 'example.com:8443'
    })
  })

  it('IDN host 归一为 punycode', () => {
    expect(parseTarget('https://例え.jp/ゲーム', ORIGIN)).toEqual({
      status: 'external',
      url: 'https://xn--r8jz45g.jp/%E3%82%B2%E3%83%BC%E3%83%A0',
      host: 'xn--r8jz45g.jp'
    })
  })

  it('同源目标返回站内直接导航', () => {
    expect(parseTarget(`${ORIGIN}/games/2048?x=1#h`, ORIGIN)).toEqual({
      status: 'same-origin',
      href: '/games/2048?x=1#h'
    })
  })

  it('拒绝危险协议、相对路径与空值', () => {
    expect(parseTarget('javascript:alert(1)', ORIGIN)).toEqual({ status: 'invalid' })
    expect(parseTarget('data:text/html,<b>x</b>', ORIGIN)).toEqual({ status: 'invalid' })
    expect(parseTarget('file:///etc/passwd', ORIGIN)).toEqual({ status: 'invalid' })
    expect(parseTarget('blob:https://example.com/1', ORIGIN)).toEqual({ status: 'invalid' })
    expect(parseTarget('/games/2048', ORIGIN)).toEqual({ status: 'invalid' })
    expect(parseTarget('', ORIGIN)).toEqual({ status: 'invalid' })
    expect(parseTarget(null, ORIGIN)).toEqual({ status: 'invalid' })
  })

  it('协议相对地址在中间页一律判无效（安全侧失败）', () => {
    expect(isExternalHref('//evil.com/x', ORIGIN)).toBe(true)
    expect(parseTarget('//evil.com/x', ORIGIN)).toEqual({ status: 'invalid' })
  })

  it('超长目标视为无效，边界值仍然通过', () => {
    const prefix = 'https://example.com/'
    expect(parseTarget(prefix + 'a'.repeat(MAX_TARGET_LENGTH), ORIGIN)).toEqual({ status: 'invalid' })
    expect(parseTarget(prefix + 'a'.repeat(MAX_TARGET_LENGTH - prefix.length), ORIGIN).status).toBe(
      'external'
    )
  })
})
```

- [ ] **步骤 2：运行测试确认失败**

运行：`cd /root/crearte_mono/crearte/src && npx vitest run app/lib/externalLink.test.ts`
预期：FAIL，报 `Failed to resolve import "./externalLink"`。

- [ ] **步骤 3：写实现**

创建 `src/app/lib/externalLink.ts`：

```ts
export type InterstitialKind = 'game' | 'link'

export type TargetResult =
  | { status: 'external'; url: string; host: string }
  | { status: 'same-origin'; href: string }
  | { status: 'invalid' }

export const MAX_TARGET_LENGTH = 2048

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])

export function isExternalHref(href: string | null | undefined, origin: string): boolean {
  if (!href) return false
  let url: URL
  try {
    url = new URL(href, origin)
  } catch {
    return false
  }
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) return false
  return url.origin !== origin
}

export function toInterstitial(href: string, kind: InterstitialKind = 'link'): string {
  return `/out?kind=${kind}&to=${encodeURIComponent(href)}`
}

export function normalizeKind(raw: string | null | undefined): InterstitialKind {
  return raw === 'game' ? 'game' : 'link'
}

export function parseTarget(raw: string | null | undefined, origin: string): TargetResult {
  if (!raw || raw.length > MAX_TARGET_LENGTH) return { status: 'invalid' }
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { status: 'invalid' }
  }
  if (!ALLOWED_PROTOCOLS.has(url.protocol)) return { status: 'invalid' }
  if (url.origin === origin) {
    return { status: 'same-origin', href: `${url.pathname}${url.search}${url.hash}` }
  }
  return { status: 'external', url: url.toString(), host: url.host }
}
```

注意：`parseTarget` 用 `new URL(raw)`（**不带 base**），所以相对路径与协议相对地址一律落到 `invalid`；`isExternalHref` 带 base，把 `//evil.com` 判为外链。两者不对称是有意的——入口改写后由中间页兜底成错误态，绝不直接离站。

- [ ] **步骤 4：运行测试确认通过**

运行：`cd /root/crearte_mono/crearte/src && npx vitest run app/lib/externalLink.test.ts`
预期：PASS（6 + 3 + 1 + 6 = 16 个用例）。

- [ ] **步骤 5：类型检查 + 全量单测**

运行：`cd /root/crearte_mono/crearte/src && npm run typecheck && npx vitest run`
预期：`vue-tsc` 无输出；vitest 全绿。

- [ ] **步骤 6：Commit**

```bash
cd /root/crearte_mono/crearte
git add src/app/lib/externalLink.ts src/app/lib/externalLink.test.ts
git commit -m "feat: add external link detection and interstitial url helpers"
```

---

### 任务 2：markdown 渲染期改写外链

**文件：**
- 修改：`src/app/lib/markdown.ts:1-8`（引入改写规则）、`src/app/lib/markdown.ts:47-52`（`renderMarkdown` 增加 `origin` 参数）
- 修改：`src/app/lib/markdown.test.ts:26-36`（既有两种用例补参数）、文件末尾追加新用例
- 修改：`src/app/views/DocsView.vue:24`、`src/app/views/GameView.vue:21`（调用点传 `location.origin`）

- [ ] **步骤 1：先写失败的测试**

先改 `src/app/lib/markdown.test.ts` 里既有的两处调用，给 `renderMarkdown` 补第二个参数：

```ts
  it('渲染出的 h2/h3 带与 TOC 一致的 id', () => {
    const html = renderMarkdown('## 第一节\n\n正文\n\n### 小节\n', ORIGIN)
    expect(html).toContain('id="第一节"')
    expect(html).toContain('id="小节"')
    expect(html).toContain('<p>正文</p>')
  })

  it('不渲染原始 HTML（html: false）', () => {
    expect(renderMarkdown('<script>alert(1)</script>', ORIGIN)).not.toContain('<script>')
  })
```

再在文件顶部的 import 下加常量，并在文件末尾追加：

```ts
const ORIGIN = 'https://crearte.yoresee.cc'

describe('renderMarkdown 外链改写', () => {
  it('外链改写为中间页链接并补 target/rel', () => {
    const html = renderMarkdown('[官网](https://play2048.co/)', ORIGIN)
    expect(html).toContain('href="/out?kind=link&amp;to=https%3A%2F%2Fplay2048.co%2F"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener"')
  })

  it('目标自带查询与锚点时完整编码', () => {
    const html = renderMarkdown('[x](https://example.com/a?b=1&c=2#d)', ORIGIN)
    expect(html).toContain('to=https%3A%2F%2Fexample.com%2Fa%3Fb%3D1%26c%3D2%23d')
  })

  it('站内路径与锚点不改写', () => {
    const html = renderMarkdown('[详情](/games/2048) [目录](#toc)', ORIGIN)
    expect(html).toContain('href="/games/2048"')
    expect(html).toContain('href="#toc"')
    expect(html).not.toContain('/out?')
  })

  it('mailto 不改写', () => {
    expect(renderMarkdown('[写信](mailto:xingfen.fendy@outlook.com)', ORIGIN)).toContain(
      'href="mailto:xingfen.fendy@outlook.com"'
    )
  })

  it('linkify 裸 URL 同样改写', () => {
    const html = renderMarkdown('见 https://play2048.co/ 一游', ORIGIN)
    expect(html).toContain('/out?kind=link&amp;to=https%3A%2F%2Fplay2048.co%2F')
    expect(html).toContain('target="_blank"')
  })
})
```

- [ ] **步骤 2：运行测试确认失败**

运行：`cd /root/crearte_mono/crearte/src && npx vitest run app/lib/markdown.test.ts`
预期：FAIL——新用例断言 `href="/out?...` 找不到（实测 3 个新断言失败、8 个通过；vitest 不做类型检查，所以既有用例不会因参数个数先报错）。

- [ ] **步骤 3：写实现**

把 `src/app/lib/markdown.ts` 顶部改成：

```ts
import MarkdownIt, { type Token } from 'markdown-it'
import { isExternalHref, toInterstitial } from './externalLink'

const md = new MarkdownIt({ html: false, linkify: true })

md.renderer.rules.table_open = (tokens, idx, options, _env, self) =>
  `<div class="md-table-wrap">${self.renderToken(tokens, idx, options)}`
md.renderer.rules.table_close = (tokens, idx, options, _env, self) =>
  `${self.renderToken(tokens, idx, options)}</div>`

md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const href = tokens[idx].attrGet('href')
  const origin = typeof env?.origin === 'string' ? env.origin : ''
  if (typeof href === 'string' && isExternalHref(href, origin)) {
    tokens[idx].attrSet('href', toInterstitial(href))
    tokens[idx].attrSet('target', '_blank')
    tokens[idx].attrSet('rel', 'noopener')
  }
  return self.renderToken(tokens, idx, options)
}
```

（markdown-it 默认没有 `link_open` 规则，无需保留旧规则；通用 `renderToken` 就是原行为。`env.origin` 由下面的 `renderMarkdown` 注入——`location` 不进这个模块，测试可控。）

再把 `renderMarkdown` 改成：

```ts
export function renderMarkdown(source: string, origin: string): string {
  const env: Record<string, unknown> = { origin }
  const tokens = md.parse(source, env)
  for (const { token, item } of walkHeadings(tokens)) token.attrSet('id', item.id)
  return md.renderer.render(tokens, md.options, env)
}
```

再改两个调用点：

`src/app/views/DocsView.vue:24`

```ts
const html = computed(() => (doc.value ? renderMarkdown(doc.value.content, location.origin) : ''))
```

`src/app/views/GameView.vue:21`

```ts
const introHtml = computed(() =>
  game.value?.intro ? renderMarkdown(game.value.intro, location.origin) : ''
)
```

- [ ] **步骤 4：运行测试确认通过**

运行：`cd /root/crearte_mono/crearte/src && npx vitest run app/lib/markdown.test.ts`
预期：PASS（既有 6 个 + 新增 5 个）。

- [ ] **步骤 5：类型检查 + 全量单测 + 构建**

运行：`cd /root/crearte_mono/crearte/src && npm run typecheck && npx vitest run && npm run build`
预期：`vue-tsc` 无输出；vitest 全绿；`vite build` 成功（含 `build-runtime`）。

- [ ] **步骤 6：Commit**

```bash
cd /root/crearte_mono/crearte
git add src/app/lib/markdown.ts src/app/lib/markdown.test.ts src/app/views/DocsView.vue src/app/views/GameView.vue
git commit -m "feat: route external markdown links through the interstitial"
```

---

### 任务 3：中间页视图与路由

**文件：**
- 创建：`src/app/views/OutboundView.vue`
- 修改：`src/app/router/index.ts:8-13`（在 catch-all 之前加 `/out`）

- [ ] **步骤 1：写视图**

创建 `src/app/views/OutboundView.vue`：

```vue
<script setup lang="ts">
import { computed, watchEffect } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { PhArrowSquareOut, PhWarningCircle } from '@phosphor-icons/vue'
import { normalizeKind, parseTarget } from '@/lib/externalLink'

const route = useRoute()
const router = useRouter()

function queryValue(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

const kind = computed(() => normalizeKind(queryValue(route.query.kind)))
const heading = computed(() =>
  kind.value === 'game' ? '即将前往第三方站点开始游戏' : '即将离开本站'
)

const state = computed(() => {
  const result = parseTarget(queryValue(route.query.to), location.origin)
  if (result.status === 'external') {
    return { view: 'external' as const, url: result.url, host: result.host, href: '' }
  }
  if (result.status === 'same-origin') {
    return { view: 'same-origin' as const, url: '', host: '', href: result.href }
  }
  return { view: 'invalid' as const, url: '', host: '', href: '' }
})

watchEffect(() => {
  if (state.value.view === 'same-origin' && !state.value.href.startsWith('/out')) {
    void router.replace(state.value.href)
  }
})

function goOn(url: string): void {
  window.location.replace(url)
}

function goBack(): void {
  if (window.history.length > 1) window.history.back()
  else void router.replace('/')
}
</script>

<template>
  <div class="mx-auto w-full max-w-2xl">
    <div v-if="state.view === 'invalid'" class="border-2 border-ink bg-surface p-6 shadow-hard">
      <p class="inline-flex items-center gap-1.5 bg-accent-ink px-2 py-0.5 font-mono text-[0.6875rem] font-bold tracking-[0.05em] text-paper">
        <PhWarningCircle :size="14" weight="bold" aria-hidden="true" />
        ERROR · 链接无效
      </p>
      <h1 class="mt-3 font-display text-[1.625rem] font-black">链接无效</h1>
      <p class="mt-3 text-sm leading-[1.8] text-ink-soft">
        该链接地址不合法，已阻止跳转。请返回上一页，或联系站点维护者。
      </p>
      <p class="mt-3 font-mono text-xs text-ink-soft">
        反馈：
        <a
          href="mailto:xingfen.fendy@outlook.com"
          class="text-accent-ink underline decoration-2 underline-offset-2"
        >xingfen.fendy@outlook.com</a>
        <span class="mx-2">·</span>
        <RouterLink
          to="/docs/about"
          class="text-accent-ink underline decoration-2 underline-offset-2"
        >关于本站</RouterLink>
      </p>
      <button
        type="button"
        class="btn-ink lift mt-5 hover:shadow-hard active:shadow-none"
        @click="goBack"
      >
        返回
      </button>
    </div>

    <div v-else-if="state.view === 'external'" class="border-2 border-ink bg-surface p-6 shadow-hard">
      <p class="font-mono text-[0.6875rem] tracking-[0.18em] text-ink-soft">OUTBOUND LINK</p>
      <h1 class="mt-3 font-display text-[1.625rem] font-black">{{ heading }}</h1>

      <template v-if="kind === 'game'">
        <p class="mt-4 text-sm leading-[1.8] text-ink-soft">
          该游戏由第三方提供并托管在其站点，本站仅收录链接与介绍。
        </p>
        <p class="mt-3 text-sm leading-[1.8] text-ink-soft">
          游戏内容<strong class="font-extrabold text-ink">可能与其被收录时不同</strong>，也可能随时变更、下架或停止服务；内容、版权与数据均由第三方负责，与本站无关。
        </p>
        <p class="mt-3 text-sm leading-[1.8] text-ink-soft">
          如发现违规、侵权或不适内容，请通过邮件反馈，或查看「关于本站」了解处理流程，我们会尽快核实处理。
        </p>
      </template>
      <p v-else class="mt-4 text-sm leading-[1.8] text-ink-soft">
        你将前往第三方站点，其内容与隐私政策由该站点负责，本站无法控制亦不承担责任。请确认链接可信后再继续。
      </p>

      <div class="mt-5 border-2 border-ink p-3">
        <p class="font-mono text-[0.6875rem] tracking-[0.05em] text-ink-soft">目标站点</p>
        <p class="mt-1 font-mono text-sm font-bold">{{ state.host }}</p>
        <p class="mt-1 break-all font-mono text-xs text-ink-soft">{{ state.url }}</p>
      </div>

      <p v-if="kind === 'game'" class="mt-3 font-mono text-xs text-ink-soft">
        反馈：
        <a
          href="mailto:xingfen.fendy@outlook.com"
          class="text-accent-ink underline decoration-2 underline-offset-2"
        >xingfen.fendy@outlook.com</a>
        <span class="mx-2">·</span>
        <RouterLink
          to="/docs/about"
          class="text-accent-ink underline decoration-2 underline-offset-2"
        >关于本站</RouterLink>
      </p>

      <div class="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          class="btn-ink lift inline-flex items-center gap-2 hover:shadow-hard active:shadow-none"
          @click="goOn(state.url)"
        >
          继续访问
          <PhArrowSquareOut :size="16" weight="bold" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="btn-surface lift hover:shadow-hard active:shadow-none"
          @click="goBack"
        >
          返回
        </button>
      </div>
    </div>
  </div>
</template>
```

说明：`state` 用可辨识联合收敛成三个字面量视图，避免在模板里对联合类型做窄化；`same-origin` 态不渲染任何内容（`watchEffect` 已把用户送去站内目标，`/out` 自指时不动，防循环）。App 布局（`App.vue`）已带 `AppHeader`/`AppFooter`，视图不再重复引入。视图**不碰** `document.title` 与任何 meta，`to` 只在页面正文里以文本插值显示（规格 §5）。

- [ ] **步骤 2：注册路由**

把 `src/app/router/index.ts` 的 `routes` 改成：

```ts
  routes: [
    { path: '/', name: 'home', component: () => import('@/views/HomeView.vue') },
    { path: '/games/:id', name: 'game', component: () => import('@/views/GameView.vue'), props: true },
    { path: '/docs', name: 'docs', component: () => import('@/views/DocsView.vue') },
    { path: '/docs/:slug', name: 'doc', component: () => import('@/views/DocsView.vue'), props: true },
    { path: '/out', name: 'outbound', component: () => import('@/views/OutboundView.vue') },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('@/views/NotFoundView.vue') }
  ],
```

- [ ] **步骤 3：类型检查 + 构建**

运行：`cd /root/crearte_mono/crearte/src && npm run typecheck && npm run build`
预期：`vue-tsc` 无输出；构建成功，产物里出现 `OutboundView-*.js`（独立 chunk）。

- [ ] **步骤 4：单测回归（含平面海报守卫）**

运行：`cd /root/crearte_mono/crearte/src && npx vitest run`
预期：全绿——`no-gradient.test.ts` 会扫到新视图，若报违规说明用了禁用类名。

- [ ] **步骤 5：Commit**

```bash
cd /root/crearte_mono/crearte
git add src/app/views/OutboundView.vue src/app/router/index.ts
git commit -m "feat: add the outbound interstitial view"
```

---

### 任务 4：详情页两处入口改走中间页

**文件：**
- 修改：`src/app/views/GameView.vue:7`（import）、`src/app/views/GameView.vue:52-58`（作者主页）、`src/app/views/GameView.vue:74-83`（开始游戏）

- [ ] **步骤 1：改 import**

在 `src/app/views/GameView.vue` 的 `import { renderMarkdown } from '@/lib/markdown'` 下一行加：

```ts
import { toInterstitialIfExternal } from '@/lib/externalLink'
```

- [ ] **步骤 2：改作者主页链接**

把作者主页的 `<a>` 改成：

```vue
          <a
            v-if="game.author.url"
            :href="toInterstitialIfExternal(game.author.url, location.origin)"
            target="_blank"
            rel="noopener"
            class="text-accent-ink underline decoration-2 underline-offset-2"
          >{{ game.author.name }}</a>
```

- [ ] **步骤 3：改开始游戏入口**

把外链按钮改成：

```vue
      <a
        v-else
        :href="toInterstitialIfExternal(game.url, location.origin, 'game')"
        target="_blank"
        rel="noopener"
        class="lift inline-flex items-center gap-2 border-2 border-ink bg-ink px-5 py-2.5 font-extrabold text-paper shadow-hard-accent hover:shadow-hard-accent-lg active:shadow-none"
      >
        开始游戏
        <PhArrowSquareOut :size="16" weight="bold" aria-hidden="true" />
      </a>
```

（站内可玩的 `playable` 分支走 `<GameHost>`，不受影响；`rel` 由 `noopener noreferrer` 收窄为 `noopener`，referrer 由中间页那次跳转决定，见规格 §7。详情页两处入口改为「仅外链才套中间页」——`toInterstitialIfExternal` 内部先做 `isExternalHref` 判定，非外链（站内路径、锚点、相对路径、`mailto:`/`tel:`、空值）原样直链。）

- [ ] **步骤 4：类型检查 + 构建**

运行：`cd /root/crearte_mono/crearte/src && npm run typecheck && npm run build`
预期：无类型错误，构建成功。

- [ ] **步骤 5：Commit**

```bash
cd /root/crearte_mono/crearte
git add src/app/views/GameView.vue
git commit -m "feat: route game and author links through the interstitial"
```

---

### 任务 5：关于页补邮箱反馈渠道

**文件：**
- 修改：`src/docs/about.md`（免责声明段）

- [ ] **步骤 1：改文案**

把 `src/docs/about.md` 的「免责声明」段替换为：

```markdown
## 免责声明

所有游戏版权归原作者所有，本站仅提供链接与介绍。若您是权利人且不希望被收录，请提交 issue 或 PR 移除，或发邮件到 xingfen.fendy@outlook.com。
```

- [ ] **步骤 2：确认内容管线仍通过**

运行：`cd /root/crearte_mono/crearte/src && npm run validate:data`
预期：`校验通过：N 个游戏，2 篇文档`。

- [ ] **步骤 3：类型检查 + 构建**

运行：`cd /root/crearte_mono/crearte/src && npm run typecheck && npm run build`
预期：无错误；`prebuild` 重新生成 `public/data/docs.json`（该目录已在 `.gitignore` 中，不进提交）。

- [ ] **步骤 4：Commit**

```bash
cd /root/crearte_mono/crearte
git add src/docs/about.md
git commit -m "docs: add the feedback email to the about page"
```

---

### 任务 6：中间页 e2e

**文件：**
- 修改：`src/fixtures/catalog/abs-paths.json`（加 `intro`，让 markdown 改写有真实渲染路径可测）
- 创建：`src/e2e/outbound.spec.ts`

说明：规格 §9.2 的「文档正文外链 → 普通版文案」用夹具 `intro` 覆盖——生产文档 `src/docs/*.md` 目前没有任何外链（规格 §4.2 已记录），改真实内容超出本期范围。

- [ ] **步骤 1：给夹具加带外链的简介**

把 `src/fixtures/catalog/abs-paths.json` 改成（新增 `intro` 一行）：

```json
{
  "id": "abs-paths",
  "name": "绝对路径夹具",
  "url": "https://example.com/abs",
  "author": { "name": "test", "url": "mailto:test@example.com" },
  "description": "fixture",
  "intro": "夹具简介，外链：[示例站](https://example.com/intro-link)。",
  "durationMinutes": { "min": 1, "max": 1 },
  "type": "other",
  "tags": ["fixture"],
  "addedAt": "2026-09-17",
  "entry": "index.html",
  "display": { "aspect": "4:3" },
  "features": { "inlineScript": true }
}
```

- [ ] **步骤 2：写 e2e**

创建 `src/e2e/outbound.spec.ts`：

```ts
import { expect, test } from '@playwright/test'

test('非外链作者主页不被套中间页', async ({ page }) => {
  await page.goto('http://localhost:4173/games/abs-paths')

  const authorLink = page.getByRole('link', { name: 'test', exact: true })
  await expect(authorLink).toHaveAttribute('href', 'mailto:test@example.com')
})

test('详情页开始游戏先经中间页，确认后才离开本站', async ({ page, context }) => {
  await context.route('https://play2048.co/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<h1 id="target">目标站</h1>' })
  )
  await page.goto('http://localhost:4173/games/2048')

  const [tab] = await Promise.all([
    page.waitForEvent('popup'),
    page.getByRole('link', { name: '开始游戏' }).click()
  ])
  await tab.waitForLoadState()

  await expect(tab).toHaveURL(/\/out\?kind=game&to=https%3A%2F%2Fplay2048\.co%2F/)
  await expect(tab.getByRole('heading', { name: '即将前往第三方站点开始游戏' })).toBeVisible()
  await expect(tab.getByText('play2048.co', { exact: true })).toBeVisible()
  await expect(tab.getByText('https://play2048.co/', { exact: true })).toBeVisible()

  await tab.getByRole('button', { name: '继续访问' }).click()
  await expect(tab).toHaveURL('https://play2048.co/')
  await expect(tab.locator('#target')).toBeVisible()
  expect(page.url()).toBe('http://localhost:4173/games/2048')
})

test('简介里的外链经中间页（普通版）', async ({ page }) => {
  await page.goto('http://localhost:4173/games/abs-paths')

  const [tab] = await Promise.all([
    page.waitForEvent('popup'),
    page.getByRole('link', { name: '示例站' }).click()
  ])
  await tab.waitForLoadState()

  await expect(tab).toHaveURL(/\/out\?kind=link&to=https%3A%2F%2Fexample\.com%2Fintro-link/)
  await expect(tab.getByRole('heading', { name: '即将离开本站' })).toBeVisible()
  await expect(tab.getByText('example.com', { exact: true })).toBeVisible()
})

test('危险协议与缺失参数都落到错误态且不跳转', async ({ page }) => {
  await page.goto('http://localhost:4173/out?to=javascript:alert(1)')
  await expect(page.getByRole('heading', { name: '链接无效' })).toBeVisible()
  await expect(page.getByRole('button', { name: '继续访问' })).toHaveCount(0)
  expect(page.url()).toBe('http://localhost:4173/out?to=javascript:alert(1)')

  await page.goto('http://localhost:4173/out')
  await expect(page.getByRole('heading', { name: '链接无效' })).toBeVisible()
  await expect(page.getByRole('button', { name: '返回' })).toBeVisible()
})

test('同源目标不显示中间页，直接站内跳转', async ({ page }) => {
  await page.goto('http://localhost:4173/out?to=http%3A%2F%2Flocalhost%3A4173%2Fdocs%2Fabout')
  await expect(page).toHaveURL('http://localhost:4173/docs/about')
  await expect(page.getByRole('heading', { name: '关于本站' })).toBeVisible()
})

test('缺省 kind 按普通版处理', async ({ page }) => {
  await page.goto('http://localhost:4173/out?kind=weird&to=https%3A%2F%2Fexample.com%2Fx')
  await expect(page.getByRole('heading', { name: '即将离开本站' })).toBeVisible()
})
```

- [ ] **步骤 3：跑 e2e**

运行：`cd /root/crearte_mono/crearte/src && lsof -ti:4173 | xargs -r kill; npm run e2e`
（必须先清掉可能残留的 4173 服务：`playwright.config.ts` 配了 `reuseExistingServer`，会复用旧构建导致测到过期产物。）
预期：`6 passed`，且既有 20 条仍然通过（合计 `26 passed`）。

- [ ] **步骤 4：Commit**

```bash
cd /root/crearte_mono/crearte
git add src/fixtures/catalog/abs-paths.json src/e2e/outbound.spec.ts
git commit -m "test: cover the outbound interstitial with e2e"
```

---

### 任务 7：CHANGELOG 与全量验收

**文件：**
- 修改：`docs/CHANGELOG.md`（顶部新增 `0.4.0`）

- [ ] **步骤 1：写 CHANGELOG**

在 `docs/CHANGELOG.md` 的 `## [0.2.0] - 2026-09-18` 之前插入（条目内英文行紧接中文行，条目之间空一行）：

```markdown
## [0.4.0] - 2026-09-19

### Added / 新增

- Added an outbound interstitial: every link that leaves the site now goes through `/out` with game and generic notice copy, an invalid-target error state, a strict http/https whitelist, and a render-time rewrite of external markdown links.
- 新增外链中间页：所有离开本站的链接先经过 `/out`，含游戏版与普通版提示文案、非法目标错误态、严格 http/https 协议白名单，以及 markdown 外链的渲染期改写。

### Changed / 变更

- Game and author links on the detail page now open the interstitial first, and the about page documents the feedback email.
- 详情页的游戏与作者链接改为先进入中间页；关于页补充邮箱反馈渠道。

```

- [ ] **步骤 2：全量门禁**

运行：`cd /root/crearte_mono/crearte/src && npm run check`
预期：`vitest run` 全绿 + `vue-tsc` 无输出 + `vite build` 与 `build-runtime` 成功。

- [ ] **步骤 3：全量 e2e**

运行：`cd /root/crearte_mono/crearte/src && lsof -ti:4173 | xargs -r kill; npm run e2e`
预期：`26 passed`（既有 20 + 新增 6）。

- [ ] **步骤 4：Commit**

```bash
cd /root/crearte_mono/crearte
git add docs/CHANGELOG.md
git commit -m "docs: add 0.4.0 changelog for the outbound interstitial"
```

- [ ] **步骤 5：交回分支状态**

```bash
cd /root/crearte_mono/crearte
git status --short && git log --oneline master..HEAD
```

预期：工作区干净（除既有的 `src/package-lock.json` 改动，与本工作无关，不要提交）；`git log` 显示本计划的 7 个功能提交 + 规格提交。

---

## 完成标准

- `npm run check` 与 `npm run e2e` 全绿（e2e 共 26 条）。
- 详情页两处入口、markdown 渲染出的外链，全部指向 `/out`；站内链接与锚点不受影响。
- `/out` 在 `to` 非法/缺失时只显示错误态，任何情况下都不自动跳转。
- 无新增运行期依赖；`src/app/data/**` 一行未改。
