# webgame-collection 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现收集静态网页游戏的开源目录站：仓库内 JSON 数据源 + Vue3 静态站点 + markdown 文档系统，CI 构建镜像推 GHCR 并由 keel 更新 k3s。

**Architecture:** 站点工程根为 `src/`（Vue3 + Vite + Tailwind v4），构建脚本校验 `src/games/*.json` 并生成 `src/public/data/*` 静态数据；前端经 `ContentRepository` 抽象层异步读取数据（未来换后端只替换实现）。部署为多阶段 Docker 镜像（nginx 托管 dist），GitHub Actions 推 GHCR 后调 keel native webhook，k3s 滚动更新。

**Tech Stack:** Vue 3 · TypeScript · Vite · Vue Router · Tailwind CSS v4 · markdown-it · Vitest · Ajv（draft 2020-12）· nginx · GitHub Actions · GHCR · keel.sh · k3s

**Spec:** `docs/superpowers/specs/2026-09-17-webgame-collection-design.md`

## Global Constraints

- 仓库根 = `webgame-collection/`（已 `git init`，spec 已提交）。所有相对路径以仓库根为基准。
- 站点 npm 工程根 = `src/`；所有 `npm` 命令在 `src/` 目录执行（Docker/CI 亦然）。
- 构建只针对 `src/`：Docker 构建上下文为仓库根，但只拷贝 `src/` 与 `deploy/nginx.conf`。
- 数据源：`src/games/<id>.json`，`id` 满足 `^[a-z0-9-]{1,64}$` 且等于文件名。
- JSON Schema：draft 2020-12，所有对象层级 `additionalProperties: false`。
- 文档源：`src/docs/*.md`，slug = 文件名（`^[a-z0-9-]+$`），frontmatter 仅允许 `title`（必填）、`order`（可选数字，缺省 999）。
- 站点文案与文档中文为主；界面不引入 i18n。
- 不引 Pinia；状态用模块级 composable + URL query。
- 数据层接口 `ContentRepository`（`listGames` / `getGame` / `listDocs` / `getDoc`）；未来接后端只改 `src/app/data/index.ts` 的单例。
- 数据基础路径：`import.meta.env.VITE_DATA_BASE_URL ?? '/data'`。
- 封面：`cover` 字段为 https 外链或 `/data/assets/covers/<id>.<png|jpg|jpeg|webp|avif|gif>`（文件须存在于 `src/assets/covers/`）；无封面或加载失败用首字 + 确定性渐变占位。
- 详情页只做外链跳转（`target="_blank" rel="noopener noreferrer"`），不做 iframe 试玩。
- 镜像：`ghcr.io/<owner>/webgame-collection:<sha-long>` + `:latest`；CI Node 24，Docker 构建阶段 `node:24-alpine`，运行阶段 `nginx:1.27-alpine`。
- 每个任务结束提交一次 git（conventional commits：`feat:` / `chore:` / `ci:` / `docs:` / `test:`）。
- Node 本地版本 v25（开发可用）；CI/镜像统一 24。
- 本地无 kubectl：k8s 清单的正确性由 YAML 解析测试保证，集群侧 apply 属用户侧验收。

---

### Task 1: src 工程脚手架（Vite + Vue3 + TS + Tailwind + Vitest）

**Files:**
- Create: `.gitignore`（仓库根）
- Create: `src/package.json`
- Create: `src/vite.config.ts`
- Create: `src/tsconfig.json`
- Create: `src/index.html`
- Create: `src/app/main.ts`
- Create: `src/app/App.vue`
- Create: `src/app/styles/main.css`
- Create: `src/public/favicon.svg`

**Interfaces:**
- Consumes: 无
- Produces: `npm run dev` / `npm run build` / `npm run typecheck` 可跑；`@` 别名指向 `src/app/`（后续所有任务使用 `@/...` 导入）

- [ ] **Step 1: 写 `.gitignore`（仓库根）**

```gitignore
node_modules/
dist/
src/public/data/
.DS_Store
*.log
```

- [ ] **Step 2: 建目录骨架并写 `src/package.json`**

```bash
mkdir -p src/app/router src/app/views src/app/components src/app/composables src/app/data src/app/lib src/app/styles src/games src/docs src/assets/covers src/schema src/scripts src/public
```

`src/package.json`：

```json
{
  "name": "webgame-collection",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc --noEmit && vite build",
    "preview": "vite preview",
    "typecheck": "vue-tsc --noEmit"
  }
}
```

- [ ] **Step 3: 安装依赖**

```bash
cd src
npm install vue vue-router markdown-it
npm install -D vite @vitejs/plugin-vue vue-tsc typescript tailwindcss @tailwindcss/vite vitest @types/node @types/markdown-it
```

（不锁定版本，npm 取当前最新稳定版；若 `markdown-it` 已自带类型，`@types/markdown-it` 保留无碍。）

- [ ] **Step 4: 写构建与类型配置**

`src/vite.config.ts`：

```ts
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./app', import.meta.url)) }
  }
})
```

`src/tsconfig.json`：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vite/client", "node"],
    "strict": true,
    "noEmit": true,
    "allowJs": true,
    "checkJs": false,
    "skipLibCheck": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "baseUrl": ".",
    "paths": { "@/*": ["app/*"] }
  },
  "include": ["app/**/*.ts", "app/**/*.vue", "scripts/**/*.mjs", "scripts/**/*.ts"]
}
```

- [ ] **Step 5: 写入口与样式**

`src/index.html`：

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>网页游戏收藏馆</title>
  </head>
  <body class="bg-neutral-950 text-neutral-100 antialiased">
    <div id="app"></div>
    <script type="module" src="/app/main.ts"></script>
  </body>
</html>
```

`src/app/styles/main.css`：

```css
@import "tailwindcss";
```

`src/app/main.ts`：

```ts
import { createApp } from 'vue'
import App from './App.vue'
import './styles/main.css'

createApp(App).mount('#app')
```

`src/app/App.vue`（Task 6 之前的临时壳，Task 6 会替换）：

```vue
<template>
  <div class="min-h-screen flex items-center justify-center text-neutral-400">脚手架就绪</div>
</template>
```

`src/public/favicon.svg`：

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#7c3aed"/>
  <circle cx="22" cy="32" r="6" fill="#fff"/>
  <circle cx="42" cy="22" r="5" fill="#fff" opacity="0.85"/>
  <circle cx="42" cy="42" r="5" fill="#fff" opacity="0.6"/>
</svg>
```

- [ ] **Step 6: 验证**

```bash
cd src
npm run typecheck   # 期望：无输出，退出码 0
npm run build       # 期望：vite build 成功，生成 src/dist/
npm run dev         # 期望：dev server 启动，浏览器显示“脚手架就绪”；Ctrl-C 退出
```

- [ ] **Step 7: 提交**

```bash
git add .gitignore src
git commit -m "chore: scaffold vue3 app in src with vite, tailwind and vitest"
```

---

### Task 2: 游戏 schema、校验/生成脚本与种子数据

**Files:**
- Create: `src/schema/game.schema.json`
- Create: `src/scripts/build-data.mjs`
- Create: `src/scripts/build-data.test.ts`
- Create: `src/games/2048.json`
- Create: `src/games/hextris.json`
- Create: `src/games/a-dark-room.json`
- Create: `src/docs/about.md`
- Create: `src/docs/contribute.md`
- Modify: `src/package.json`（加 predev/prebuild/validate:data/test/check 脚本）

**Interfaces:**
- Consumes: Task 1 的工程骨架
- Produces:
  - `src/public/data/index.json`：`{ schemaVersion: 1, generatedAt: string, games: GameSummary[] }`
  - `src/public/data/games/<id>.json`：完整游戏对象（含 `intro`）
  - `src/public/data/docs.json`：`{ generatedAt: string, docs: { slug, title, order, content }[] }`（按 order、slug 排序）
  - `src/public/data/assets/covers/*`：从 `src/assets/covers/` 复制的封面
  - 导出函数（供测试与后续任务）：`SRC_ROOT`、`parseFrontmatter(raw, label)`、`createValidator(schema)`、`loadGames({ gamesDir, coversDir, validate })`、`loadDocs({ docsDir })`、`buildIndex(games, generatedAt)`、`generate({ srcRoot, check, now })`

- [ ] **Step 1: 写 JSON Schema**

`src/schema/game.schema.json`：

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://github.com/webgame-collection/schema/game.schema.json",
  "title": "Webgame Collection Game",
  "type": "object",
  "additionalProperties": false,
  "required": ["id", "name", "url", "author", "description", "durationMinutes", "type", "tags", "addedAt"],
  "properties": {
    "id": { "type": "string", "pattern": "^[a-z0-9-]{1,64}$" },
    "name": { "type": "string", "minLength": 1, "maxLength": 60 },
    "url": { "type": "string", "pattern": "^https://[^\\s]+$" },
    "author": {
      "type": "object",
      "additionalProperties": false,
      "required": ["name"],
      "properties": {
        "name": { "type": "string", "minLength": 1, "maxLength": 60 },
        "url": { "type": "string", "pattern": "^https://[^\\s]+$" }
      }
    },
    "description": { "type": "string", "minLength": 1, "maxLength": 140 },
    "intro": { "type": "string", "maxLength": 5000 },
    "durationMinutes": {
      "type": "object",
      "additionalProperties": false,
      "required": ["min", "max"],
      "properties": {
        "min": { "type": "integer", "minimum": 1 },
        "max": { "type": "integer", "minimum": 1, "maximum": 600 }
      }
    },
    "type": {
      "enum": ["puzzle", "action", "idle", "strategy", "simulation", "narrative", "music", "creative", "casual", "other"]
    },
    "tags": {
      "type": "array",
      "maxItems": 8,
      "uniqueItems": true,
      "items": { "type": "string", "minLength": 1, "maxLength": 12, "pattern": "^\\S(.*\\S)?$" }
    },
    "cover": { "type": "string", "pattern": "^(https://[^\\s]+|/data/assets/covers/)" },
    "addedAt": { "type": "string", "pattern": "^\\d{4}-\\d{2}-\\d{2}$" }
  }
}
```

（不使用 `format: uri`/`date`，避免引入 ajv-formats；Pattern 已覆盖本项目所需的严格性。）

- [ ] **Step 2: 写种子数据（3 个游戏、2 篇站点文档）**

`src/games/2048.json`：

```json
{
  "id": "2048",
  "name": "2048",
  "url": "https://play2048.co/",
  "author": { "name": "Gabriele Cirulli", "url": "https://github.com/gabrielecirulli/2048" },
  "description": "滑动合并数字方块，凑出 2048 的经典益智游戏。",
  "intro": "使用方向键（移动端滑动）移动所有方块，相同数字碰撞后合并。\n\n全部方块卡死且无法再合并时游戏结束。",
  "durationMinutes": { "min": 5, "max": 20 },
  "type": "puzzle",
  "tags": ["数字", "休闲"],
  "addedAt": "2026-09-17"
}
```

`src/games/hextris.json`：

```json
{
  "id": "hextris",
  "name": "Hextris",
  "url": "https://hextris.io/",
  "author": { "name": "Hextris Team", "url": "https://github.com/Hextris/hextris" },
  "description": "旋转六边形接住下落的彩色方块，速度越来越快的反应类游戏。",
  "durationMinutes": { "min": 3, "max": 15 },
  "type": "action",
  "tags": ["反应", "街机"],
  "addedAt": "2026-09-17"
}
```

`src/games/a-dark-room.json`：

```json
{
  "id": "a-dark-room",
  "name": "A Dark Room",
  "url": "https://adarkroom.doublespeakgames.com/",
  "author": { "name": "Doublespeak Games", "url": "https://www.doublespeakgames.com/" },
  "description": "从一堆篝火开始，逐步建设定居点并探索黑暗世界的文字放置游戏。",
  "intro": "游戏从“生火”开始，资源、建筑与事件逐步展开。\n\n耐心是这款游戏的核心机制之一。",
  "durationMinutes": { "min": 30, "max": 300 },
  "type": "idle",
  "tags": ["文字", "生存", "放置"],
  "addedAt": "2026-09-17"
}
```

`src/docs/about.md`：

```md
---
title: 关于本站
order: 1
---

## 这是什么

网页游戏收藏馆收集**静态网页游戏**：打开网页即玩、无需安装、无需服务端。

## 收录范围

- 纯前端交互的网页游戏（含 HTML5、WebGL、Canvas 实现）
- 访问链接长期可用的独立游戏页面
- 不收录需要下载客户端、注册账号才能玩的游戏

## 免责声明

所有游戏版权归原作者所有，本站仅提供链接与介绍。若您是权利人且不希望被收录，请提交 issue 或 PR 移除。
```

`src/docs/contribute.md`：

```md
---
title: 收录与提交
order: 2
---

## 提交一个游戏

1. 在仓库 `src/games/` 目录新增 `<id>.json`，`id` 只能包含小写字母、数字与连字符，且与文件名一致
2. 本地运行校验：`cd src && npm install && npm run validate:data`
3. 提交 PR，CI 会自动校验数据格式

## 字段说明

| 字段 | 说明 |
| --- | --- |
| `name` | 游戏名（≤ 60 字） |
| `url` | 游戏访问链接（仅 https） |
| `author` | 作者或团队，`url` 可选 |
| `description` | 一句话简介（≤ 140 字） |
| `intro` | 可选，详情页 Markdown 长简介 |
| `durationMinutes` | 预计时长分钟数区间 |
| `type` | 单选类型，见 schema 枚举 |
| `tags` | 自由标签，最多 8 个、每个 ≤ 12 字 |
| `cover` | 可选封面：外链 https 或 `/data/assets/covers/<id>.<扩展名>` |
| `addedAt` | 收录日期（`YYYY-MM-DD`） |
```

- [ ] **Step 3: 写失败测试 `src/scripts/build-data.test.ts`**

```ts
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SRC_ROOT, generate } from './build-data.mjs'

const validGame = {
  id: '2048',
  name: '2048',
  url: 'https://play2048.co/',
  author: { name: 'Gabriel' },
  description: '滑动合并数字方块。',
  durationMinutes: { min: 5, max: 20 },
  type: 'puzzle',
  tags: ['数字'],
  addedAt: '2026-09-17'
}

const dirs: string[] = []

async function fixture(files: Record<string, unknown>): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'wgc-'))
  dirs.push(root)
  await mkdir(path.join(root, 'schema'), { recursive: true })
  await copyFile(path.join(SRC_ROOT, 'schema', 'game.schema.json'), path.join(root, 'schema', 'game.schema.json'))
  for (const [rel, content] of Object.entries(files)) {
    const target = path.join(root, rel)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, typeof content === 'string' ? content : JSON.stringify(content))
  }
  return root
}

afterEach(async () => {
  while (dirs.length) await rm(dirs.pop()!, { recursive: true, force: true })
})

describe('loadGames via generate', () => {
  it('接受合法游戏并生成 index/games/docs', async () => {
    const root = await fixture({
      'games/2048.json': { ...validGame, intro: '## 玩法' },
      'docs/about.md': '---\ntitle: 关于\norder: 1\n---\n\n## 小节\n\n正文'
    })
    const result = await generate({ srcRoot: root, now: new Date('2026-09-17T00:00:00Z') })
    expect(result).toMatchObject({ ok: true, games: 1, docs: 1 })
    const index = JSON.parse(await readFile(path.join(root, 'public/data/index.json'), 'utf8'))
    expect(index.games).toHaveLength(1)
    expect(index.games[0].intro).toBeUndefined()
    const detail = JSON.parse(await readFile(path.join(root, 'public/data/games/2048.json'), 'utf8'))
    expect(detail.intro).toBe('## 玩法')
    const docs = JSON.parse(await readFile(path.join(root, 'public/data/docs.json'), 'utf8'))
    expect(docs.docs[0]).toEqual({ slug: 'about', title: '关于', order: 1, content: '## 小节\n\n正文' })
  })

  it('check 模式只校验不写文件', async () => {
    const root = await fixture({ 'games/2048.json': validGame })
    const result = await generate({ srcRoot: root, check: true })
    expect(result.ok).toBe(true)
    await expect(readFile(path.join(root, 'public/data/index.json'))).rejects.toThrow()
  })

  it('拒绝 id 与文件名不一致、未知字段、重复标签、非法文件名', async () => {
    const cases: Array<[string, unknown]> = [
      ['games/other.json', validGame],
      ['games/2048.json', { ...validGame, writer: 'x' }],
      ['games/2048.json', { ...validGame, tags: ['dup', 'dup'] }],
      ['games/Bad Name.json', validGame]
    ]
    for (const [file, content] of cases) {
      const root = await fixture({ [file]: content })
      const result = await generate({ srcRoot: root, check: true })
      expect(result.ok, `${file} 应校验失败`).toBe(false)
    }
  })

  it('拒绝 max<min 与本地封面文件缺失/名字不匹配', async () => {
    const maxMin = await fixture({ 'games/2048.json': { ...validGame, durationMinutes: { min: 30, max: 5 } } })
    expect((await generate({ srcRoot: maxMin, check: true })).ok).toBe(false)

    const missing = await fixture({ 'games/2048.json': { ...validGame, cover: '/data/assets/covers/2048.png' } })
    expect((await generate({ srcRoot: missing, check: true })).ok).toBe(false)

    const wrongName = await fixture({
      'games/2048.json': { ...validGame, cover: '/data/assets/covers/other.png' },
      'assets/covers/other.png': 'png'
    })
    expect((await generate({ srcRoot: wrongName, check: true })).ok).toBe(false)
  })

  it('本地封面存在时校验通过', async () => {
    const root = await fixture({
      'games/2048.json': { ...validGame, cover: '/data/assets/covers/2048.webp' },
      'assets/covers/2048.webp': 'webp'
    })
    expect((await generate({ srcRoot: root, check: true })).ok).toBe(true)
  })

  it('文档：缺 title、未知 frontmatter 字段报错；order 排序生效', async () => {
    const noTitle = await fixture({ 'games/2048.json': validGame, 'docs/a.md': '---\norder: 1\n---\n正文' })
    expect((await generate({ srcRoot: noTitle, check: true })).ok).toBe(false)

    const unknownKey = await fixture({ 'games/2048.json': validGame, 'docs/a.md': '---\ntitle: A\nweight: 1\n---\n正文' })
    expect((await generate({ srcRoot: unknownKey, check: true })).ok).toBe(false)

    const sorted = await fixture({
      'games/2048.json': validGame,
      'docs/b.md': '---\ntitle: B\norder: 2\n---\nB',
      'docs/a.md': '---\ntitle: A\norder: 1\n---\nA'
    })
    await generate({ srcRoot: sorted })
    const docs = JSON.parse(await readFile(path.join(sorted, 'public/data/docs.json'), 'utf8'))
    expect(docs.docs.map((d: { slug: string }) => d.slug)).toEqual(['a', 'b'])
  })
})
```

- [ ] **Step 4: 跑测试确认失败**

```bash
cd src
npx vitest run scripts/build-data.test.ts
```

期望：FAIL（`build-data.mjs` 尚未实现 / 导入报错）。

- [ ] **Step 5: 实现构建脚本 `src/scripts/build-data.mjs`**

```js
#!/usr/bin/env node
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'

export const SRC_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
export const GAME_ID_PATTERN = /^[a-z0-9-]{1,64}$/
export const DOC_SLUG_PATTERN = /^[a-z0-9-]+$/
export const LOCAL_COVER_PATTERN = /^\/data\/assets\/covers\/([a-z0-9-]{1,64})\.(png|jpg|jpeg|webp|avif|gif)$/

export function createValidator(schema) {
  return new Ajv2020({ allErrors: true, strict: true }).compile(schema)
}

export function parseFrontmatter(raw, label = 'frontmatter') {
  const errors = []
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw)
  if (!match) {
    return { title: '', order: 999, content: raw, errors: [`${label}: 缺少 frontmatter（--- / title: ... / ---）`] }
  }
  let title = ''
  let order = 999
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim()) continue
    const idx = line.indexOf(':')
    if (idx < 0) {
      errors.push(`${label}: frontmatter 行无法解析：${line}`)
      continue
    }
    const key = line.slice(0, idx).trim()
    const value = line.slice(idx + 1).trim()
    if (key === 'title') title = value
    else if (key === 'order') {
      const n = Number(value)
      if (!Number.isFinite(n)) errors.push(`${label}: order 必须是数字，得到 "${value}"`)
      else order = n
    } else errors.push(`${label}: 未知 frontmatter 字段 "${key}"（仅支持 title、order）`)
  }
  if (!title) errors.push(`${label}: 缺少 title`)
  return { title, order, content: raw.slice(match[0].length).trim(), errors }
}

async function checkCover(game, coversDir) {
  if (!game.cover || game.cover.startsWith('https://')) return null
  const match = LOCAL_COVER_PATTERN.exec(game.cover)
  if (!match) return 'cover 必须是 https URL 或 /data/assets/covers/<id>.<png|jpg|jpeg|webp|avif|gif>'
  if (match[1] !== game.id) return `cover 文件名必须与 id 一致（应为 ${game.id}.${match[2]}）`
  if (!existsSync(path.join(coversDir, `${game.id}.${match[2]}`))) return `cover 文件不存在：assets/covers/${game.id}.${match[2]}`
  return null
}

export async function loadGames({ gamesDir, coversDir, validate }) {
  const errors = []
  const games = []
  const seen = new Map()
  let files = []
  try {
    files = (await readdir(gamesDir)).filter((f) => f.endsWith('.json')).sort()
  } catch {
    return { games, errors: [`无法读取目录：${gamesDir}`] }
  }
  for (const file of files) {
    const label = `games/${file}`
    const fileId = file.slice(0, -'.json'.length)
    if (!GAME_ID_PATTERN.test(fileId)) errors.push(`${label}: 文件名必须是 [a-z0-9-]{1,64}`)
    const lower = fileId.toLowerCase()
    if (seen.has(lower)) errors.push(`${label}: id 与 ${seen.get(lower)} 重复（忽略大小写）`)
    seen.set(lower, label)
    let raw
    try {
      raw = JSON.parse(await readFile(path.join(gamesDir, file), 'utf8'))
    } catch (e) {
      errors.push(`${label}: JSON 解析失败：${e.message}`)
      continue
    }
    if (!validate(raw)) {
      for (const err of validate.errors ?? []) errors.push(`${label}${err.instancePath || ''}: ${err.message}`)
      continue
    }
    if (raw.id !== fileId) {
      errors.push(`${label}: id "${raw.id}" 必须等于文件名 "${fileId}"`)
      continue
    }
    if (raw.durationMinutes.max < raw.durationMinutes.min) {
      errors.push(`${label}: durationMinutes.max 必须 >= min`)
      continue
    }
    const coverError = await checkCover(raw, coversDir)
    if (coverError) {
      errors.push(`${label}: ${coverError}`)
      continue
    }
    games.push(raw)
  }
  return { games, errors }
}

export async function loadDocs({ docsDir }) {
  const errors = []
  const docs = []
  let files = []
  try {
    files = (await readdir(docsDir)).filter((f) => f.endsWith('.md')).sort()
  } catch {
    return { docs, errors }
  }
  for (const file of files) {
    const label = `docs/${file}`
    const slug = file.slice(0, -'.md'.length)
    if (!DOC_SLUG_PATTERN.test(slug)) {
      errors.push(`${label}: 文件名必须是 [a-z0-9-]+`)
      continue
    }
    const parsed = parseFrontmatter(await readFile(path.join(docsDir, file), 'utf8'), label)
    if (parsed.errors.length) {
      errors.push(...parsed.errors)
      continue
    }
    docs.push({ slug, title: parsed.title, order: parsed.order, content: parsed.content })
  }
  return { docs, errors }
}

function pickGame(game, withIntro) {
  return {
    id: game.id,
    name: game.name,
    url: game.url,
    author: { name: game.author.name, ...(game.author.url ? { url: game.author.url } : {}) },
    description: game.description,
    ...(withIntro && game.intro ? { intro: game.intro } : {}),
    durationMinutes: { min: game.durationMinutes.min, max: game.durationMinutes.max },
    type: game.type,
    tags: [...game.tags],
    ...(game.cover ? { cover: game.cover } : {}),
    addedAt: game.addedAt
  }
}

export function buildIndex(games, generatedAt) {
  return {
    schemaVersion: 1,
    generatedAt,
    games: [...games].sort((a, b) => a.id.localeCompare(b.id)).map((g) => pickGame(g, false))
  }
}

export async function generate({ srcRoot = SRC_ROOT, check = false, now = new Date() } = {}) {
  const gamesDir = path.join(srcRoot, 'games')
  const docsDir = path.join(srcRoot, 'docs')
  const coversDir = path.join(srcRoot, 'assets', 'covers')
  const outDir = path.join(srcRoot, 'public', 'data')
  const schema = JSON.parse(await readFile(path.join(srcRoot, 'schema', 'game.schema.json'), 'utf8'))
  const validate = createValidator(schema)
  const { games, errors: gameErrors } = await loadGames({ gamesDir, coversDir, validate })
  const { docs, errors: docErrors } = await loadDocs({ docsDir })
  const errors = [...gameErrors, ...docErrors]
  if (errors.length) return { ok: false, errors }
  if (check) return { ok: true, errors: [], games: games.length, docs: docs.length }

  const generatedAt = now.toISOString()
  await rm(outDir, { recursive: true, force: true })
  await mkdir(path.join(outDir, 'games'), { recursive: true })
  await writeFile(path.join(outDir, 'index.json'), JSON.stringify(buildIndex(games, generatedAt), null, 2) + '\n')
  for (const game of games) {
    await writeFile(path.join(outDir, 'games', `${game.id}.json`), JSON.stringify(pickGame(game, true), null, 2) + '\n')
  }
  const sortedDocs = [...docs].sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug))
  await writeFile(path.join(outDir, 'docs.json'), JSON.stringify({ generatedAt, docs: sortedDocs }, null, 2) + '\n')
  if (existsSync(coversDir)) await cp(coversDir, path.join(outDir, 'assets', 'covers'), { recursive: true })
  return { ok: true, errors: [], games: games.length, docs: docs.length }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const check = process.argv.includes('--check')
  const result = await generate({ check })
  if (!result.ok) {
    console.error(`数据校验失败（${result.errors.length} 个问题）：`)
    for (const err of result.errors) console.error(`  - ${err}`)
    process.exit(1)
  }
  console.log(check ? `校验通过：${result.games} 个游戏，${result.docs} 篇文档` : `数据已生成：${result.games} 个游戏，${result.docs} 篇文档`)
}
```

（若安装到的 Ajv 主版本不是 8.x 导致 `ajv/dist/2020.js` 导入失败，按 Ajv 版本文档调整导入路径，其余逻辑不变。）

- [ ] **Step 6: 补全 `src/package.json` 脚本**

```json
"scripts": {
  "dev": "vite",
  "predev": "node scripts/build-data.mjs",
  "build": "vue-tsc --noEmit && vite build",
  "prebuild": "node scripts/build-data.mjs",
  "preview": "vite preview",
  "typecheck": "vue-tsc --noEmit",
  "validate:data": "node scripts/build-data.mjs --check",
  "test": "vitest run",
  "check": "vitest run && npm run build"
}
```

```bash
cd src
npm install -D ajv
```

- [ ] **Step 7: 跑测试确认通过并验证生成产物**

```bash
cd src
npx vitest run scripts/build-data.test.ts   # 期望：全部 PASS
npm run validate:data                        # 期望：“校验通过：3 个游戏，2 篇文档”
npm run build                                # 期望：prebuild 生成 public/data，vite build 成功
ls public/data public/data/games             # 期望：index.json docs.json games/ assets/
```

- [ ] **Step 8: 提交**

```bash
git add src
git commit -m "feat: add strict game schema, data validation and static data generation"
```

---

### Task 3: 数据抽象层（types / repository / staticRepo）

**Files:**
- Create: `src/app/data/types.ts`
- Create: `src/app/data/repository.ts`
- Create: `src/app/data/staticRepo.ts`
- Create: `src/app/data/index.ts`
- Create: `src/app/data/staticRepo.test.ts`

**Interfaces:**
- Consumes: Task 2 生成的 `/data/index.json`、`/data/games/<id>.json`、`/data/docs.json` 结构与字段
- Produces:
  - `GAME_TYPES: readonly string[]`、`GameType`
  - `GameSummary`、`Game`、`DocMeta`、`Doc`、`GamesIndex`、`DocsIndex`
  - `NotFoundError`、`ContentRepository` 接口
  - `StaticContentRepository` 类；`repo` 单例（后续页面唯一数据入口）

- [ ] **Step 1: 写类型与接口**

`src/app/data/types.ts`：

```ts
export const GAME_TYPES = [
  'puzzle', 'action', 'idle', 'strategy', 'simulation',
  'narrative', 'music', 'creative', 'casual', 'other'
] as const

export type GameType = (typeof GAME_TYPES)[number]

export interface Author {
  name: string
  url?: string
}

export interface GameSummary {
  id: string
  name: string
  url: string
  author: Author
  description: string
  durationMinutes: { min: number; max: number }
  type: GameType
  tags: string[]
  cover?: string
  addedAt: string
}

export interface Game extends GameSummary {
  intro?: string
}

export interface DocMeta {
  slug: string
  title: string
  order: number
}

export interface Doc extends DocMeta {
  content: string
}

export interface GamesIndex {
  schemaVersion: number
  generatedAt: string
  games: GameSummary[]
}

export interface DocsIndex {
  generatedAt: string
  docs: Doc[]
}
```

`src/app/data/repository.ts`：

```ts
import type { Doc, DocMeta, Game, GameSummary } from './types'

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`Not found: ${what}`)
    this.name = 'NotFoundError'
  }
}

export interface ContentRepository {
  listGames(): Promise<GameSummary[]>
  getGame(id: string): Promise<Game>
  listDocs(): Promise<DocMeta[]>
  getDoc(slug: string): Promise<Doc>
}
```

- [ ] **Step 2: 写失败测试 `src/app/data/staticRepo.test.ts`**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NotFoundError } from './repository'
import { StaticContentRepository } from './staticRepo'

const index = {
  schemaVersion: 1,
  generatedAt: '2026-09-17T00:00:00.000Z',
  games: [{
    id: '2048',
    name: '2048',
    url: 'https://play2048.co/',
    author: { name: 'Gabriel' },
    description: '滑动合并数字方块。',
    durationMinutes: { min: 5, max: 20 },
    type: 'puzzle',
    tags: ['数字'],
    addedAt: '2026-09-17'
  }]
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  } as Response
}

describe('StaticContentRepository', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    return () => vi.unstubAllGlobals()
  })

  it('使用 base 拼 URL 并返回摘要列表', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(index))
    const repo = new StaticContentRepository('/data')
    await expect(repo.listGames()).resolves.toEqual(index.games)
    expect(fetchMock).toHaveBeenCalledWith('/data/index.json')
  })

  it('列表请求有内存缓存（只 fetch 一次）', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(index))
    const repo = new StaticContentRepository('/data')
    await repo.listGames()
    await repo.listGames()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('404 抛 NotFoundError，且失败不缓存（可重试成功）', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}, 404))
      .mockResolvedValueOnce(jsonResponse({ ...index.games[0] }))
    const repo = new StaticContentRepository('/data')
    await expect(repo.getGame('2048')).rejects.toBeInstanceOf(NotFoundError)
    await expect(repo.getGame('2048')).resolves.toMatchObject({ id: '2048' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('非 404 错误抛 Error', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 500))
    const repo = new StaticContentRepository('/data')
    await expect(repo.listGames()).rejects.toThrow('请求失败 500')
  })

  it('响应结构非法时报错', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ schemaVersion: 1, games: [{ id: 1 }] }))
    const repo = new StaticContentRepository('/data')
    await expect(repo.listGames()).rejects.toThrow('数据格式错误')
  })

  it('listDocs 返回元信息，getDoc 返回正文', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      generatedAt: 't',
      docs: [{ slug: 'about', title: '关于', order: 1, content: '# x' }]
    }))
    const repo = new StaticContentRepository('/data')
    await expect(repo.listDocs()).resolves.toEqual([{ slug: 'about', title: '关于', order: 1 }])
    await expect(repo.getDoc('about')).resolves.toMatchObject({ title: '关于', content: '# x' })
  })
})
```

- [ ] **Step 3: 跑测试确认失败**

```bash
cd src
npx vitest run app/data/staticRepo.test.ts
```

期望：FAIL（`staticRepo.ts` 不存在）。

- [ ] **Step 4: 实现 `src/app/data/staticRepo.ts` 与单例**

`src/app/data/staticRepo.ts`：

```ts
import { NotFoundError, type ContentRepository } from './repository'
import type { Doc, DocMeta, DocsIndex, Game, GameSummary, GamesIndex } from './types'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`数据格式错误: ${message}`)
}

function assertGameSummary(value: unknown, path: string): asserts value is GameSummary {
  const g = value as GameSummary
  assert(g && typeof g.id === 'string' && typeof g.name === 'string' && typeof g.url === 'string', `${path} 缺少 id/name/url`)
  assert(Array.isArray(g.tags), `${path}.tags 必须是数组`)
  assert(g.author && typeof g.author.name === 'string', `${path}.author.name 缺失`)
  assert(g.durationMinutes && typeof g.durationMinutes.min === 'number' && typeof g.durationMinutes.max === 'number', `${path}.durationMinutes 非法`)
}

function assertGamesIndex(value: unknown): GamesIndex {
  const data = value as GamesIndex
  assert(data && Array.isArray(data.games), 'index.json 缺少 games 数组')
  data.games.forEach((game, i) => assertGameSummary(game, `games[${i}]`))
  return data
}

function assertDocsIndex(value: unknown): DocsIndex {
  const data = value as DocsIndex
  assert(data && Array.isArray(data.docs), 'docs.json 缺少 docs 数组')
  data.docs.forEach((doc, i) => {
    assert(doc && typeof doc.slug === 'string' && typeof doc.title === 'string' && typeof doc.content === 'string', `docs[${i}] 非法`)
  })
  return data
}

export class StaticContentRepository implements ContentRepository {
  private cachedGames?: Promise<GameSummary[]>
  private cachedDocs?: Promise<Doc[]>
  private readonly cachedGamesById = new Map<string, Promise<Game>>()

  constructor(private readonly base: string = import.meta.env.VITE_DATA_BASE_URL ?? '/data') {}

  private async fetchJson(path: string): Promise<unknown> {
    const response = await fetch(`${this.base}${path}`)
    if (response.status === 404) throw new NotFoundError(path)
    if (!response.ok) throw new Error(`请求失败 ${response.status}: ${path}`)
    return response.json()
  }

  listGames(): Promise<GameSummary[]> {
    this.cachedGames ??= this.fetchJson('/index.json')
      .then(assertGamesIndex)
      .then((data) => data.games)
      .catch((error) => {
        this.cachedGames = undefined
        throw error
      })
    return this.cachedGames
  }

  getGame(id: string): Promise<Game> {
    let pending = this.cachedGamesById.get(id)
    if (!pending) {
      pending = this.fetchJson(`/games/${encodeURIComponent(id)}.json`)
        .then((data) => {
          assertGameSummary(data, `games/${id}`)
          return data as Game
        })
        .catch((error) => {
          this.cachedGamesById.delete(id)
          throw error
        })
      this.cachedGamesById.set(id, pending)
    }
    return pending
  }

  listDocs(): Promise<DocMeta[]> {
    this.cachedDocs ??= this.fetchJson('/docs.json')
      .then(assertDocsIndex)
      .then((data) => data.docs)
      .catch((error) => {
        this.cachedDocs = undefined
        throw error
      })
    return this.cachedDocs
  }

  async getDoc(slug: string): Promise<Doc> {
    const docs = await this.listDocs()
    const doc = docs.find((d) => d.slug === slug)
    if (!doc) throw new NotFoundError(slug)
    return doc
  }
}
```

`src/app/data/index.ts`：

```ts
import type { ContentRepository } from './repository'
import { StaticContentRepository } from './staticRepo'

export * from './repository'
export * from './types'

// 未来接入后端：实现 ApiRepository 后仅替换这里的单例
export const repo: ContentRepository = new StaticContentRepository()
```

- [ ] **Step 5: 跑测试确认通过**

```bash
cd src
npx vitest run app/data/staticRepo.test.ts   # 期望：全部 PASS
npm run typecheck                            # 期望：退出码 0
```

- [ ] **Step 6: 提交**

```bash
git add src/app/data
git commit -m "feat: add content repository abstraction with static JSON implementation"
```

---

### Task 4: 筛选/搜索/排序、URL 状态与文案纯函数

**Files:**
- Create: `src/app/lib/filter.ts`
- Create: `src/app/lib/filter.test.ts`
- Create: `src/app/lib/labels.ts`
- Create: `src/app/lib/labels.test.ts`

**Interfaces:**
- Consumes: Task 3 的 `GameSummary`、`GameType`、`GAME_TYPES`
- Produces:
  - `FilterState { q: string; type: GameType | 'all'; tags: string[]; dur: 'all' | 'short' | 'mid' | 'long'; sort: 'new' | 'name' | 'duration' }`
  - `DEFAULT_FILTER`、`parseFilterState(query: Record<string, unknown>)`、`toQuery(state): Record<string, string>`、`durationBucket(game): 'short' | 'mid' | 'long'`、`filterGames(games, state): GameSummary[]`
  - `GAME_TYPE_LABELS: Record<GameType, string>`、`durationText({ min, max }): string`

- [ ] **Step 1: 写失败测试 `src/app/lib/filter.test.ts` 与 `labels.test.ts`**

`src/app/lib/filter.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import type { GameSummary } from '@/data/types'
import { DEFAULT_FILTER, durationBucket, filterGames, parseFilterState, toQuery } from './filter'

function game(partial: Partial<GameSummary> & Pick<GameSummary, 'id'>): GameSummary {
  return {
    name: partial.id,
    url: 'https://example.com/',
    author: { name: '作者' },
    description: '描述',
    durationMinutes: { min: 5, max: 20 },
    type: 'puzzle',
    tags: [],
    addedAt: '2026-01-01',
    ...partial
  }
}

const games: GameSummary[] = [
  game({ id: 'alpha', name: 'Alpha', tags: ['数字', '休闲'], addedAt: '2026-01-02', durationMinutes: { min: 5, max: 10 } }),
  game({ id: 'beta', name: 'Beta', description: '探索黑暗世界', tags: ['文字'], type: 'idle', addedAt: '2026-03-01', durationMinutes: { min: 30, max: 300 } }),
  game({ id: 'gamma', name: 'Gamma', author: { name: '某人' }, tags: ['数字'], type: 'action', addedAt: '2026-02-01', durationMinutes: { min: 1, max: 4 } })
]

describe('parseFilterState', () => {
  it('解析合法 query，非法值回退默认', () => {
    expect(parseFilterState({ q: ' 2048 ', type: 'idle', tag: '文字,数字', dur: 'long', sort: 'name' }))
      .toEqual({ q: '2048', type: 'idle', tags: ['文字', '数字'], dur: 'long', sort: 'name' })
    expect(parseFilterState({ type: 'nope', dur: 'x', sort: 'y' })).toEqual(DEFAULT_FILTER)
    expect(parseFilterState({})).toEqual(DEFAULT_FILTER)
  })
})

describe('toQuery', () => {
  it('省略默认值，tags 用逗号连接', () => {
    expect(toQuery(DEFAULT_FILTER)).toEqual({})
    expect(toQuery({ ...DEFAULT_FILTER, q: 'x', type: 'idle', tags: ['a', 'b'], dur: 'short', sort: 'name' }))
      .toEqual({ q: 'x', type: 'idle', tag: 'a,b', dur: 'short', sort: 'name' })
  })

  it('round-trip：toQuery -> parseFilterState 保持一致', () => {
    const state = { ...DEFAULT_FILTER, q: '2048', tags: ['数字'], dur: 'mid' as const }
    expect(parseFilterState(toQuery(state))).toEqual(state)
  })
})

describe('durationBucket', () => {
  it('按 max 分桶：short ≤5，mid ≤30，long >30', () => {
    expect(durationBucket(game({ id: 'a', durationMinutes: { min: 1, max: 5 } }))).toBe('short')
    expect(durationBucket(game({ id: 'b', durationMinutes: { min: 10, max: 30 } }))).toBe('mid')
    expect(durationBucket(game({ id: 'c', durationMinutes: { min: 30, max: 31 } }))).toBe('long')
  })
})

describe('filterGames', () => {
  it('搜索匹配 name/description/author/tags，忽略大小写', () => {
    expect(filterGames(games, { ...DEFAULT_FILTER, q: 'alpha' }).map((g) => g.id)).toEqual(['alpha'])
    expect(filterGames(games, { ...DEFAULT_FILTER, q: '黑暗' }).map((g) => g.id)).toEqual(['beta'])
    expect(filterGames(games, { ...DEFAULT_FILTER, q: '作者' }).map((g) => g.id)).toEqual(['alpha', 'beta'])
  })

  it('类型与标签为 AND 语义，标签多选须全部命中', () => {
    expect(filterGames(games, { ...DEFAULT_FILTER, type: 'puzzle' }).map((g) => g.id)).toEqual(['alpha'])
    expect(filterGames(games, { ...DEFAULT_FILTER, tags: ['数字'] }).map((g) => g.id)).toEqual(['alpha', 'gamma'])
    expect(filterGames(games, { ...DEFAULT_FILTER, tags: ['数字', '休闲'] }).map((g) => g.id)).toEqual(['alpha'])
  })

  it('时长桶与排序（new 倒序、duration 按 min 升序、name 字母序）', () => {
    expect(filterGames(games, { ...DEFAULT_FILTER, dur: 'short' }).map((g) => g.id)).toEqual(['gamma'])
    expect(filterGames(games, { ...DEFAULT_FILTER, sort: 'new' }).map((g) => g.id)).toEqual(['beta', 'gamma', 'alpha'])
    expect(filterGames(games, { ...DEFAULT_FILTER, sort: 'duration' }).map((g) => g.id)).toEqual(['gamma', 'alpha', 'beta'])
    expect(filterGames(games, { ...DEFAULT_FILTER, sort: 'name' }).map((g) => g.id)).toEqual(['alpha', 'beta', 'gamma'])
  })

  it('组合筛选', () => {
    expect(filterGames(games, { ...DEFAULT_FILTER, q: '数字', type: 'action' }).map((g) => g.id)).toEqual(['gamma'])
    expect(filterGames(games, { ...DEFAULT_FILTER, q: '不存在' })).toEqual([])
  })
})
```

`src/app/lib/labels.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { GAME_TYPES } from '@/data/types'
import { GAME_TYPE_LABELS, durationText } from './labels'

describe('labels', () => {
  it('每个类型都有中文标签', () => {
    for (const type of GAME_TYPES) expect(GAME_TYPE_LABELS[type]).toBeTruthy()
  })

  it('durationText：区间与单值', () => {
    expect(durationText({ min: 5, max: 20 })).toBe('5–20 分钟')
    expect(durationText({ min: 5, max: 5 })).toBe('约 5 分钟')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd src
npx vitest run app/lib/filter.test.ts app/lib/labels.test.ts
```

期望：FAIL（模块不存在）。

- [ ] **Step 3: 实现 `filter.ts` 与 `labels.ts`**

`src/app/lib/filter.ts`：

```ts
import { GAME_TYPES, type GameSummary, type GameType } from '@/data/types'

export type SortKey = 'new' | 'name' | 'duration'
export type DurationBucket = 'short' | 'mid' | 'long'

export interface FilterState {
  q: string
  type: GameType | 'all'
  tags: string[]
  dur: DurationBucket | 'all'
  sort: SortKey
}

export const DEFAULT_FILTER: FilterState = { q: '', type: 'all', tags: [], dur: 'all', sort: 'new' }

export function parseFilterState(query: Record<string, unknown>): FilterState {
  const asString = (v: unknown) => (typeof v === 'string' ? v : '')
  const type = asString(query.type)
  const dur = asString(query.dur)
  const sort = asString(query.sort)
  const tag = asString(query.tag)
  return {
    q: asString(query.q).trim(),
    type: (GAME_TYPES as readonly string[]).includes(type) ? (type as GameType) : 'all',
    tags: tag ? tag.split(',').filter(Boolean) : [],
    dur: ['short', 'mid', 'long'].includes(dur) ? (dur as DurationBucket) : 'all',
    sort: ['new', 'name', 'duration'].includes(sort) ? (sort as SortKey) : 'new'
  }
}

export function toQuery(state: FilterState): Record<string, string> {
  const query: Record<string, string> = {}
  if (state.q) query.q = state.q
  if (state.type !== 'all') query.type = state.type
  if (state.tags.length) query.tag = state.tags.join(',')
  if (state.dur !== 'all') query.dur = state.dur
  if (state.sort !== 'new') query.sort = state.sort
  return query
}

export function durationBucket(game: GameSummary): DurationBucket {
  const max = game.durationMinutes.max
  if (max <= 5) return 'short'
  if (max <= 30) return 'mid'
  return 'long'
}

export function filterGames(games: GameSummary[], state: FilterState): GameSummary[] {
  const q = state.q.trim().toLowerCase()
  const result = games.filter((game) => {
    if (state.type !== 'all' && game.type !== state.type) return false
    if (state.tags.length && !state.tags.every((tag) => game.tags.includes(tag))) return false
    if (state.dur !== 'all' && durationBucket(game) !== state.dur) return false
    if (q) {
      const haystack = [game.name, game.description, game.author.name, ...game.tags].join(' ').toLowerCase()
      if (!haystack.includes(q)) return false
    }
    return true
  })
  const sorted = [...result]
  if (state.sort === 'new') sorted.sort((a, b) => b.addedAt.localeCompare(a.addedAt) || a.id.localeCompare(b.id))
  else if (state.sort === 'duration') {
    sorted.sort((a, b) =>
      a.durationMinutes.min - b.durationMinutes.min ||
      a.durationMinutes.max - b.durationMinutes.max ||
      a.id.localeCompare(b.id)
    )
  } else sorted.sort((a, b) => a.name.localeCompare(b.name, 'zh') || a.id.localeCompare(b.id))
  return sorted
}
```

`src/app/lib/labels.ts`：

```ts
import type { GameType } from '@/data/types'

export const GAME_TYPE_LABELS: Record<GameType, string> = {
  puzzle: '解谜',
  action: '动作',
  idle: '放置',
  strategy: '策略',
  simulation: '模拟',
  narrative: '文字叙事',
  music: '音乐',
  creative: '创意',
  casual: '休闲',
  other: '其他'
}

export function durationText(duration: { min: number; max: number }): string {
  return duration.min === duration.max ? `约 ${duration.min} 分钟` : `${duration.min}–${duration.max} 分钟`
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd src
npx vitest run app/lib   # 期望：全部 PASS
```

- [ ] **Step 5: 提交**

```bash
git add src/app/lib
git commit -m "feat: add filter, sort and label utilities with tests"
```

---

### Task 5: markdown 渲染、TOC 提取与封面兜底纯函数

**Files:**
- Create: `src/app/lib/markdown.ts`
- Create: `src/app/lib/markdown.test.ts`
- Create: `src/app/lib/cover.ts`
- Create: `src/app/lib/cover.test.ts`

**Interfaces:**
- Consumes: 无（纯函数）
- Produces:
  - `TocItem { level: 2 | 3; text: string; id: string }`
  - `renderMarkdown(source: string): string`（h2/h3 自动加锚点 id，其余交给 markdown-it）
  - `extractToc(source: string): TocItem[]`（仅 h2/h3，slug 与渲染结果一致）
  - `hashString(input: string): number`、`coverGradient(id: string): [string, string]`、`coverInitial(name: string): string`

- [ ] **Step 1: 写失败测试**

`src/app/lib/markdown.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { extractToc, renderMarkdown } from './markdown'

describe('extractToc', () => {
  it('只提取 h2/h3，忽略 h1/h4', () => {
    const toc = extractToc('# 标题\n\n## 第一节\n\n### 小节\n\n#### 更深\n')
    expect(toc.map((t) => [t.level, t.text])).toEqual([[2, '第一节'], [3, '小节']])
  })

  it('中文标题保留，标点被去掉', () => {
    const [item] = extractToc('## 怎么玩：新手教程！\n')
    expect(item.id).toBe('怎么玩新手教程')
  })

  it('同名标题自动去重（-2 后缀）', () => {
    const toc = extractToc('## 玩法\n\n## 玩法\n')
    expect(toc.map((t) => t.id)).toEqual(['玩法', '玩法-2'])
  })

  it('空标题回退 section', () => {
    const [item] = extractToc('## ！！！\n')
    expect(item.id).toBe('section')
  })
})

describe('renderMarkdown', () => {
  it('渲染出的 h2/h3 带与 TOC 一致的 id', () => {
    const html = renderMarkdown('## 第一节\n\n正文\n\n### 小节\n')
    expect(html).toContain('id="第一节"')
    expect(html).toContain('id="小节"')
    expect(html).toContain('<p>正文</p>')
  })

  it('不渲染原始 HTML（html: false）', () => {
    expect(renderMarkdown('<script>alert(1)</script>')).not.toContain('<script>')
  })
})
```

`src/app/lib/cover.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { coverGradient, coverInitial, hashString } from './cover'

describe('cover fallback', () => {
  it('hashString 与 coverGradient 对同一 id 稳定，且色相在 0-359', () => {
    expect(hashString('2048')).toBe(hashString('2048'))
    const [from, to] = coverGradient('2048')
    for (const color of [from, to]) {
      const hue = Number(/hsl\((\d+)/.exec(color)?.[1])
      expect(hue).toBeGreaterThanOrEqual(0)
      expect(hue).toBeLessThan(360)
    }
    expect(coverGradient('2048')).toEqual(coverGradient('2048'))
  })

  it('不同 id 通常不同色（样例要不同）', () => {
    expect(coverGradient('2048')).not.toEqual(coverGradient('hextris'))
  })

  it('coverInitial 支持中文、emoji 与空串', () => {
    expect(coverInitial('  黑暗房间 ')).toBe('黑')
    expect(coverInitial('🎮游戏')).toBe('🎮')
    expect(coverInitial('')).toBe('?')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd src
npx vitest run app/lib/markdown.test.ts app/lib/cover.test.ts
```

期望：FAIL。

- [ ] **Step 3: 实现**

`src/app/lib/markdown.ts`：

```ts
import MarkdownIt from 'markdown-it'
import type Token from 'markdown-it/lib/token.mjs'

const md = new MarkdownIt({ html: false, linkify: true })

export interface TocItem {
  level: 2 | 3
  text: string
  id: string
}

function slugify(text: string): string {
  const slug = text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}-]/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return slug || 'section'
}

function walkHeadings(tokens: Token[]): Array<{ token: Token; item: TocItem }> {
  const used = new Map<string, number>()
  const found: Array<{ token: Token; item: TocItem }> = []
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (token.type !== 'heading_open' || (token.tag !== 'h2' && token.tag !== 'h3')) continue
    const inline = tokens[i + 1]
    const text = (inline?.children ?? [])
      .filter((child) => child.type === 'text' || child.type === 'code_inline')
      .map((child) => child.content)
      .join('')
      .trim()
    const base = slugify(text)
    const count = (used.get(base) ?? 0) + 1
    used.set(base, count)
    found.push({ token, item: { level: token.tag === 'h2' ? 2 : 3, text, id: count === 1 ? base : `${base}-${count}` } })
  }
  return found
}

export function renderMarkdown(source: string): string {
  const env: Record<string, unknown> = {}
  const tokens = md.parse(source, env)
  for (const { token, item } of walkHeadings(tokens)) token.attrSet('id', item.id)
  return md.renderer.render(tokens, md.options, env)
}

export function extractToc(source: string): TocItem[] {
  return walkHeadings(md.parse(source, {})).map(({ item }) => item)
}
```

（若 `markdown-it/lib/token.mjs` 的导入路径在安装版本中不同，用 `import type { Token } from 'markdown-it'` 的等价导出替代，逻辑不变。）

`src/app/lib/cover.ts`：

```ts
export function hashString(input: string): number {
  let hash = 0
  for (const char of input) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) | 0
  return Math.abs(hash)
}

export function coverGradient(id: string): [string, string] {
  const hue = hashString(id) % 360
  return [`hsl(${hue} 65% 45%)`, `hsl(${(hue + 50) % 360} 65% 22%)`]
}

export function coverInitial(name: string): string {
  return [...name.trim()][0] ?? '?'
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd src
npx vitest run app/lib   # 期望：全部 PASS
npm run typecheck        # 期望：退出码 0
```

- [ ] **Step 5: 提交**

```bash
git add src/app/lib
git commit -m "feat: add markdown rendering with TOC extraction and cover fallback helpers"
```

---

### Task 6: 应用骨架（App shell + 路由 + 404）

**Files:**
- Modify: `src/app/main.ts`
- Modify: `src/app/App.vue`（替换 Task 1 的临时壳）
- Create: `src/app/router/index.ts`
- Create: `src/app/views/NotFoundView.vue`
- Create: `src/app/views/HomeView.vue`（临时最小实现，Task 7 替换）
- Create: `src/app/views/GameView.vue`（临时最小实现，Task 8 替换）
- Create: `src/app/views/DocsView.vue`（临时最小实现，Task 9 替换）
- Modify: `src/app/styles/main.css`（追加 markdown 正文样式）

**Interfaces:**
- Consumes: Task 1 的入口
- Produces:
  - 路由名：`home` `/`、`game` `/games/:id`（props: id）、`docs` `/docs`（props: slug 可选）、`doc` `/docs/:slug`（props: slug）、`not-found` `*`
  - `scrollBehavior`：hash 平滑滚动、保存位置恢复、默认回顶
  - `.markdown-body` 样式类（Task 8/9 复用）

- [ ] **Step 1: 写路由、shell 与临时页面**

`src/app/router/index.ts`：

```ts
import { createRouter, createWebHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: () => import('@/views/HomeView.vue') },
    { path: '/games/:id', name: 'game', component: () => import('@/views/GameView.vue'), props: true },
    { path: '/docs', name: 'docs', component: () => import('@/views/DocsView.vue') },
    { path: '/docs/:slug', name: 'doc', component: () => import('@/views/DocsView.vue'), props: true },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('@/views/NotFoundView.vue') }
  ],
  scrollBehavior(to, _from, savedPosition) {
    if (savedPosition) return savedPosition
    if (to.hash) return { el: to.hash, behavior: 'smooth' }
    return { top: 0 }
  }
})
```

`src/app/main.ts`：

```ts
import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import './styles/main.css'

createApp(App).use(router).mount('#app')
```

`src/app/App.vue`：

```vue
<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <header class="border-b border-neutral-800">
      <div class="mx-auto max-w-6xl w-full px-4 h-14 flex items-center gap-6">
        <RouterLink to="/" class="font-semibold tracking-wide">网页游戏收藏馆</RouterLink>
        <nav class="flex gap-4 text-sm text-neutral-400">
          <RouterLink to="/" class="hover:text-neutral-100" exact-active-class="text-neutral-100">游戏</RouterLink>
          <RouterLink to="/docs" class="hover:text-neutral-100" active-class="text-neutral-100">文档</RouterLink>
        </nav>
      </div>
    </header>
    <main class="flex-1 mx-auto max-w-6xl w-full px-4 py-6">
      <RouterView />
    </main>
    <footer class="border-t border-neutral-800 text-xs text-neutral-500">
      <div class="mx-auto max-w-6xl w-full px-4 py-4">
        数据来自社区 PR 收录，游戏版权归原作者所有。
      </div>
    </footer>
  </div>
</template>
```

`src/app/views/NotFoundView.vue`：

```vue
<template>
  <div class="py-24 text-center space-y-4">
    <p class="text-5xl font-bold text-neutral-700">404</p>
    <p class="text-neutral-400">页面不存在。</p>
    <RouterLink to="/" class="inline-block text-violet-400 hover:underline">返回目录</RouterLink>
  </div>
</template>
```

临时页面（Task 7/8/9 会替换，先保证路由可构建）：

`src/app/views/HomeView.vue` / `GameView.vue` / `DocsView.vue`：

```vue
<template>
  <div />
</template>
```

- [ ] **Step 2: 追加 markdown 正文样式到 `src/app/styles/main.css`**

```css
@import "tailwindcss";

.markdown-body {
  line-height: 1.75;
  color: var(--color-neutral-300);
}
.markdown-body h2 {
  margin: 1.75rem 0 0.75rem;
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--color-neutral-100);
  scroll-margin-top: 4rem;
}
.markdown-body h3 {
  margin: 1.25rem 0 0.5rem;
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--color-neutral-200);
  scroll-margin-top: 4rem;
}
.markdown-body p { margin: 0.6rem 0; }
.markdown-body a { color: var(--color-violet-400); text-decoration: underline; }
.markdown-body ul, .markdown-body ol { margin: 0.6rem 0; padding-left: 1.4rem; list-style: disc; }
.markdown-body ol { list-style: decimal; }
.markdown-body code {
  background: var(--color-neutral-800);
  border-radius: 0.25rem;
  padding: 0.1rem 0.35rem;
  font-size: 0.875em;
}
.markdown-body pre {
  background: var(--color-neutral-900);
  border: 1px solid var(--color-neutral-800);
  border-radius: 0.5rem;
  padding: 0.75rem 1rem;
  overflow-x: auto;
  margin: 0.75rem 0;
}
.markdown-body pre code { background: transparent; padding: 0; }
.markdown-body blockquote {
  border-left: 3px solid var(--color-neutral-700);
  padding-left: 0.9rem;
  color: var(--color-neutral-400);
  margin: 0.75rem 0;
}
```

- [ ] **Step 3: 验证**

```bash
cd src
npm run typecheck   # 期望：退出码 0
npm run dev         # 人工验证：
#   /            -> 空白（Task 7 实现，允许）
#   /docs        -> 空白（Task 9 实现，允许）
#   /whatever    -> 显示 404 页面
#   页头 游戏/文档 链接可点击
```

- [ ] **Step 4: 提交**

```bash
git add src/app
git commit -m "feat: add app shell, router and 404 page"
```

---

### Task 7: 目录页（搜索 / 筛选 / 排序 / 卡片网格）

**Files:**
- Create: `src/app/composables/useAsync.ts`
- Create: `src/app/composables/useFilterState.ts`
- Create: `src/app/components/StatePanel.vue`
- Create: `src/app/components/GameCover.vue`
- Create: `src/app/components/GameCard.vue`
- Create: `src/app/components/GameFilters.vue`
- Modify: `src/app/views/HomeView.vue`（替换临时实现）

**Interfaces:**
- Consumes: Task 3 `repo`、Task 4 `filter.ts`/`labels.ts`、Task 5 `cover.ts`
- Produces:
  - `useAsync<T>(loader: () => Promise<T>, deps?: Ref<unknown>[]): { data: Ref<T | null>; error: Ref<Error | null>; loading: Ref<boolean>; reload: () => Promise<void> }`
  - `useFilterState(): { state: ComputedRef<FilterState>; update: (patch: Partial<FilterState>) => void }`
  - 组件 props：`StatePanel { loading: boolean; error: Error | null }`（emit `retry`）、`GameCover { game: GameSummary }`、`GameCard { game: GameSummary }`、`GameFilters { games: GameSummary[] }`

- [ ] **Step 1: 写 composables**

`src/app/composables/useAsync.ts`：

```ts
import { ref, watch, type Ref } from 'vue'

export function useAsync<T>(loader: () => Promise<T>, deps: Ref<unknown>[] = []) {
  const data = ref<T | null>(null) as Ref<T | null>
  const error = ref<Error | null>(null)
  const loading = ref(true)
  let runId = 0

  async function reload(): Promise<void> {
    const id = ++runId
    loading.value = true
    error.value = null
    try {
      const result = await loader()
      if (id === runId) data.value = result
    } catch (e) {
      if (id === runId) error.value = e instanceof Error ? e : new Error(String(e))
    } finally {
      if (id === runId) loading.value = false
    }
  }

  watch(deps, reload, { immediate: true })
  return { data, error, loading, reload }
}
```

`src/app/composables/useFilterState.ts`：

```ts
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { parseFilterState, toQuery, type FilterState } from '@/lib/filter'

export function useFilterState() {
  const route = useRoute()
  const router = useRouter()
  const state = computed(() => parseFilterState(route.query))

  function update(patch: Partial<FilterState>): void {
    void router.replace({ query: toQuery({ ...state.value, ...patch }) })
  }

  return { state, update }
}
```

- [ ] **Step 2: 写组件**

`src/app/components/StatePanel.vue`：

```vue
<script setup lang="ts">
defineProps<{ loading: boolean; error: Error | null }>()
defineEmits<{ retry: [] }>()
</script>

<template>
  <div v-if="loading" class="py-24 text-center text-neutral-500">加载中…</div>
  <div v-else-if="error" class="py-24 text-center space-y-3">
    <p class="text-neutral-300">加载失败：{{ error.message }}</p>
    <button class="rounded bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700" @click="$emit('retry')">
      重试
    </button>
  </div>
  <slot v-else />
</template>
```

`src/app/components/GameCover.vue`：

```vue
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { GameSummary } from '@/data/types'
import { coverGradient, coverInitial } from '@/lib/cover'

const props = defineProps<{ game: GameSummary }>()
const failed = ref(false)

watch(() => props.game.cover, () => { failed.value = false })

const gradient = computed(() => {
  const [from, to] = coverGradient(props.game.id)
  return `linear-gradient(135deg, ${from}, ${to})`
})
const initial = computed(() => coverInitial(props.game.name))
</script>

<template>
  <div class="aspect-[16/9] w-full overflow-hidden">
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
      class="h-full w-full flex items-center justify-center text-4xl font-bold text-white/90 select-none"
      :style="{ background: gradient }"
    >
      {{ initial }}
    </div>
  </div>
</template>
```

`src/app/components/GameCard.vue`：

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
    class="group block overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900 transition hover:border-neutral-600"
  >
    <GameCover :game="game" />
    <div class="space-y-2 p-4">
      <div class="flex items-center justify-between gap-2">
        <h2 class="truncate font-medium group-hover:text-white">{{ game.name }}</h2>
        <span class="shrink-0 rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300">
          {{ GAME_TYPE_LABELS[game.type] }}
        </span>
      </div>
      <p class="line-clamp-2 text-sm text-neutral-400">{{ game.description }}</p>
      <div class="flex flex-wrap items-center gap-1.5 text-xs text-neutral-500">
        <span>{{ durationText(game.durationMinutes) }}</span>
        <span v-for="tag in game.tags" :key="tag" class="rounded bg-neutral-800/70 px-1.5 py-0.5">{{ tag }}</span>
      </div>
    </div>
  </RouterLink>
</template>
```

`src/app/components/GameFilters.vue`：

```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { GameSummary, GameType } from '@/data/types'
import { GAME_TYPES } from '@/data/types'
import { GAME_TYPE_LABELS } from '@/lib/labels'
import type { SortKey } from '@/lib/filter'
import { useFilterState } from '@/composables/useFilterState'

const props = defineProps<{ games: GameSummary[] }>()
const { state, update } = useFilterState()

const tagCounts = computed(() => {
  const counts = new Map<string, number>()
  for (const game of props.games) for (const tag of game.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 16)
})

function toggleTag(tag: string): void {
  const tags = state.value.tags.includes(tag)
    ? state.value.tags.filter((t) => t !== tag)
    : [...state.value.tags, tag]
  update({ tags })
}

const durationOptions = [
  { value: 'all', label: '全部时长' },
  { value: 'short', label: '≤5 分钟' },
  { value: 'mid', label: '5–30 分钟' },
  { value: 'long', label: '>30 分钟' }
] as const
</script>

<template>
  <div class="space-y-4">
    <input
      :value="state.q"
      type="search"
      placeholder="搜索游戏名、简介、作者或标签…"
      class="w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm outline-none placeholder:text-neutral-500 focus:border-neutral-600"
      @input="update({ q: ($event.target as HTMLInputElement).value })"
    />

    <div class="flex flex-wrap gap-1.5">
      <button
        class="rounded-full px-3 py-1 text-xs"
        :class="state.type === 'all' ? 'bg-violet-600 text-white' : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'"
        @click="update({ type: 'all' })"
      >全部类型</button>
      <button
        v-for="type in GAME_TYPES"
        :key="type"
        class="rounded-full px-3 py-1 text-xs"
        :class="state.type === type ? 'bg-violet-600 text-white' : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'"
        @click="update({ type: type as GameType })"
      >{{ GAME_TYPE_LABELS[type] }}</button>
    </div>

    <div class="flex flex-wrap gap-1.5">
      <button
        v-for="option in durationOptions"
        :key="option.value"
        class="rounded-full px-3 py-1 text-xs"
        :class="state.dur === option.value ? 'bg-violet-600 text-white' : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'"
        @click="update({ dur: option.value })"
      >{{ option.label }}</button>
    </div>

    <div v-if="tagCounts.length" class="flex flex-wrap gap-1.5">
      <button
        v-for="[tag, count] in tagCounts"
        :key="tag"
        class="rounded-full px-2.5 py-1 text-xs"
        :class="state.tags.includes(tag) ? 'bg-violet-600 text-white' : 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'"
        @click="toggleTag(tag)"
      >{{ tag }} <span class="opacity-60">{{ count }}</span></button>
    </div>

    <div class="flex items-center gap-2 text-xs text-neutral-400">
      <span>排序</span>
      <select
        :value="state.sort"
        class="rounded border border-neutral-800 bg-neutral-900 px-2 py-1"
        @change="update({ sort: ($event.target as HTMLSelectElement).value as SortKey })"
      >
        <option value="new">最新收录</option>
        <option value="name">名称</option>
        <option value="duration">时长（短到长）</option>
      </select>
    </div>
  </div>
</template>
```

（`@click="update({ dur: option.value })"` 中 `option.value` 类型由 `as const` 收窄为字面量联合，可直接传入 `Partial<FilterState>`。）

- [ ] **Step 3: 实现 `HomeView.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { repo, type GameSummary } from '@/data'
import { useAsync } from '@/composables/useAsync'
import { useFilterState } from '@/composables/useFilterState'
import { filterGames } from '@/lib/filter'
import GameCard from '@/components/GameCard.vue'
import GameFilters from '@/components/GameFilters.vue'
import StatePanel from '@/components/StatePanel.vue'

const { data: games, error, loading, reload } = useAsync<GameSummary[]>(() => repo.listGames())
const { state } = useFilterState()
const visible = computed(() => filterGames(games.value ?? [], state.value))
</script>

<template>
  <StatePanel :loading="loading" :error="error" @retry="reload">
    <div class="space-y-6">
      <GameFilters v-if="games?.length" :games="games" />
      <div v-if="visible.length" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <GameCard v-for="game in visible" :key="game.id" :game="game" />
      </div>
      <div v-else class="py-24 text-center text-neutral-500">
        {{ games?.length ? '没有匹配的游戏，试试调整筛选条件。' : '还没有收录游戏。' }}
      </div>
    </div>
  </StatePanel>
</template>
```

- [ ] **Step 4: 验证**

```bash
cd src
npm run typecheck && npx vitest run   # 期望：通过（含既有测试）
npm run dev
```

人工验证（浏览器）：
- `/` 显示 3 张游戏卡片，占位封面分别为 2、H、A 的渐变卡
- 搜索框输入 `黑暗` → 只剩 A Dark Room；URL 出现 `?q=黑暗`
- 点击类型「解谜」→ 只剩 2048；点击标签「数字」与「休闲」→ AND 语义生效
- 时长「≤5 分钟」→ 只剩 Hextris；排序切换「名称」→ 顺序 A Dark Room / Hextris / 2048（locale zh）
- 刷新页面筛选保持；无匹配时显示空状态文案

- [ ] **Step 5: 提交**

```bash
git add src/app
git commit -m "feat: add catalog page with search, filters, sorting and cover fallback"
```

---

### Task 8: 详情页（intro markdown + 外链跳转）

**Files:**
- Modify: `src/app/views/GameView.vue`（替换临时实现）

**Interfaces:**
- Consumes: Task 3 `repo`/`NotFoundError`、Task 5 `renderMarkdown`、Task 7 的 `StatePanel`/`GameCover`/`useAsync`、Task 4 `labels`
- Produces: `/games/:id` 完整页面（无新增导出）

- [ ] **Step 1: 实现 `GameView.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { NotFoundError, repo, type Game } from '@/data'
import { useAsync } from '@/composables/useAsync'
import { renderMarkdown } from '@/lib/markdown'
import { GAME_TYPE_LABELS, durationText } from '@/lib/labels'
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
    <div v-if="notFound" class="py-24 text-center space-y-4">
      <p class="text-neutral-400">该游戏不存在或已移除。</p>
      <RouterLink to="/" class="inline-block text-violet-400 hover:underline">返回目录</RouterLink>
    </div>

    <article v-else-if="game" class="mx-auto max-w-3xl space-y-6">
      <RouterLink to="/" class="inline-block text-sm text-neutral-400 hover:text-neutral-200">← 返回目录</RouterLink>

      <div class="overflow-hidden rounded-xl border border-neutral-800">
        <GameCover :game="game" />
      </div>

      <div class="space-y-3">
        <div class="flex flex-wrap items-center gap-3">
          <h1 class="text-2xl font-semibold">{{ game.name }}</h1>
          <span class="rounded-full bg-neutral-800 px-2.5 py-0.5 text-xs text-neutral-300">
            {{ GAME_TYPE_LABELS[game.type] }}
          </span>
        </div>
        <p class="text-sm text-neutral-400">
          作者：
          <a v-if="game.author.url" :href="game.author.url" target="_blank" rel="noopener noreferrer" class="text-violet-400 hover:underline">
            {{ game.author.name }}
          </a>
          <span v-else>{{ game.author.name }}</span>
          <span class="mx-2 text-neutral-700">·</span>
          预计时长：{{ durationText(game.durationMinutes) }}
          <span class="mx-2 text-neutral-700">·</span>
          收录于 {{ game.addedAt }}
        </p>
        <p class="text-neutral-300">{{ game.description }}</p>
        <div class="flex flex-wrap gap-1.5 text-xs text-neutral-400">
          <span v-for="tag in game.tags" :key="tag" class="rounded bg-neutral-800/70 px-2 py-0.5">{{ tag }}</span>
        </div>
      </div>

      <a
        :href="game.url"
        target="_blank"
        rel="noopener noreferrer"
        class="inline-block rounded-lg bg-violet-600 px-5 py-2.5 font-medium hover:bg-violet-500"
      >开始游戏 ↗</a>

      <div v-if="introHtml" class="markdown-body border-t border-neutral-800 pt-4" v-html="introHtml" />
    </article>
  </StatePanel>
</template>
```

- [ ] **Step 2: 验证**

```bash
cd src
npm run typecheck && npx vitest run
npm run dev
```

人工验证：
- `/games/2048` → 显示名称、作者外链、时长、标签、简介；「开始游戏 ↗」新标签打开 `https://play2048.co/`
- `/games/hextris` → 无 intro 不显示正文区
- `/games/not-exist` → 显示「该游戏不存在或已移除」+ 返回目录
- 目录卡片点击进入详情，返回目录回到原筛选（URL query 保留）

- [ ] **Step 3: 提交**

```bash
git add src/app
git commit -m "feat: add game detail page with markdown intro and external link"
```

---

### Task 9: 文档页（左侧列表 + 右侧 TOC 滚动高亮）

**Files:**
- Create: `src/app/components/DocSidebar.vue`
- Create: `src/app/components/DocToc.vue`
- Modify: `src/app/views/DocsView.vue`（替换临时实现）

**Interfaces:**
- Consumes: Task 3 `repo`、Task 5 `renderMarkdown`/`extractToc`/`TocItem`、Task 7 `StatePanel`/`useAsync`
- Produces: 组件 props `DocSidebar { docs: DocMeta[]; activeSlug: string }`、`DocToc { items: TocItem[] }`；`/docs` 自动跳转第一篇

- [ ] **Step 1: 实现组件**

`src/app/components/DocSidebar.vue`：

```vue
<script setup lang="ts">
import { RouterLink } from 'vue-router'
import type { DocMeta } from '@/data/types'

defineProps<{ docs: DocMeta[]; activeSlug: string }>()
</script>

<template>
  <nav class="space-y-1 text-sm">
    <RouterLink
      v-for="doc in docs"
      :key="doc.slug"
      :to="`/docs/${doc.slug}`"
      class="block rounded px-2 py-1.5"
      :class="doc.slug === activeSlug ? 'bg-neutral-800 text-neutral-100' : 'text-neutral-400 hover:text-neutral-100'"
    >{{ doc.title }}</RouterLink>
  </nav>
</template>
```

`src/app/components/DocToc.vue`：

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
  <nav v-if="items.length" class="sticky top-6 space-y-1 text-xs">
    <p class="mb-2 font-medium text-neutral-400">本页目录</p>
    <a
      v-for="item in items"
      :key="item.id"
      :href="`#${item.id}`"
      class="block rounded px-2 py-1"
      :class="[
        item.level === 3 ? 'pl-4' : '',
        item.id === activeId ? 'text-violet-300' : 'text-neutral-500 hover:text-neutral-300'
      ]"
    >{{ item.text }}</a>
  </nav>
</template>
```

- [ ] **Step 2: 实现 `DocsView.vue`**

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
    <div class="flex gap-8">
      <DocSidebar :docs="docs ?? []" :active-slug="slug ?? ''" class="hidden w-44 shrink-0 sm:block" />
      <article class="min-w-0 flex-1">
        <h1 class="mb-4 text-2xl font-semibold">{{ doc?.title }}</h1>
        <div class="markdown-body" v-html="html" />
      </article>
      <DocToc :items="toc" class="hidden w-44 shrink-0 lg:block" />
    </div>
  </StatePanel>
</template>
```

- [ ] **Step 3: 验证**

```bash
cd src
npm run typecheck && npx vitest run
npm run dev
```

人工验证：
- `/docs` → 自动跳转 `/docs/about`，左侧高亮「关于本站」，右侧 TOC 显示「这是什么 / 收录范围 / 免责声明」
- 点击 TOC 项平滑滚动；滚到「收录范围」时该项文本高亮
- `/docs/contribute` → 切换文档，TOC 更新为「提交一个游戏 / 字段说明」
- `/docs/不存在的` → 显示加载失败 + 重试按钮
- 刷新 `/docs/contribute` 直接进入该文档

- [ ] **Step 4: 提交**

```bash
git add src/app
git commit -m "feat: add docs page with sidebar and scroll-spy table of contents"
```

---

### Task 10: 部署资产（Dockerfile / nginx / .dockerignore）+ 本地镜像验收

**Files:**
- Create: `deploy/Dockerfile`
- Create: `deploy/nginx.conf`
- Create: `.dockerignore`（仓库根）

**Interfaces:**
- Consumes: Task 2 生成流程（`npm run build` 内含 prebuild）、Task 6-9 的完整站点
- Produces: 可运行的本地镜像 `webgame-collection:local`；镜像内 nginx 配置（Task 11/12 的 CI 与 k8s 直接引用）

- [ ] **Step 1: 写三个文件**

`deploy/Dockerfile`：

```dockerfile
FROM node:24-alpine AS build
WORKDIR /app
COPY src/package.json src/package-lock.json ./
RUN npm ci
COPY src/ ./
RUN npm run build

FROM nginx:1.27-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
```

`.dockerignore`（仓库根）：

```gitignore
.git
docs
deploy/k8s
src/node_modules
src/dist
src/public/data
**/*.log
.DS_Store
```

`deploy/nginx.conf`：

```nginx
server {
  listen 80;
  server_name _;
  root /usr/share/nginx/html;
  index index.html;

  gzip on;
  gzip_types text/css application/javascript application/json image/svg+xml;
  gzip_min_length 1024;

  location = /index.html {
    add_header Cache-Control "no-cache";
  }

  location /assets/ {
    add_header Cache-Control "public, max-age=31536000, immutable";
    try_files $uri =404;
  }

  location /data/ {
    add_header Cache-Control "no-cache";
    try_files $uri =404;
  }

  location / {
    try_files $uri /index.html;
  }
}
```

- [ ] **Step 2: 构建并运行镜像**

```bash
docker build -f deploy/Dockerfile -t webgame-collection:local .
docker run --rm -d -p 8080:80 --name wgc-smoke webgame-collection:local
```

- [ ] **Step 3: 验收（关键断言）**

```bash
# 首页 200
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/                       # 期望 200
# SPA fallback：详情路由直连可打开
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/games/2048              # 期望 200
# 数据文件存在且 content-type 为 JSON
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' http://localhost:8080/data/index.json
# 缓存头
curl -sI http://localhost:8080/data/index.json | grep -i 'cache-control'               # 期望 no-cache
curl -sI "http://localhost:8080/$(cd src/dist && ls assets/*.js | head -1)" | grep -i 'cache-control'  # 期望 immutable
# 文档数据
curl -s http://localhost:8080/data/docs.json | head -c 200                             # 期望包含 "slug": "about"
```

浏览器打开 `http://localhost:8080/` 快速过一遍目录页、详情页与 `/docs/about`（与 dev 一致）。

```bash
docker stop wgc-smoke
```

- [ ] **Step 4: 提交**

```bash
git add deploy/Dockerfile deploy/nginx.conf .dockerignore
git commit -m "feat: add production docker image with nginx config"
```

---

### Task 11: CI（PR 校验 + 发布推 GHCR + keel webhook）

**Files:**
- Create: `.github/workflows/validate.yml`
- Create: `.github/workflows/publish.yml`
- Create: `src/scripts/repo-yaml.test.ts`（校验 workflows YAML）
- Modify: `src/package.json`（加 `yaml` devDependency）

**Interfaces:**
- Consumes: Task 2 的 `validate:data`/`check` 脚本、Task 10 的 `deploy/Dockerfile`
- Produces: 推 `main` 后镜像 `ghcr.io/<owner>/webgame-collection:latest` + `sha-<long>`；keel native webhook 调用（secrets 未配置则跳过）

- [ ] **Step 1: 写失败测试 `src/scripts/repo-yaml.test.ts`**

```ts
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'
import { SRC_ROOT } from './build-data.mjs'

const REPO_ROOT = path.resolve(SRC_ROOT, '..')

async function loadYaml(relative: string): Promise<Record<string, any>> {
  return parse(await readFile(path.join(REPO_ROOT, relative), 'utf8'))
}

describe('GitHub workflows', () => {
  it('validate.yml 在 PR 上跑数据校验与完整检查', async () => {
    const workflow = await loadYaml('.github/workflows/validate.yml')
    expect(Object.keys(workflow.on).map(String)).toContain('pull_request')
    const body = JSON.stringify(workflow)
    expect(body).toContain('npm ci')
    expect(body).toContain('validate:data')
    expect(body).toContain('npm run check')
  })

  it('publish.yml 推到 GHCR 并调用 keel webhook', async () => {
    const workflow = await loadYaml('.github/workflows/publish.yml')
    const steps = workflow.jobs.publish.steps as Array<Record<string, unknown>>
    expect(steps.some((step) => String(step.uses ?? '').startsWith('docker/build-push-action'))).toBe(true)
    expect(steps.some((step) => String(step.uses ?? '').startsWith('docker/login-action'))).toBe(true)
    const body = JSON.stringify(workflow)
    expect(body).toContain('ghcr.io')
    expect(body).toContain('keel:${KEEL_TOKEN}')
    expect(body).toContain('KEEL_WEBHOOK_URL')
    expect(body).toContain('deploy/Dockerfile')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd src
npm install -D yaml
npx vitest run scripts/repo-yaml.test.ts
```

期望：FAIL（workflow 文件不存在）。

- [ ] **Step 3: 写 workflows**

`.github/workflows/validate.yml`：

```yaml
name: validate

on:
  pull_request:
    paths:
      - 'src/**'
      - '.github/workflows/validate.yml'

jobs:
  check:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: src
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
          cache-dependency-path: src/package-lock.json
      - name: Install
        run: npm ci
      - name: Validate game data
        run: npm run validate:data
      - name: Check (vitest + typecheck + build)
        run: npm run check
```

`.github/workflows/publish.yml`：

```yaml
name: publish

on:
  push:
    branches: [main]
  workflow_dispatch:

concurrency:
  group: publish-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read
  packages: write

env:
  IMAGE: ghcr.io/${{ github.repository }}

jobs:
  publish:
    runs-on: ubuntu-latest
    env:
      KEEL_WEBHOOK_URL: ${{ secrets.KEEL_WEBHOOK_URL }}
      KEEL_TOKEN: ${{ secrets.KEEL_TOKEN }}
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/metadata-action@v5
        id: meta
        with:
          images: ${{ env.IMAGE }}
          tags: |
            type=sha,format=long
            type=raw,value=latest
      - uses: docker/build-push-action@v6
        with:
          context: .
          file: deploy/Dockerfile
          push: true
          tags: ${{ steps.meta.outputs.tags }}
      - name: Notify keel
        if: env.KEEL_WEBHOOK_URL != ''
        run: |
          curl -fsS -X POST "${KEEL_WEBHOOK_URL}" \
            -u "keel:${KEEL_TOKEN}" \
            -H 'Content-Type: application/json' \
            -d "{\"name\":\"${IMAGE}\",\"tag\":\"latest\"}"
      - name: Keel skipped
        if: env.KEEL_WEBHOOK_URL == ''
        run: echo "KEEL_WEBHOOK_URL 未配置，跳过 webhook 通知（依赖 keel 轮询兜底）"
```

- [ ] **Step 4: 验证**

```bash
cd src
npx vitest run scripts/repo-yaml.test.ts   # 期望：全部 PASS
# 本地模拟 validate workflow 的两条命令：
npm run validate:data && npm run check     # 期望：全部通过
```

（发布 workflow 依赖 GitHub 远端与集群 secret，无法本地执行；Task 12 收尾时在 README 中记录远端配置步骤。）

- [ ] **Step 5: 提交**

```bash
git add .github src/scripts src/package.json src/package-lock.json
git commit -m "ci: validate data on PR, publish image to ghcr and notify keel on main"
```

---

### Task 12: k8s 清单 + 仓库文档（README / CONTRIBUTING / LICENSE）+ 端到端验收

**Files:**
- Create: `deploy/k8s/namespace.yaml`
- Create: `deploy/k8s/deployment.yaml`
- Create: `deploy/k8s/service.yaml`
- Create: `deploy/k8s/ingress.yaml`
- Modify: `src/scripts/repo-yaml.test.ts`（追加 k8s 断言）
- Create: `docs/README.md`
- Create: `docs/CONTRIBUTING.md`
- Create: `LICENSE`

**Interfaces:**
- Consumes: Task 11 的测试文件与测试基建；Task 10 的镜像名约定
- Produces: 可 `kubectl apply -f deploy/k8s/` 的清单；GitHub 首页 README 与贡献指南；MIT LICENSE

- [ ] **Step 1: 追加失败测试（k8s 部分）到 `src/scripts/repo-yaml.test.ts`**

在文件末尾追加：

```ts
describe('k8s manifests', () => {
  const files = ['namespace.yaml', 'deployment.yaml', 'service.yaml', 'ingress.yaml']

  it('全部可解析且命名空间一致', async () => {
    for (const file of files) {
      const doc = await loadYaml(`deploy/k8s/${file}`)
      expect(doc, `${file} 无法解析`).toBeTruthy()
      if (doc.metadata?.namespace) expect(doc.metadata.namespace).toBe('webgame-collection')
      else expect(doc.metadata?.name).toBe('webgame-collection')
    }
  })

  it('deployment 带 keel 注解、镜像指向 ghcr、带探针与资源限制', async () => {
    const deployment = await loadYaml('deploy/k8s/deployment.yaml')
    const annotations = deployment.metadata.annotations
    expect(annotations['keel.sh/policy']).toBe('force')
    expect(annotations['keel.sh/match-tag']).toBe('true')
    expect(annotations['keel.sh/trigger']).toBe('poll')
    const container = deployment.spec.template.spec.containers[0]
    expect(container.image).toContain('ghcr.io/')
    expect(container.image.endsWith(':latest')).toBe(true)
    expect(container.readinessProbe.httpGet.path).toBe('/')
    expect(container.resources.requests).toBeTruthy()
    expect(container.resources.limits).toBeTruthy()
  })

  it('service 指向应用端口 80', async () => {
    const service = await loadYaml('deploy/k8s/service.yaml')
    expect(service.spec.ports[0].port).toBe(80)
    expect(service.spec.selector.app).toBe('webgame-collection')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd src
npx vitest run scripts/repo-yaml.test.ts
```

期望：k8s 部分 FAIL（文件不存在）。

- [ ] **Step 3: 写 k8s 清单**

`deploy/k8s/namespace.yaml`：

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: webgame-collection
```

`deploy/k8s/deployment.yaml`：

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: webgame-collection
  namespace: webgame-collection
  annotations:
    keel.sh/policy: force
    keel.sh/match-tag: "true"
    keel.sh/trigger: poll
    keel.sh/pollSchedule: "@every 5m"
spec:
  replicas: 2
  strategy:
    type: RollingUpdate
  selector:
    matchLabels:
      app: webgame-collection
  template:
    metadata:
      labels:
        app: webgame-collection
    spec:
      containers:
        - name: web
          image: ghcr.io/OWNER/webgame-collection:latest
          imagePullPolicy: Always
          ports:
            - containerPort: 80
          readinessProbe:
            httpGet:
              path: /
              port: 80
            initialDelaySeconds: 2
            periodSeconds: 10
          resources:
            requests:
              cpu: 10m
              memory: 16Mi
            limits:
              cpu: 200m
              memory: 128Mi
```

（提交前把 `OWNER` 替换为实际 GitHub 用户名/组织名；这是唯一的仓库变量，CI 侧镜像名由 `github.repository` 自动推导。）

`deploy/k8s/service.yaml`：

```yaml
apiVersion: v1
kind: Service
metadata:
  name: webgame-collection
  namespace: webgame-collection
spec:
  selector:
    app: webgame-collection
  ports:
    - port: 80
      targetPort: 80
```

`deploy/k8s/ingress.yaml`（k3s 默认 Traefik）：

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: webgame-collection
  namespace: webgame-collection
spec:
  rules:
    - host: games.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: webgame-collection
                port:
                  number: 80
```

（`host` 替换为实际域名；如需 TLS，按集群 cert-manager 配置追加 `tls` 段与 `cert-manager.io/cluster-issuer` 注解。）

- [ ] **Step 4: 跑测试确认通过**

```bash
cd src
npx vitest run scripts/repo-yaml.test.ts   # 期望：全部 PASS
npm run check                              # 期望：全绿
```

- [ ] **Step 5: 写仓库文档**

`docs/README.md`：

````md
# webgame-collection

收集**静态网页游戏**（打开网页即玩、无需服务端）的开源目录站。

- 站点：Vue 3 静态构建；目录页支持搜索、按类型/时长/标签筛选与排序
- 详情页：简介（支持 Markdown）与外链跳转
- 文档：内置 Markdown 渲染，带文档目录（TOC）
- 部署：GitHub Actions 构建镜像 → GHCR → keel.sh webhook → k3s 滚动更新

## 提交一个游戏

1. 在 `src/games/` 新增 `<id>.json`（`id` 仅含小写字母、数字、连字符，且与文件名一致）
2. 本地校验：`cd src && npm install && npm run validate:data`
3. 提 PR，CI 会跑数据校验与完整检查

字段与规则详见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## 本地开发

```bash
cd src
npm install
npm run dev      # 自动生成 src/public/data
npm run check    # vitest + vue-tsc + vite build
```

生产形态本地验收：

```bash
docker build -f deploy/Dockerfile -t webgame-collection:local .
docker run --rm -p 8080:80 webgame-collection:local
```

## 部署

1. 推送 `main` 后 Actions 自动推送镜像 `ghcr.io/<owner>/webgame-collection:{latest,sha-<long>}`（首次需把 Package 可见性设为 public）
2. k3s：替换 `deploy/k8s/deployment.yaml` 中的 `OWNER`、`deploy/k8s/ingress.yaml` 中的 `host` 后 `kubectl apply -f deploy/k8s/`
3. keel：集群内安装 [keel.sh](https://keel.sh)（`helm upgrade --install keel --namespace=keel keel/keel --set helmProvider.enabled=false`），仓库 Secrets 配置 `KEEL_WEBHOOK_URL`（如 `http://keel.keel.svc.cluster.local:9300/v1/webhooks/native`）与 `KEEL_TOKEN`（keel 的 `TOKEN_SECRET`；keel 未开 `AUTHENTICATED_WEBHOOKS` 时留空即可）
4. 发布链路：推镜像后 Action POST keel native webhook（`{"name":"<镜像>","tag":"latest"}`），keel 滚动更新 Deployment；webhook 不可用时依赖 `@every 5m` 轮询兜底

设计文档：[`docs/superpowers/specs/2026-09-17-webgame-collection-design.md`](./superpowers/specs/2026-09-17-webgame-collection-design.md)
````

`docs/CONTRIBUTING.md`：

````md
# 贡献指南

## 提交游戏

1. Fork 仓库并新建分支
2. 在 `src/games/` 新增 `<id>.json`，参考现有文件：

```json
{
  "id": "your-game",
  "name": "游戏名",
  "url": "https://example.com/",
  "author": { "name": "作者", "url": "https://github.com/author" },
  "description": "一句话简介（≤140 字）",
  "intro": "可选，详情页展示的 Markdown 长简介",
  "durationMinutes": { "min": 5, "max": 20 },
  "type": "puzzle",
  "tags": ["休闲"],
  "cover": "/data/assets/covers/your-game.png",
  "addedAt": "2026-09-17"
}
```

3. 校验：`cd src && npm install && npm run validate:data`（CI 同样会跑）
4. 提 PR，描述游戏玩法与链接来源

## 硬性规则（CI 会拒绝）

- `id` 必须等于文件名，仅含 `[a-z0-9-]`
- 字段不允许自创（schema 为 `additionalProperties: false`）
- `url` 与封面外链仅允许 https
- `tags` 最多 8 个、每个不超过 12 字、不允许重复
- `type` 只能取枚举值：`puzzle | action | idle | strategy | simulation | narrative | music | creative | casual | other`
- 本地封面只能放在 `src/assets/covers/<id>.<png|jpg|jpeg|webp|avif|gif>`，并在 JSON 中写 `/data/assets/covers/<id>.<ext>`
- `durationMinutes.max >= min` 且 `max <= 600`

## 提交站点文档

- 文档放在 `src/docs/*.md`，文件名即 URL slug（`[a-z0-9-]+`）
- frontmatter 仅支持 `title`（必填）与 `order`（可选，数字，越小越靠前）
- 正文从 `##` 开始（页面标题已由 `title` 渲染）

## 改代码

```bash
cd src
npm install
npm run dev        # 本地开发
npm run check      # 提交前必须全绿：vitest + vue-tsc + vite build
```

- 数据层改动保持 `ContentRepository` 接口不变（未来接后端的迁移边界）
- 需要新字段时同时更新 `src/schema/game.schema.json`、`src/app/data/types.ts`、本文件与 spec
````

`LICENSE`（MIT 标准文本，Copyright 行）：

```
MIT License

Copyright (c) 2026 webgame-collection contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 6: 端到端本地验收（对照 spec §11）**

```bash
cd src
# 1. 合法数据通过 / 非法数据报错（验收 schema 严格性）
cp games/2048.json /tmp/2048.bak
node -e "const g=require('./games/2048.json'); g.id='wrong-id'; require('fs').writeFileSync('games/2048.json', JSON.stringify(g))"
npm run validate:data; echo "exit=$?"          # 期望退出码 1，报错信息含 “id ... 必须等于文件名”
cp /tmp/2048.bak games/2048.json
npm run validate:data                           # 期望“校验通过：3 个游戏，2 篇文档”

# 2. 全量门槛
npm run check                                   # 期望全绿

# 3. 生产形态（若本任务未重复构建，可复用 Task 10 镜像流程）
docker build -f ../deploy/Dockerfile -t webgame-collection:local ..
docker run --rm -d -p 8080:80 --name wgc-final webgame-collection:local
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8080/games/2048   # 期望 200
docker stop wgc-final
```

浏览器人工过一遍：目录筛选 + URL 可分享、详情页外链、`/docs/about` TOC 高亮。

- [ ] **Step 7: 提交**

```bash
git add -A
git commit -m "chore: add k8s manifests, repo docs and license"
```

---

## 用户侧收尾（不在本计划自动执行，README 已记录）

- 在 GitHub 创建仓库并推送（`gh repo create webgame-collection --public --source=. --push`）
- GHCR Package 可见性设为 public
- 集群安装 keel 并配置 secrets `KEEL_WEBHOOK_URL` / `KEEL_TOKEN`
- 替换 `deploy/k8s/deployment.yaml` 的 `OWNER` 与 `ingress.yaml` 的 `host`，`kubectl apply -f deploy/k8s/`
- 合并首个游戏 PR 验证 validate.yml；推 main 验证 publish.yml → GHCR → keel → 滚动更新
