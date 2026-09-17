# 游戏内嵌运行时（Game Runtime）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有静态目录站上实现"后端下发游戏包 + 站内隔离运行"的前端运行时：A 模式（Service Worker 虚拟源）与 C 模式（后端静态托管）共用沙箱、桥协议与存档抽象，可逐游戏选择并自动降级。

**Architecture:** 每个游戏一个子域 `<id>.<gamesBaseDomain>` 作为独立源。A 模式由 `dist/bootstrap/`（shell 页面）注册 `dist/sw.js`，SW 从后端契约拉 zip → 校验 → 解包进 Cache API → 把该源的所有请求映射到包内文件；C 模式由后端直接服务文件。游戏页由 SW/服务端注入 `dist/agent.js` 作为首个脚本，与宿主 `GameHost.vue` 通过 MessagePort 桥通信。宿主只实现一套播放器，投递差异在 `adapters.ts`。

**Tech Stack:** Vue 3 · TypeScript · Vite（多入口 + 独立 lib 构建）· Vitest · fflate（SW 解包 / 夹具打包）· Playwright（e2e）· happy-dom（Agent 单测）· Node http（本地/e2e 多源 mock 服务）

**Spec:** `docs/superpowers/specs/2026-09-17-game-runtime-design.md`

## Global Constraints

- 站点 npm 工程根 = `src/`；所有 `npm` 命令在 `src/` 执行（Docker/CI 亦然）。
- TypeScript strict，`verbatimModuleSyntax: true`；`@` 别名只指向 `src/app`，`src/runtime/**` 内部一律相对导入。
- 测试与源码同目录同名：`foo.ts` ↔ `foo.test.ts`（Vitest，`npm test`）；需要 DOM 的测试文件顶部写 `// @vitest-environment happy-dom`。
- 新增运行时依赖只允许 `fflate`；新增 devDependencies 只允许 `@playwright/test`、`happy-dom`。
- 固定构建产物路径（不受 hash 影响）：`dist/bootstrap/index.html`、`dist/sw.js`、`dist/agent.js`。
- 子域模型：`<id>.<gamesBaseDomain>`，`id` 满足 `^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$`，保留字 `www api cdn assets static admin status play` 与 `__` 前缀；`id` 发布后不可变。
- 安全默认（spec §6）：iframe `sandbox="allow-scripts allow-same-origin allow-pointer-lock"`；`features` 默认 `{ eval:false, inlineScript:false, inlineStyle:true, wasm:true, coop:false, fullscreen:true, gamepad:false }`；未命中资产一律 404 绝不回源；Agent 剥夺 `serviceWorker.register/unregister/getRegistrations` 与 `document.domain` setter。
- 宿主不使用 cookie 鉴权；宿主与游戏都不得设置 `document.domain`。
- 环境变量：`VITE_GAMES_BASE_DOMAIN`（默认 `games.example.com`）、`VITE_HOST_ORIGIN`（默认 `https://games.example.com`）、`VITE_DATA_BASE_URL`（已有，默认 `/data`）。
- 桥协议版本 `PROTOCOL_VERSION = 1`，握手超时 10000ms。
- 存档抽象本期只实现 `LocalSaveProvider`，snapshot 上限 512 KiB。
- 提交规范：conventional commits（`feat:` / `fix:` / `test:` / `chore:` / `ci:` / `docs:`），每个 Task 结束提交一次。
- `npm run check`（vitest + vue-tsc + vite build）在全部任务结束时必须为绿。

---

## 文件结构总览

```
src/
├─ runtime/
│  ├─ bridge/protocol.ts          # 协议类型、常量、校验（宿主/agent/shell/SW 共用）
│  ├─ sw/{index,mime,router,csp,unzip,meta}.ts
│  ├─ agent/index.ts              # 注入脚本（happy-dom 单测）
│  ├─ host/{config,adapters,useGameFrame}.ts + GameHost.vue
├─ bootstrap/{index.html,main.ts} # shell 页面（独立 HTML 入口）
├─ fixtures/{catalog,games}       # 夹具目录与夹具游戏（仅测试/本地）
├─ e2e/                           # Playwright 用例
├─ scripts/{build-data.mjs, build-fixtures.mjs, build-runtime.mjs, serve-runtime.mjs}
└─ playwright.config.ts
```

---

### Task 1: schema v2 与数据层透传

**Files:**
- Modify: `src/schema/game.schema.json`
- Modify: `src/app/data/types.ts`
- Modify: `src/scripts/build-data.mjs`
- Modify: `src/scripts/build-data.test.ts`
- Modify: `src/app/data/staticRepo.ts`（仅补充运行时字段的轻量断言）

**Interfaces:**
- Consumes: 现有 schema/构建脚本/类型
- Produces: `Game.runtime/version/entry/bundle/features/display/fallback/playOrigin/hostedUrl` 字段；`RESERVED_GAME_IDS`；`pickGame` 透传新字段；`GameSummary.runtime?: GameRuntimeMode`

- [ ] **Step 1: 写失败测试（build-data.test.ts 追加）**

```ts
// src/scripts/build-data.test.ts 末尾追加
import { loadGames, RESERVED_GAME_IDS } from './build-data.mjs'

const baseGame = {
  id: 'virtual-demo', name: 'V', url: 'https://example.com/', author: { name: 'a' },
  description: 'd', durationMinutes: { min: 1, max: 2 }, type: 'puzzle', tags: ['x'], addedAt: '2026-09-17'
}

test('runtime=virtual 必须带 version 与 bundle', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'games-'))
  await writeFile(join(dir, 'virtual-demo.json'), JSON.stringify({ ...baseGame, runtime: 'virtual' }))
  const { errors } = await loadGames({ gamesDir: dir, coversDir: dir, validate: makeValidator() })
  expect(errors.join('\n')).toMatch(/version/)
})

test('runtime=hosted 必须带 hostedUrl', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'games-'))
  await writeFile(join(dir, 'virtual-demo.json'), JSON.stringify({ ...baseGame, runtime: 'hosted' }))
  const { errors } = await loadGames({ gamesDir: dir, coversDir: dir, validate: makeValidator() })
  expect(errors.join('\n')).toMatch(/hostedUrl/)
})

test('保留字 id 被拒绝', async () => {
  expect(RESERVED_GAME_IDS.has('api')).toBe(true)
  const dir = await mkdtemp(join(tmpdir(), 'games-'))
  await writeFile(join(dir, 'api.json'), JSON.stringify({ ...baseGame, id: 'api' }))
  const { errors } = await loadGames({ gamesDir: dir, coversDir: dir, validate: makeValidator() })
  expect(errors.join('\n')).toMatch(/保留|reserved/)
})

test('features 未知键被拒绝', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'games-'))
  await writeFile(join(dir, 'virtual-demo.json'), JSON.stringify({
    ...baseGame, runtime: 'virtual', version: 'v1',
    bundle: { url: '/data/bundles/virtual-demo.zip', bytes: 1, sha256: 'a'.repeat(64) },
    features: { nope: true }
  }))
  const { errors } = await loadGames({ gamesDir: dir, coversDir: dir, validate: makeValidator() })
  expect(errors.length).toBeGreaterThan(0)
})
```

其中 `makeValidator()` 读取 `src/schema/game.schema.json`（同文件已有校验器测试可复用，若不存在则新增 `createValidator(JSON.parse(readFile))`）。同时给 `build-data.test.ts` 顶部补 `import { mkdtemp, writeFile } from 'node:fs/promises'`、`import { tmpdir } from 'node:os'`、`import { join } from 'node:path'`、`import { test, expect } from 'vitest'`（若已存在则合并）。

- [ ] **Step 2: 运行测试确认失败**

Run: `cd src && npx vitest run scripts/build-data.test.ts`
Expected: FAIL（未知字段/缺 version 未被拦截，或 `RESERVED_GAME_IDS` 未导出）

- [ ] **Step 3: 更新 schema**

`src/schema/game.schema.json` 改动：

```jsonc
{
  // id 收敛为 DNS label，并新增字段
  "id": { "type": "string", "pattern": "^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$" },
  "runtime": { "enum": ["external", "virtual", "hosted"] },
  "version": { "type": "string", "pattern": "^[a-z0-9][a-z0-9._-]{0,63}$" },
  "entry": { "type": "string", "pattern": "^[a-zA-Z0-9._/-]+$", "maxLength": 255 },
  "playOrigin": { "type": "string", "pattern": "^(https://[^\\s]+|http://[a-z0-9-]+\\.localhost(:\\d+)?)$" },
  "hostedUrl": { "type": "string", "pattern": "^https://[^\\s]+$" },
  "bundle": {
    "type": "object", "additionalProperties": false,
    "required": ["url", "bytes", "sha256"],
    "properties": {
      "url": { "type": "string", "pattern": "^(https://[^\\s]+|/data/bundles/)" },
      "bytes": { "type": "integer", "minimum": 1 },
      "sha256": { "type": "string", "pattern": "^[0-9a-f]{64}$" }
    }
  },
  "features": {
    "type": "object", "additionalProperties": false,
    "properties": {
      "eval": { "type": "boolean" }, "inlineScript": { "type": "boolean" },
      "inlineStyle": { "type": "boolean" }, "wasm": { "type": "boolean" },
      "coop": { "type": "boolean" }, "fullscreen": { "type": "boolean" }, "gamepad": { "type": "boolean" }
    }
  },
  "display": {
    "type": "object", "additionalProperties": false,
    "properties": { "aspect": { "enum": ["16:9", "4:3", "fill"] } }
  },
  "fallback": { "enum": ["external", "hosted", "none"] }
}
// 顶层新增条件（draft 2020-12）：
"allOf": [
  { "if": { "properties": { "runtime": { "const": "virtual" } }, "required": ["runtime"] },
    "then": { "required": ["version", "bundle"] } },
  { "if": { "properties": { "runtime": { "const": "hosted" } }, "required": ["runtime"] },
    "then": { "required": ["hostedUrl"] } }
]
```

- [ ] **Step 4: 更新 build-data.mjs**

```js
export const GAME_ID_PATTERN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/
export const RESERVED_GAME_IDS = new Set(['www', 'api', 'cdn', 'assets', 'static', 'admin', 'status', 'play'])

// loadGames 内、id 等于文件名检查之后追加：
if (RESERVED_GAME_IDS.has(raw.id) || raw.id.startsWith('__')) {
  errors.push(`${label}: id "${raw.id}" 是保留字，禁止使用`)
  continue
}
if (raw.entry?.includes('..') || raw.entry?.startsWith('/')) {
  errors.push(`${label}: entry 必须是包根相对路径且不得包含 ".."`)
  continue
}

// pickGame 透传：
...(game.runtime ? { runtime: game.runtime } : {}),
...(game.version ? { version: game.version } : {}),
...(game.entry ? { entry: game.entry } : {}),
...(game.playOrigin ? { playOrigin: game.playOrigin } : {}),
...(game.hostedUrl ? { hostedUrl: game.hostedUrl } : {}),
...(game.bundle ? { bundle: { ...game.bundle } } : {}),
...(game.features ? { features: { ...game.features } } : {}),
...(game.display ? { display: { ...game.display } } : {}),
...(game.fallback ? { fallback: game.fallback } : {}),
```

- [ ] **Step 5: 更新 types.ts 与 staticRepo 断言**

```ts
// src/app/data/types.ts 追加
export type GameRuntimeMode = 'external' | 'virtual' | 'hosted'
export interface FeatureFlags {
  eval?: boolean; inlineScript?: boolean; inlineStyle?: boolean; wasm?: boolean
  coop?: boolean; fullscreen?: boolean; gamepad?: boolean
}
export interface GameBundle { url: string; bytes: number; sha256: string }

// GameSummary 追加（可选，保证旧数据兼容）
runtime?: GameRuntimeMode
// Game 追加
version?: string
entry?: string
playOrigin?: string
hostedUrl?: string
bundle?: GameBundle
features?: FeatureFlags
display?: { aspect?: '16:9' | '4:3' | 'fill' }
fallback?: 'external' | 'hosted' | 'none'
```

`staticRepo.ts` 的 `assertGameSummary` 末尾追加：

```ts
if (g.runtime && !['external', 'virtual', 'hosted'].includes(g.runtime)) {
  throw new Error(`数据格式错误: ${path}.runtime 非法`)
}
if (g.runtime === 'virtual' && (!('bundle' in g) || !g.bundle)) {
  // 详情对象才要求；index 摘要不带 bundle，这里只在详情校验入口生效
}
```

（实现时把 bundle 必填校验放在 `getGame` 的 `.then` 内：`if ((data as Game).runtime === 'virtual' && !(data as Game).bundle) throw new Error(...)`。）

- [ ] **Step 6: 全量测试与提交**

Run: `cd src && npx vitest run && npm run typecheck`
Expected: PASS

```bash
git add src/schema/game.schema.json src/app/data src/scripts/build-data.mjs src/scripts/build-data.test.ts
git commit -m "feat: extend game schema v2 with runtime delivery fields"
```

---

### Task 2: bridge 协议模块

**Files:**
- Create: `src/runtime/bridge/protocol.ts`
- Test: `src/runtime/bridge/protocol.test.ts`
- Modify: `src/tsconfig.json`（include 增加 `runtime/**/*.ts`）

**Interfaces:**
- Consumes: 无
- Produces: `PROTOCOL_VERSION`、`BRIDGE_CHANNEL`、`FeatureFlags`、`DEFAULT_FEATURES`、`HostCommand`、`GameEvent`、`ShellMessage`、`isHostCommand()`、`isGameEvent()`、`isShellMessage()`

- [ ] **Step 1: 写失败测试**

```ts
// src/runtime/bridge/protocol.test.ts
import { describe, expect, test } from 'vitest'
import { isGameEvent, isHostCommand, isShellMessage, isShellSignal, PROTOCOL_VERSION } from './protocol'

describe('protocol guards', () => {
  test('接受合法命令', () => {
    expect(isHostCommand({ type: 'host:pause' })).toBe(true)
    expect(isHostCommand({ type: 'host:hello', v: PROTOCOL_VERSION, locale: 'zh', capabilities: { save: true, score: true } })).toBe(true)
  })
  test('拒绝未知类型与坏载荷', () => {
    expect(isHostCommand({ type: 'host:nope' })).toBe(false)
    expect(isHostCommand({ type: 'host:score', score: 'x' })).toBe(false)
    expect(isHostCommand(null)).toBe(false)
  })
  test('接受合法事件', () => {
    expect(isGameEvent({ type: 'agent:boot', v: 1 })).toBe(true)
    expect(isGameEvent({ type: 'game:error', message: 'boom' })).toBe(true)
    expect(isGameEvent({ type: 'game:score', score: 42, meta: { a: 1 } })).toBe(true)
  })
  test('拒绝坏事件', () => {
    expect(isGameEvent({ type: 'game:score', score: '42' })).toBe(false)
    expect(isGameEvent({ type: 'game:storage-changed' })).toBe(false)
  })
  test('shell 消息', () => {
    expect(isShellMessage({ type: 'runtime:progress', received: 1, total: 2 })).toBe(true)
    expect(isShellMessage({ type: 'runtime:error', message: 'x' })).toBe(true)
    expect(isShellMessage({ type: 'runtime:install', id: 'a', version: 'v', entry: 'index.html', bundleUrl: 'https://x/b.zip', sha256: 'a'.repeat(64), hostOrigin: 'https://h' })).toBe(true)
    expect(isShellMessage({ type: 'runtime:install', id: 'a' })).toBe(false)
  })
  test('shell 降级信号', () => {
    expect(isShellSignal({ type: 'runtime:degrade', message: 'sha 校验失败' })).toBe(true)
    expect(isShellSignal({ type: 'runtime:degrade' })).toBe(false)
    expect(isShellSignal({ type: 'runtime:ready', version: 'v' })).toBe(false)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd src && npx vitest run runtime/bridge/protocol.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 protocol.ts**

```ts
export const PROTOCOL_VERSION = 1
export const BRIDGE_CHANNEL = 'webgame-runtime'
export const HELLO_TIMEOUT_MS = 10_000
export const BRIDGE_PARAM = 'host'

export interface FeatureFlags {
  eval: boolean; inlineScript: boolean; inlineStyle: boolean; wasm: boolean
  coop: boolean; fullscreen: boolean; gamepad: boolean
}

export const DEFAULT_FEATURES: FeatureFlags = {
  eval: false, inlineScript: false, inlineStyle: true, wasm: true,
  coop: false, fullscreen: true, gamepad: false
}

export interface HostCapabilities { save: boolean; score: boolean }

export type HostCommand =
  | { type: 'host:hello'; v: number; locale: string; capabilities: HostCapabilities }
  | { type: 'host:pause' }
  | { type: 'host:resume' }
  | { type: 'host:snapshot-request'; id: string }
  | { type: 'host:clear-save' }
  | { type: 'host:update-available'; version: string }
  | { type: 'host:exit-ack' }

export type GameEvent =
  | { type: 'agent:boot'; v: number }
  | { type: 'agent:hello-ack'; v: number }
  | { type: 'agent:unsupported'; reason: string }
  | { type: 'game:ready'; ms: number }
  | { type: 'game:error'; message: string; source?: string }
  | { type: 'game:score'; score: number; meta?: unknown }
  | { type: 'game:exit-request' }
  | { type: 'game:storage-changed'; keys: number; bytes: number }
  | { type: 'game:snapshot'; id: string; data: string; bytes: number; truncated: boolean }

export type ShellMessage =
  | { type: 'runtime:install'; id: string; version: string; entry: string; bundleUrl: string; sha256: string; token?: string; hostOrigin: string }
  | { type: 'runtime:progress'; received: number; total: number }
  | { type: 'runtime:ready'; version: string }
  | { type: 'runtime:error'; message: string }

// shell → 宿主的降级信号（bundle 失败/准备超时时，Agent 尚未注入，桥还不存在）
export type ShellSignal = { type: 'runtime:degrade'; message: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function isHostCommand(value: unknown): value is HostCommand {
  if (!isRecord(value)) return false
  switch (value.type) {
    case 'host:hello':
      return value.v === PROTOCOL_VERSION && typeof value.locale === 'string' && isRecord(value.capabilities)
    case 'host:pause': case 'host:resume': case 'host:clear-save': case 'host:exit-ack':
      return true
    case 'host:snapshot-request':
      return typeof value.id === 'string'
    case 'host:update-available':
      return typeof value.version === 'string'
    default:
      return false
  }
}

export function isGameEvent(value: unknown): value is GameEvent {
  if (!isRecord(value)) return false
  switch (value.type) {
    case 'agent:boot': case 'agent:hello-ack':
      return typeof value.v === 'number'
    case 'agent:unsupported':
      return typeof value.reason === 'string'
    case 'game:ready':
      return typeof value.ms === 'number'
    case 'game:error':
      return typeof value.message === 'string' && (value.source === undefined || typeof value.source === 'string')
    case 'game:score':
      return typeof value.score === 'number' && Number.isFinite(value.score)
    case 'game:exit-request':
      return true
    case 'game:storage-changed':
      return typeof value.keys === 'number' && typeof value.bytes === 'number'
    case 'game:snapshot':
      return typeof value.id === 'string' && typeof value.data === 'string' && typeof value.bytes === 'number' && typeof value.truncated === 'boolean'
    default:
      return false
  }
}

export function isShellSignal(value: unknown): value is ShellSignal {
  return isRecord(value) && value.type === 'runtime:degrade' && typeof value.message === 'string'
}

export function isShellMessage(value: unknown): value is ShellMessage {
  if (!isRecord(value)) return false
  switch (value.type) {
    case 'runtime:install':
      return typeof value.id === 'string' && typeof value.version === 'string' && typeof value.entry === 'string' &&
        typeof value.bundleUrl === 'string' && /^[0-9a-f]{64}$/.test(String(value.sha256)) &&
        typeof value.hostOrigin === 'string' && (value.token === undefined || typeof value.token === 'string')
    case 'runtime:progress':
      return typeof value.received === 'number' && typeof value.total === 'number'
    case 'runtime:ready':
      return typeof value.version === 'string'
    case 'runtime:error':
      return typeof value.message === 'string'
    default:
      return false
  }
}
```

- [ ] **Step 4: tsconfig include 与测试**

`src/tsconfig.json` 的 `include` 改为：
```json
"include": ["app/**/*.ts", "app/**/*.vue", "runtime/**/*.ts", "bootstrap/**/*.ts", "scripts/**/*.mjs", "scripts/**/*.ts", "e2e/**/*.ts", "playwright.config.ts"]
```

Run: `cd src && npx vitest run runtime/bridge/protocol.test.ts && npm run typecheck`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/runtime/bridge src/tsconfig.json
git commit -m "feat: add runtime bridge protocol types and guards"
```

---

### Task 3: SW 请求路由（纯函数）

**Files:**
- Create: `src/runtime/sw/router.ts`
- Test: `src/runtime/sw/router.test.ts`

**Interfaces:**
- Consumes: 无
- Produces: `AGENT_URL`、`AGENT_CACHE_PATH`、`BOOTSTRAP_PATH`、`assetCacheKey(path, origin)`、`decodeAssetPath(pathname)`、`routeRequest(args)`

- [ ] **Step 1: 写失败测试**

```ts
// src/runtime/sw/router.test.ts
import { describe, expect, test } from 'vitest'
import { decodeAssetPath, routeRequest, AGENT_CACHE_PATH } from './router'

const base = { isNavigation: true, hasActiveVersion: true, entry: 'index.html' }

describe('decodeAssetPath', () => {
  test('普通路径与目录', () => {
    expect(decodeAssetPath('/js/game.js')).toBe('js/game.js')
    expect(decodeAssetPath('/')).toBe('')
    expect(decodeAssetPath('/img/')).toBe('img/')
  })
  test('拒绝穿越与编码穿越', () => {
    expect(decodeAssetPath('/../secret')).toBeNull()
    expect(decodeAssetPath('/%2e%2e/secret')).toBeNull()
    expect(decodeAssetPath('/a/../../b')).toBeNull()
    expect(decodeAssetPath('/a/../b')).toBe('b')
  })
})

describe('routeRequest', () => {
  test('放行 bootstrap 与 sw', () => {
    expect(routeRequest({ ...base, pathname: '/__bootstrap' })).toEqual({ kind: 'passthrough' })
    expect(routeRequest({ ...base, pathname: '/sw.js' })).toEqual({ kind: 'passthrough' })
  })
  test('robots 与 agent', () => {
    expect(routeRequest({ ...base, pathname: '/robots.txt' })).toEqual({ kind: 'robots' })
    expect(routeRequest({ ...base, pathname: '/agent.js' })).toEqual({ kind: 'asset', path: AGENT_CACHE_PATH })
  })
  test('根路径按版本状态分流', () => {
    expect(routeRequest({ ...base, pathname: '/' })).toEqual({ kind: 'asset', path: 'index.html' })
    expect(routeRequest({ ...base, pathname: '/', hasActiveVersion: false })).toEqual({ kind: 'redirect-bootstrap' })
    expect(routeRequest({ ...base, pathname: '/', hasActiveVersion: false, isNavigation: false })).toEqual({ kind: 'not-found' })
  })
  test('目录补 entry、query 不进路径', () => {
    expect(routeRequest({ ...base, pathname: '/sub/', entry: 'sub/index.html' })).toEqual({ kind: 'asset', path: 'sub/index.html' })
    expect(routeRequest({ ...base, pathname: '/js/game.js' })).toEqual({ kind: 'asset', path: 'js/game.js' })
  })
  test('非法路径 404', () => {
    expect(routeRequest({ ...base, pathname: '/../x' })).toEqual({ kind: 'not-found' })
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd src && npx vitest run runtime/sw/router.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现 router.ts**

```ts
export const BOOTSTRAP_PATH = '/__bootstrap'
export const AGENT_URL = '/agent.js'
export const AGENT_CACHE_PATH = '__agent.js'

export type RouteDecision =
  | { kind: 'passthrough' }
  | { kind: 'robots' }
  | { kind: 'redirect-bootstrap' }
  | { kind: 'not-found' }
  | { kind: 'asset'; path: string }

export function assetCacheKey(path: string, origin: string): string {
  return new URL(`/__bundle/${path}`, origin).href
}

export function decodeAssetPath(pathname: string): string | null {
  let decoded: string
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    return null
  }
  if (decoded.includes('\0')) return null
  const segments: string[] = []
  for (const segment of decoded.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') {
      if (segments.length === 0) return null
      segments.pop()
      continue
    }
    segments.push(segment)
  }
  const trailingSlash = decoded.endsWith('/')
  return segments.join('/') + (trailingSlash && segments.length > 0 ? '/' : '')
}

export function routeRequest(args: {
  pathname: string
  isNavigation: boolean
  hasActiveVersion: boolean
  entry: string
}): RouteDecision {
  const { pathname, isNavigation, hasActiveVersion, entry } = args
  if (pathname === BOOTSTRAP_PATH || pathname.startsWith(`${BOOTSTRAP_PATH}/`)) return { kind: 'passthrough' }
  if (pathname === '/sw.js') return { kind: 'passthrough' }
  if (pathname === '/robots.txt') return { kind: 'robots' }
  if (pathname === AGENT_URL) return { kind: 'asset', path: AGENT_CACHE_PATH }
  if (!hasActiveVersion) return isNavigation ? { kind: 'redirect-bootstrap' } : { kind: 'not-found' }
  const decoded = decodeAssetPath(pathname)
  if (decoded === null) return { kind: 'not-found' }
  if (decoded === '' || decoded.endsWith('/')) return { kind: 'asset', path: decoded === '' ? entry : `${decoded}${entry.split('/').pop()}` }
  return { kind: 'asset', path: decoded }
}
```

- [ ] **Step 4: 运行测试**

Run: `cd src && npx vitest run runtime/sw/router.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/runtime/sw/router.ts src/runtime/sw/router.test.ts
git commit -m "feat: add service worker asset path router"
```

---

### Task 4: MIME 与安全响应头（CSP 生成）

**Files:**
- Create: `src/runtime/sw/mime.ts`
- Create: `src/runtime/sw/csp.ts`
- Test: `src/runtime/sw/mime.test.ts`
- Test: `src/runtime/sw/csp.test.ts`

**Interfaces:**
- Consumes: `FeatureFlags`、`DEFAULT_FEATURES`（Task 2）
- Produces: `contentTypeFor(path)`、`buildCsp(features, hostOrigin)`、`securityHeaders(features, hostOrigin)`

- [ ] **Step 1: 写失败测试**

```ts
// src/runtime/sw/mime.test.ts
import { expect, test } from 'vitest'
import { contentTypeFor } from './mime'

test('常见扩展名', () => {
  expect(contentTypeFor('index.html')).toBe('text/html; charset=utf-8')
  expect(contentTypeFor('a/b/game.js')).toBe('text/javascript; charset=utf-8')
  expect(contentTypeFor('x.mjs')).toBe('text/javascript; charset=utf-8')
  expect(contentTypeFor('x.css')).toBe('text/css; charset=utf-8')
  expect(contentTypeFor('x.json')).toBe('application/json; charset=utf-8')
  expect(contentTypeFor('x.wasm')).toBe('application/wasm')
  expect(contentTypeFor('x.svg')).toBe('image/svg+xml')
  expect(contentTypeFor('x.png')).toBe('image/png')
  expect(contentTypeFor('x.woff2')).toBe('font/woff2')
  expect(contentTypeFor('x.ogg')).toBe('audio/ogg')
  expect(contentTypeFor('x.glb')).toBe('model/gltf-binary')
})
test('未知扩展名兜底 octet-stream，且大小写不敏感', () => {
  expect(contentTypeFor('x.PNG')).toBe('image/png')
  expect(contentTypeFor('x.weird')).toBe('application/octet-stream')
  expect(contentTypeFor('noext')).toBe('application/octet-stream')
})
```

```ts
// src/runtime/sw/csp.test.ts
import { describe, expect, test } from 'vitest'
import { DEFAULT_FEATURES } from '../bridge/protocol'
import { buildCsp, securityHeaders } from './csp'

const HOST = 'https://games.example.com'

describe('buildCsp', () => {
  test('安全默认：禁 eval 与 inline script，保留 wasm 与 inline style', () => {
    const csp = buildCsp(DEFAULT_FEATURES, HOST)
    expect(csp).toContain("default-src 'none'")
    expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval'")
    expect(csp).not.toContain("'unsafe-eval'")
    expect(csp).toContain("style-src 'self' 'unsafe-inline'")
    expect(csp).toContain(`frame-ancestors ${HOST}`)
    expect(csp).toContain("connect-src 'self'")
  })
  test('features 逐项放宽', () => {
    const csp = buildCsp({ ...DEFAULT_FEATURES, eval: true, inlineScript: true, inlineStyle: false, wasm: false }, HOST)
    expect(csp).toContain("script-src 'self' 'unsafe-eval' 'unsafe-inline'")
    expect(csp).toContain('style-src \'self\';')
    expect(csp).not.toContain('wasm-unsafe-eval')
  })
})

describe('securityHeaders', () => {
  test('默认头', () => {
    const headers = securityHeaders(DEFAULT_FEATURES, HOST)
    expect(headers['X-Content-Type-Options']).toBe('nosniff')
    expect(headers['Referrer-Policy']).toBe('no-referrer')
    expect(headers['Content-Security-Policy']).toBe(buildCsp(DEFAULT_FEATURES, HOST))
    expect(headers['Cross-Origin-Opener-Policy']).toBeUndefined()
  })
  test('coop=true 时补 COOP/COEP/CORP', () => {
    const headers = securityHeaders({ ...DEFAULT_FEATURES, coop: true }, HOST)
    expect(headers['Cross-Origin-Opener-Policy']).toBe('same-origin')
    expect(headers['Cross-Origin-Embedder-Policy']).toBe('require-corp')
    expect(headers['Cross-Origin-Resource-Policy']).toBe('same-origin')
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd src && npx vitest run runtime/sw/mime.test.ts runtime/sw/csp.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现 mime.ts / csp.ts**

```ts
// src/runtime/sw/mime.ts
const TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  cjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json; charset=utf-8',
  map: 'application/json; charset=utf-8',
  wasm: 'application/wasm',
  svg: 'image/svg+xml',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', avif: 'image/avif', ico: 'image/x-icon', bmp: 'image/bmp',
  mp3: 'audio/mpeg', ogg: 'audio/ogg', oga: 'audio/ogg', wav: 'audio/wav',
  m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac',
  mp4: 'video/mp4', webm: 'video/webm', mkv: 'video/x-matroska',
  ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2',
  xml: 'application/xml', txt: 'text/plain; charset=utf-8', glb: 'model/gltf-binary', gltf: 'model/gltf+json'
}

export function contentTypeFor(path: string): string {
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
  return TYPES[ext] ?? 'application/octet-stream'
}
```

```ts
// src/runtime/sw/csp.ts
import type { FeatureFlags } from '../bridge/protocol'

export function buildCsp(features: FeatureFlags, hostOrigin: string): string {
  const script = ["'self'"]
  if (features.eval) script.push("'unsafe-eval'")
  if (features.inlineScript) script.push("'unsafe-inline'")
  if (features.wasm) script.push("'wasm-unsafe-eval'")
  const style = ["'self'"]
  if (features.inlineStyle) style.push("'unsafe-inline'")
  return [
    "default-src 'none'",
    `script-src ${script.join(' ')}`,
    `style-src ${style.join(' ')}`,
    "img-src 'self' data: blob:",
    "media-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
    "manifest-src 'none'",
    `frame-ancestors ${hostOrigin}`
  ].join('; ')
}

export function securityHeaders(features: FeatureFlags, hostOrigin: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Security-Policy': buildCsp(features, hostOrigin),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), usb=(), serial=(), hid=()'
  }
  if (features.coop) {
    headers['Cross-Origin-Opener-Policy'] = 'same-origin'
    headers['Cross-Origin-Embedder-Policy'] = 'require-corp'
    headers['Cross-Origin-Resource-Policy'] = 'same-origin'
  }
  return headers
}
```

- [ ] **Step 4: 运行测试**

Run: `cd src && npx vitest run runtime/sw/mime.test.ts runtime/sw/csp.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/runtime/sw/mime.ts src/runtime/sw/mime.test.ts src/runtime/sw/csp.ts src/runtime/sw/csp.test.ts
git commit -m "feat: add mime resolution and feature-derived security headers"
```

---

### Task 5: zip 解包与安全校验

**Files:**
- Create: `src/runtime/sw/unzip.ts`
- Test: `src/runtime/sw/unzip.test.ts`
- Modify: `src/package.json`（dependencies 增加 `fflate`）

**Interfaces:**
- Consumes: 无
- Produces: `ZipError`、`ZIP_LIMITS`、`validateEntryPath(path)`、`extractZip(data, limits?)`

- [ ] **Step 1: 安装依赖并写失败测试**

Run: `cd src && npm install fflate`

```ts
// src/runtime/sw/unzip.test.ts
import { zipSync, strToU8 } from 'fflate'
import { describe, expect, test } from 'vitest'
import { extractZip, validateEntryPath, ZIP_LIMITS } from './unzip'

function zip(files: Record<string, string>): Uint8Array {
  return zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])))
}

describe('validateEntryPath', () => {
  test('正常路径归一化', () => {
    expect(validateEntryPath('js/game.js')).toBe('js/game.js')
    expect(validateEntryPath('index.html')).toBe('index.html')
  })
  test('拒绝穿越/绝对/反斜杠/空字节', () => {
    for (const bad of ['../x', '/etc/passwd', 'a/../../b', 'a\\b', 'a\0b']) {
      expect(() => validateEntryPath(bad)).toThrowError()
    }
  })
})

describe('extractZip', () => {
  test('解出条目', async () => {
    const entries = await extractZip(zip({ 'index.html': '<h1>hi</h1>', 'js/a.js': '1' }))
    expect(new TextDecoder().decode(entries.get('index.html')!)).toBe('<h1>hi</h1>')
    expect(entries.get('js/a.js')!.length).toBe(1)
  })
  test('超条目数上限报错', async () => {
    const files: Record<string, string> = {}
    for (let i = 0; i < 6; i++) files[`f${i}.txt`] = 'x'
    await expect(extractZip(zip(files), { ...ZIP_LIMITS, maxEntries: 5 })).rejects.toMatchObject({ code: 'too-many-entries' })
  })
  test('单条目超限报错', async () => {
    await expect(extractZip(zip({ 'big.txt': 'x'.repeat(50) }), { ...ZIP_LIMITS, maxEntry: 10 })).rejects.toMatchObject({ code: 'entry-too-large' })
  })
  test('总量超限报错', async () => {
    await expect(extractZip(zip({ 'a.txt': 'x'.repeat(30), 'b.txt': 'y'.repeat(30) }), { ...ZIP_LIMITS, maxTotal: 50 })).rejects.toMatchObject({ code: 'total-too-large' })
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd src && npx vitest run runtime/sw/unzip.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现 unzip.ts**

```ts
import { unzipSync } from 'fflate'

export interface ZipLimits {
  maxBundle: number
  maxTotal: number
  maxEntries: number
  maxEntry: number
  maxRatio: number
}

export const ZIP_LIMITS: ZipLimits = {
  maxBundle: 200 * 1024 * 1024,
  maxTotal: 500 * 1024 * 1024,
  maxEntries: 5000,
  maxEntry: 100 * 1024 * 1024,
  maxRatio: 200
}

export class ZipError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = 'ZipError'
  }
}

export function validateEntryPath(raw: string): string {
  if (raw.includes('\0') || raw.includes('\\')) throw new ZipError('bad-path', `非法条目路径: ${raw}`)
  const segments: string[] = []
  for (const segment of raw.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') throw new ZipError('bad-path', `条目路径越界: ${raw}`)
    segments.push(segment)
  }
  if (segments.length === 0) throw new ZipError('bad-path', `空条目路径: ${raw}`)
  const path = segments.join('/')
  if (path.length > 255) throw new ZipError('bad-path', `条目路径过长: ${raw}`)
  return path
}

export async function extractZip(data: Uint8Array, limits: ZipLimits = ZIP_LIMITS): Promise<Map<string, Uint8Array>> {
  if (data.length > limits.maxBundle) throw new ZipError('bundle-too-large', `包体超过上限 ${limits.maxBundle}`)
  const planned = new Map<string, number>()
  let plannedTotal = 0
  const unzipped = unzipSync(data, {
    filter(file) {
      const path = validateEntryPath(file.name)
      if (planned.has(path)) throw new ZipError('duplicate-entry', `重复条目: ${path}`)
      const original = file.originalSize
      if (original > limits.maxEntry) throw new ZipError('entry-too-large', `条目过大: ${path}`)
      const compressed = Math.max(file.size, 1)
      if (original / compressed > limits.maxRatio) throw new ZipError('ratio-too-high', `压缩比异常: ${path}`)
      if (planned.size + 1 > limits.maxEntries) throw new ZipError('too-many-entries', `条目数超过 ${limits.maxEntries}`)
      plannedTotal += original
      if (plannedTotal > limits.maxTotal) throw new ZipError('total-too-large', `解压总量超过 ${limits.maxTotal}`)
      planned.set(path, original)
      return true
    }
  })
  const entries = new Map<string, Uint8Array>()
  for (const [name, bytes] of Object.entries(unzipped)) {
    const path = validateEntryPath(name)
    if (bytes.length > limits.maxEntry) throw new ZipError('entry-too-large', `条目过大: ${path}`)
    entries.set(path, bytes)
  }
  if (entries.size !== planned.size) throw new ZipError('extract-mismatch', '解压结果与目录不一致')
  return entries
}
```

- [ ] **Step 4: 运行测试**

Run: `cd src && npx vitest run runtime/sw/unzip.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/package.json src/package-lock.json src/runtime/sw/unzip.ts src/runtime/sw/unzip.test.ts
git commit -m "feat: add zip extraction with path and bomb guards"
```

---

### Task 6: Service Worker 主入口（安装 + 路由 + 元数据）

**Files:**
- Create: `src/runtime/sw/meta.ts`
- Create: `src/runtime/sw/index.ts`
- Modify: `src/runtime/sw/router.ts`（`parseRange` 移入纯函数模块）
- Modify: `src/runtime/sw/router.test.ts`

**Interfaces:**
- Consumes: Task 2/3/4/5 全部模块
- Produces: 运行时 SW：接收 `runtime:install`（ShellMessage）、下载/校验/解包/缓存、按路由提供服务；`meta.ts` 导出 `readMeta(origin)`、`writeMeta(meta, origin)`、`clearMeta(origin)`；`router.ts` 增加 `parseRange(header, size)`

- [ ] **Step 1: 写 parseRange 失败测试并实现（TDD）**

```ts
// src/runtime/sw/router.test.ts 追加
import { parseRange } from './router'

describe('parseRange', () => {
  test('闭区间/开区间/后缀区间', () => {
    expect(parseRange('bytes=0-3', 10)).toEqual({ start: 0, end: 3 })
    expect(parseRange('bytes=5-', 10)).toEqual({ start: 5, end: 9 })
    expect(parseRange('bytes=-4', 10)).toEqual({ start: 6, end: 9 })
    expect(parseRange('bytes=8-100', 10)).toEqual({ start: 8, end: 9 })
  })
  test('非法区间返回 null', () => {
    expect(parseRange('bytes=9-2', 10)).toBeNull()
    expect(parseRange('bytes=10-', 10)).toBeNull()
    expect(parseRange('items=0-1', 10)).toBeNull()
  })
})
```

```ts
// src/runtime/sw/router.ts 追加
export function parseRange(header: string, size: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match) return null
  const start = match[1] === '' ? size - Number(match[2]) : Number(match[1])
  const end = match[1] === '' || match[2] === '' ? size - 1 : Number(match[2])
  if (Number.isNaN(start) || Number.isNaN(end) || start < 0 || start > end || start >= size) return null
  return { start, end: Math.min(end, size - 1) }
}
```

Run: `cd src && npx vitest run runtime/sw/router.test.ts`
Expected: PASS

- [ ] **Step 2: 实现 meta.ts（Cache 代替 IndexedDB）**

```ts
export interface RuntimeMeta {
  id: string
  version: string
  entry: string
  hostOrigin: string
  installedAt: number
}

const META_CACHE = 'runtime-meta'
const META_KEY = '/__meta'

export async function readMeta(origin: string): Promise<RuntimeMeta | null> {
  const cache = await caches.open(META_CACHE)
  const hit = await cache.match(new URL(META_KEY, origin).href)
  if (!hit) return null
  try {
    return (await hit.json()) as RuntimeMeta
  } catch {
    return null
  }
}

export async function writeMeta(meta: RuntimeMeta, origin: string): Promise<void> {
  const cache = await caches.open(META_CACHE)
  await cache.put(new URL(META_KEY, origin).href, new Response(JSON.stringify(meta), {
    headers: { 'Content-Type': 'application/json' }
  }))
}

export async function clearMeta(origin: string): Promise<void> {
  const cache = await caches.open(META_CACHE)
  await cache.delete(new URL(META_KEY, origin).href)
}
```

- [ ] **Step 3: 实现 sw/index.ts**

```ts
/// <reference lib="webworker" />
import { AGENT_CACHE_PATH, assetCacheKey, parseRange, routeRequest } from './router'
import { contentTypeFor } from './mime'
import { securityHeaders } from './csp'
import { DEFAULT_FEATURES, isShellMessage, type FeatureFlags } from '../bridge/protocol'
import { readMeta, writeMeta, type RuntimeMeta } from './meta'
import { extractZip } from './unzip'

declare const self: ServiceWorkerGlobalScope & { __FEATURES__?: FeatureFlags }

const FEATURES: FeatureFlags = { ...DEFAULT_FEATURES }
const AGENT_SOURCE_URL = '/agent.js'
const BOOTSTRAP_URL = '/__bootstrap'

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([`bundle-${(await readMeta(self.location.origin))?.version ?? ''}`, 'runtime-meta'])
    for (const name of await caches.keys()) {
      if (name.startsWith('bundle-') && !keep.has(name)) await caches.delete(name)
    }
    await self.clients.claim()
  })())
})

self.addEventListener('message', (event) => {
  if (!isShellMessage(event.data)) return
  if (event.data.type !== 'runtime:install') return
  const client = event.source as Client | null
  event.waitUntil(installBundle(event.data, client))
})

async function fetchAgentSource(): Promise<Uint8Array | null> {
  try {
    const response = await fetch(AGENT_SOURCE_URL, { cache: 'no-store' })
    if (!response.ok) return null
    return new Uint8Array(await response.arrayBuffer())
  } catch {
    return null
  }
}

async function installBundle(message: Extract<import('../bridge/protocol').ShellMessage, { type: 'runtime:install' }>, client: Client | null): Promise<void> {
  const origin = self.location.origin
  const tell = (data: object) => client?.postMessage(data)
  try {
    const headers: Record<string, string> = {}
    if (message.token) headers.Authorization = `Bearer ${message.token}`
    const response = await fetch(message.bundleUrl, { headers, cache: 'no-store' })
    if (!response.ok) throw new Error(`bundle 下载失败: HTTP ${response.status}`)
    const total = Number(response.headers.get('Content-Length') ?? message.sha256 ? 0 : 0) || 0
    const reader = response.body?.getReader()
    const chunks: Uint8Array[] = []
    let received = 0
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
        received += value.length
        tell({ type: 'runtime:progress', received, total: Math.max(total, received) })
      }
    } else {
      const buffer = new Uint8Array(await response.arrayBuffer())
      chunks.push(buffer)
      received = buffer.length
    }
    const bundle = new Uint8Array(received)
    let offset = 0
    for (const chunk of chunks) { bundle.set(chunk, offset); offset += chunk.length }

    const digest = await crypto.subtle.digest('SHA-256', bundle)
    const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
    if (hex !== message.sha256) throw new Error('bundle 校验失败（sha256 不匹配）')

    const entries = await extractZip(bundle)
    if (!entries.has(message.entry)) throw new Error(`入口不存在: ${message.entry}`)
    const agentBytes = await fetchAgentSource()
    if (agentBytes) entries.set(AGENT_CACHE_PATH, agentBytes)

    const cacheName = `bundle-${message.version}`
    const cache = await caches.open(cacheName)
    for (const [path, bytes] of entries) {
      await cache.put(assetCacheKey(path, origin), new Response(bytes, {
        headers: { 'Content-Type': contentTypeFor(path), 'Cache-Control': 'no-store' }
      }))
    }
    const meta: RuntimeMeta = { id: message.id, version: message.version, entry: message.entry, hostOrigin: message.hostOrigin, installedAt: Date.now() }
    await writeMeta(meta, origin)
    tell({ type: 'runtime:ready', version: message.version })
    // 上一版本保留一个，便于回滚
    for (const name of await caches.keys()) {
      if (name.startsWith('bundle-') && name !== cacheName) await caches.delete(name)
    }
    await self.skipWaiting()
  } catch (error) {
    tell({ type: 'runtime:error', message: error instanceof Error ? error.message : String(error) })
  }
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin) return
  event.respondWith(handle(event))
})

async function handle(event: FetchEvent): Promise<Response> {
  const url = new URL(event.request.url)
  const meta = await readMeta(self.location.origin)
  const decision = routeRequest({
    pathname: url.pathname,
    isNavigation: event.request.mode === 'navigate',
    hasActiveVersion: meta !== null,
    entry: meta?.entry ?? 'index.html'
  })

  if (decision.kind === 'passthrough') return fetch(event.request)
  if (decision.kind === 'robots') {
    return new Response('User-agent: *\nDisallow: /\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  }
  if (decision.kind === 'redirect-bootstrap') {
    return Response.redirect(new URL(`${BOOTSTRAP_URL}${url.search}`, self.location.origin).href, 302)
  }
  if (decision.kind === 'not-found') return new Response(null, { status: 404 })

  const cache = await caches.open(`bundle-${meta!.version}`)
  const hit = await cache.match(assetCacheKey(decision.path, self.location.origin))
  if (!hit) {
    if (event.request.mode === 'navigate') {
      return Response.redirect(new URL(`${BOOTSTRAP_URL}${url.search}`, self.location.origin).href, 302)
    }
    return new Response(null, { status: 404 })
  }

  const headers = new Headers(securityHeaders(FEATURES, self.location.origin))
  headers.set('Content-Type', contentTypeFor(decision.path))
  const etag = `"${meta!.version}:${decision.path}"`
  headers.set('ETag', etag)
  if (event.request.headers.get('If-None-Match') === etag) return new Response(null, { status: 304, headers })
  const isHtml = decision.path.endsWith('.html') || decision.path === meta!.entry
  if (isHtml) {
    const html = await hit.text()
    return new Response(event.request.method === 'HEAD' ? null : injectAgent(html, meta!.hostOrigin), { status: 200, headers })
  }
  headers.set('Accept-Ranges', 'bytes')
  if (event.request.method === 'HEAD') return new Response(null, { status: 200, headers })
  const buffer = await hit.arrayBuffer()
  if (event.request.headers.has('Range')) {
    const range = parseRange(event.request.headers.get('Range')!, buffer.byteLength)
    if (range) {
      headers.set('Content-Range', `bytes ${range.start}-${range.end}/${buffer.byteLength}`)
      return new Response(buffer.slice(range.start, range.end + 1), { status: 206, headers })
    }
  }
  return new Response(buffer, { status: 200, headers })
}

function injectAgent(html: string, hostOrigin: string): string {
  const tag = `<script src="/agent.js?host=${encodeURIComponent(hostOrigin)}"></script>`
  const headIndex = html.search(/<head[^>]*>/i)
  if (headIndex >= 0) {
    const insertAt = html.indexOf('>', headIndex) + 1
    return html.slice(0, insertAt) + tag + html.slice(insertAt)
  }
  const htmlIndex = html.search(/<html[^>]*>/i)
  if (htmlIndex >= 0) {
    const insertAt = html.indexOf('>', htmlIndex) + 1
    return html.slice(0, insertAt) + tag + html.slice(insertAt)
  }
  return tag + html
}
```

- [ ] **Step 4: 用真实浏览器验证（mise en place）**

本任务无浏览器单测（SW 全局 API 依赖浏览器），`parseRange` 已在 Step 1 单测，其余由 Task 12 的 Playwright e2e 覆盖。先跑静态检查：

Run: `cd src && npx vitest run runtime/sw && npm run typecheck`
Expected: PASS（若 `webworker` lib 与 DOM lib 冲突，为 `sw/index.ts` 顶部保留 `/// <reference lib="webworker" />` 并避免直接使用 DOM 类型）

- [ ] **Step 5: 提交**

```bash
git add src/runtime/sw/meta.ts src/runtime/sw/index.ts src/runtime/sw/router.ts src/runtime/sw/router.test.ts
git commit -m "feat: add runtime service worker with bundle install and asset routing"
```

---

### Task 7: Agent 注入脚本

**Files:**
- Create: `src/runtime/agent/index.ts`
- Test: `src/runtime/agent/index.test.ts`
- Modify: `src/package.json`（devDependencies 增加 `happy-dom`）

**Interfaces:**
- Consumes: `isHostCommand`、`isGameEvent`、`PROTOCOL_VERSION`、`BRIDGE_PARAM`
- Produces: `installAgent(win, opts)`、`wrapStorage(win, onchange)`

- [ ] **Step 1: 安装依赖并写失败测试**

Run: `cd src && npm install -D happy-dom`

```ts
// src/runtime/agent/index.test.ts
// @vitest-environment happy-dom
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { installAgent, wrapStorage } from './index'

describe('installAgent', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    window.__GAME_HOST__ = undefined
  })

  test('暴露 __GAME_HOST__ 且 reportScore 走桥', () => {
    const port = { postMessage: vi.fn(), onmessage: null, start: vi.fn(), close: vi.fn() } as unknown as MessagePort
    const sent: unknown[] = []
    const parent = { postMessage: (data: unknown) => sent.push(data) } as unknown as Window
    installAgent(window, { hostOrigin: 'https://host.test', parent, port })
    expect(typeof window.__GAME_HOST__?.reportScore).toBe('function')
    window.__GAME_HOST__!.reportScore(42)
    expect(port.postMessage).toHaveBeenCalledWith({ type: 'game:score', score: 42, meta: undefined })
  })

  test('剥夺 serviceWorker.register', () => {
    installAgent(window, { hostOrigin: 'https://host.test', parent: window, port: null })
    expect(() => navigator.serviceWorker.register('/sw.js')).toThrowError()
  })

  test('报告 ready 与 error', async () => {
    const port = { postMessage: vi.fn(), start: vi.fn(), close: vi.fn() } as unknown as MessagePort
    installAgent(window, { hostOrigin: 'https://host.test', parent: window, port })
    window.dispatchEvent(new Event('load'))
    expect(port.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'game:ready' }))
    window.dispatchEvent(new ErrorEvent('error', { message: 'boom' }))
    expect(port.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'game:error', message: 'boom' }))
  })
})

describe('wrapStorage', () => {
  test('setItem/removeItem/clear 触发回调（debounce 由调用方处理）', () => {
    const events: number[] = []
    const unwrap = wrapStorage(window, () => events.push(1))
    localStorage.setItem('k', 'v')
    localStorage.removeItem('k')
    unwrap()
    localStorage.setItem('k2', 'v2')
    expect(events.length).toBe(2)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd src && npx vitest run runtime/agent/index.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现 agent/index.ts**

```ts
import { isHostCommand, PROTOCOL_VERSION, type GameEvent } from '../bridge/protocol'

declare global {
  interface Window {
    __GAME_HOST__?: {
      reportScore(score: number, meta?: unknown): void
      requestExit(): void
      getMeta(): { id: string; version: string; locale: string }
    }
  }
}

export interface AgentOptions {
  hostOrigin: string
  parent: Window
  port: MessagePort | null
}
let activePort: MessagePort | null = null
let booted = false

export function installAgent(win: Window, opts: AgentOptions): void {
  activePort = opts.port
  denyServiceWorker(win)
  denyDocumentDomain(win)
  wrapStorage(win, debounce(() => emit({ type: 'game:storage-changed', keys: storageKeys(win).length, bytes: storageBytes(win) }), 200))
  win.__GAME_HOST__ = {
    reportScore(score, meta) {
      if (Number.isFinite(score)) emit({ type: 'game:score', score, meta })
    },
    requestExit() { emit({ type: 'game:exit-request' }) },
    getMeta() { return { id: document.documentElement.dataset.gameId ?? '', version: document.documentElement.dataset.gameVersion ?? '', locale: navigator.language } }
  }
  win.addEventListener('error', (event) => emit({ type: 'game:error', message: event.message || '未知错误' }))
  win.addEventListener('unhandledrejection', (event) => emit({ type: 'game:error', message: String((event as PromiseRejectionEvent).reason) }))
  if (document.readyState === 'complete') queueMicrotask(() => emitReady(win))
  else win.addEventListener('load', () => emitReady(win), { once: true })

  // postMessage 通路：接收宿主 hello（含 MessagePort）或复用注入时传入的 port
  if (!opts.port) {
    win.addEventListener('message', (event) => {
      if (event.origin !== opts.hostOrigin || event.source !== opts.parent) return
      if (!isHostCommand(event.data) || event.data.type !== 'host:hello') return
      activePort?.close()
      activePort = event.data.port
      attachPort(activePort)
      emit({ type: 'agent:hello-ack', v: PROTOCOL_VERSION })
    })
  } else {
    attachPort(opts.port)
  }
  if (!booted) {
    booted = true
    opts.parent.postMessage({ type: 'agent:boot', v: PROTOCOL_VERSION }, opts.hostOrigin)
  }
}

function attachPort(port: MessagePort): void {
  port.onmessage = (event) => {
    if (!isHostCommand(event.data)) return
    const command = event.data
    if (command.type === 'host:pause') dispatchHook('pause')
    else if (command.type === 'host:resume') dispatchHook('resume')
    else if (command.type === 'host:clear-save') { try { localStorage.clear() } catch { /* noop */ } dispatchHook('clear-save') }
  }
  port.start()
}

function dispatchHook(name: string): void {
  window.dispatchEvent(new CustomEvent(`gamehost:${name}`))
}

function emit(event: GameEvent): void {
  activePort?.postMessage(event)
}

function emitReady(win: Window): void {
  emit({ type: 'game:ready', ms: Math.round(win.performance.now()) })
  document.documentElement.dataset.runtimeReady = '1'
}

function denyServiceWorker(win: Window): void {
  const deny = () => { throw new DOMException('运行时已禁用游戏自注册 Service Worker', 'SecurityError') }
  const proxy = {
    register: deny,
    unregister: deny,
    getRegistrations: async () => [],
    getRegistration: async () => undefined,
    controller: null,
    ready: Promise.reject(new Error('disabled'))
  }
  try {
    Object.defineProperty(win.navigator, 'serviceWorker', { configurable: true, get: () => proxy })
  } catch { /* navigator 被冻结时忽略 */ }
}

function denyDocumentDomain(win: Window): void {
  try {
    Object.defineProperty(win.document, 'domain', { configurable: true, get: () => win.location.hostname, set: () => {} })
  } catch { /* noop */ }
}

export function wrapStorage(win: Window, onchange: () => void): () => void {
  const proto = win.Storage.prototype
  const descriptor = Object.getOwnPropertyDescriptor(win, 'localStorage')
  const storage: Storage | null = descriptor?.get ? descriptor.get.call(win) : null
  if (!storage) return () => {}
  const originals = new Map<string, unknown>()
  for (const method of ['setItem', 'removeItem', 'clear'] as const) {
    const original = proto[method]
    originals.set(method, original)
    proto[method] = function patched(this: Storage, ...args: unknown[]) {
      const result = (original as (...a: unknown[]) => unknown).apply(this, args)
      if (this === storage) onchange()
      return result
    }
  }
  return () => {
    for (const [method, original] of originals) {
      ;(proto as unknown as Record<string, unknown>)[method] = original
    }
  }
}

function storageKeys(win: Window): string[] {
  try { return Object.keys(win.localStorage) } catch { return [] }
}

function storageBytes(win: Window): number {
  try {
    let bytes = 0
    for (const key of Object.keys(win.localStorage)) bytes += (key.length + (win.localStorage.getItem(key)?.length ?? 0)) * 2
    return bytes
  } catch { return 0 }
}

function debounce<T extends (...args: never[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout> | undefined
  return ((...args: never[]) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }) as T
}

// 自动执行（真实浏览器：从 script 标签 query 读 hostOrigin）
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const current = document.currentScript as HTMLScriptElement | null
  const hostOrigin = current ? new URL(current.src).searchParams.get('host') : null
  if (hostOrigin) installAgent(window, { hostOrigin, parent: window.parent, port: null })
}
```

- [ ] **Step 4: 运行测试**

Run: `cd src && npx vitest run runtime/agent/index.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/package.json src/package-lock.json src/runtime/agent
git commit -m "feat: add injected runtime agent with bridge and capability denial"
```

---

### Task 8: bootstrap shell 页面与运行时构建

**Files:**
- Create: `src/bootstrap/index.html`
- Create: `src/bootstrap/main.ts`
- Create: `src/scripts/build-runtime.mjs`
- Modify: `src/vite.config.ts`（多 HTML 入口）
- Modify: `src/package.json`（scripts：`build` 追加 runtime 构建）

**Interfaces:**
- Consumes: `isShellMessage`、`ShellMessage`（Task 2）
- Produces: `dist/bootstrap/index.html`、`dist/sw.js`、`dist/agent.js`；`npm run build:runtime`

- [ ] **Step 1: 写 shell 页面**

`src/bootstrap/index.html`：

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="robots" content="noindex" />
    <title>游戏加载中…</title>
    <style>
      body { margin: 0; background: #0a0a0a; color: #e5e5e5; font-family: system-ui, sans-serif; display: grid; place-items: center; min-height: 100vh; }
      main { text-align: center; max-width: 26rem; padding: 1.5rem; }
      progress { width: 100%; height: 6px; }
      button { margin-top: 1rem; padding: 0.5rem 1.25rem; border-radius: 0.5rem; border: 0; background: #7c3aed; color: white; font-size: 1rem; }
      pre { text-align: left; font-size: 0.75rem; color: #a3a3a3; white-space: pre-wrap; }
    </style>
  </head>
  <body>
    <main>
      <h1 style="font-size:1rem;font-weight:600">正在准备游戏运行环境…</h1>
      <progress id="progress" max="100" value="0"></progress>
      <p id="status" style="font-size:0.8rem;color:#a3a3a3">初始化</p>
      <div id="error" hidden>
        <p id="error-message" style="color:#f87171;font-size:0.9rem"></p>
        <button id="retry">重试</button>
        <pre id="error-detail" hidden></pre>
      </div>
    </main>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: 写 shell 逻辑**

```ts
// src/bootstrap/main.ts
import { isShellMessage, type ShellMessage } from '../runtime/bridge/protocol'

const params = new URLSearchParams(location.hash.replace(/^#/, ''))
const version = params.get('v') ?? ''
const token = params.get('t') ?? ''

const progress = document.getElementById('progress') as HTMLProgressElement
const status = document.getElementById('status') as HTMLParagraphElement
const errorBox = document.getElementById('error') as HTMLDivElement
const errorMessage = document.getElementById('error-message') as HTMLParagraphElement
const errorDetail = document.getElementById('error-detail') as HTMLPreElement
const retry = document.getElementById('retry') as HTMLButtonElement

function fail(message: string, detail?: string): void {
  errorBox.hidden = false
  errorMessage.textContent = message
  if (detail) { errorDetail.hidden = false; errorDetail.textContent = detail }
  signalDegrade(detail ? `${message}: ${detail}` : message)
}

const hostOrigin = import.meta.env.VITE_HOST_ORIGIN ?? 'https://games.example.com'
const BOOTSTRAP_TIMEOUT_MS = 45_000
let settleTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
  fail('准备超时')
}, BOOTSTRAP_TIMEOUT_MS)

function signalDegrade(message: string): void {
  if (settleTimer) { clearTimeout(settleTimer); settleTimer = null }
  window.parent.postMessage({ type: 'runtime:degrade', message }, hostOrigin)
}

retry.addEventListener('click', () => location.reload())
window.addEventListener('message', (event) => {
  if (!isShellMessage(event.data)) return
  handle(event.data)
})

function handle(message: ShellMessage): void {
  if (message.type === 'runtime:progress') {
    progress.value = message.total > 0 ? Math.min(100, Math.round((message.received / message.total) * 100)) : 0
    status.textContent = `下载资产 ${formatBytes(message.received)}`
  } else if (message.type === 'runtime:ready') {
    if (settleTimer) { clearTimeout(settleTimer); settleTimer = null }
    status.textContent = '启动中…'
    void navigator.storage?.persist?.().catch(() => {})
    void navigator.storage?.estimate?.().then(({ usage }) => {
      if (usage && usage > 0) status.textContent = `启动中…（已用存储 ${Math.round(usage / 1024 / 1024)} MiB）`
    }).catch(() => {})
    location.replace('/')
  } else if (message.type === 'runtime:error') {
    fail('运行环境准备失败', message.message)
  }
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`
  return `${(n / 1024 / 1024).toFixed(1)} MiB`
}

async function main(): Promise<void> {
  if (!('serviceWorker' in navigator)) {
    fail('当前浏览器不支持 Service Worker，无法站内运行')
    return
  }
  const gameId = params.get('id') ?? location.hostname.split('.')[0]
  const bundleUrl = params.get('bundle') ?? ''
  const sha256 = params.get('sha') ?? ''
  const entry = params.get('entry') ?? 'index.html'
  if (!version || !bundleUrl || !sha256) {
    fail('启动参数不完整', location.href)
    return
  }
  try {
    const registration = await navigator.serviceWorker.register('/sw.js')
    await navigator.serviceWorker.ready
    const target = registration.active ?? registration.waiting ?? registration.installing
    if (!target) throw new Error('Service Worker 未激活')
    target.postMessage({
      type: 'runtime:install',
      id: gameId,
      version,
      entry,
      bundleUrl,
      sha256,
      ...(token ? { token } : {}),
      hostOrigin: import.meta.env.VITE_HOST_ORIGIN ?? 'https://games.example.com'
    })
    status.textContent = '下载资产…'
  } catch (error) {
    fail('Service Worker 注册失败', error instanceof Error ? error.message : String(error))
  }
}

void main()
```

注意：`id/bundle/sha/entry` 与 `v/t` 全部放在 `#fragment`（不能放 query，避免进服务端日志与 Referer），宿主侧由 Task 9 的 `resolveRuntimeTargets` 生成同名字段。

- [ ] **Step 3: 多入口配置与构建脚本**

`src/vite.config.ts`：

```ts
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./app', import.meta.url)) } },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        bootstrap: fileURLToPath(new URL('./bootstrap/index.html', import.meta.url))
      }
    }
  }
})
```

`src/scripts/build-runtime.mjs`：

```js
#!/usr/bin/env node
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'vite'

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const shared = {
  configFile: false,
  root,
  logLevel: 'warn',
  build: { target: 'es2020', minify: 'esbuild', emptyOutDir: false, outDir: 'dist', write: true }
}

await build({
  ...shared,
  build: {
    ...shared.build,
    lib: { entry: path.join(root, 'runtime/sw/index.ts'), formats: ['iife'], name: 'RuntimeSW', fileName: () => 'sw.js' }
  }
})
await build({
  ...shared,
  build: {
    ...shared.build,
    lib: { entry: path.join(root, 'runtime/agent/index.ts'), formats: ['iife'], name: 'RuntimeAgent', fileName: () => 'agent.js' }
  }
})
console.log('[build-runtime] dist/sw.js, dist/agent.js')
```

`src/package.json` scripts 更新：

```jsonc
"build": "vue-tsc --noEmit && vite build && node scripts/build-runtime.mjs",
"build:runtime": "node scripts/build-runtime.mjs",
"serve:runtime": "node scripts/serve-runtime.mjs"
```

- [ ] **Step 4: 构建验证**

Run: `cd src && npm run build && ls -la dist/sw.js dist/agent.js dist/bootstrap/index.html`
Expected: 三个文件存在，`sw.js`/`agent.js` 为 IIFE 且无 `import` 语句

- [ ] **Step 5: 提交**

```bash
git add src/bootstrap src/scripts/build-runtime.mjs src/vite.config.ts src/package.json
git commit -m "feat: add bootstrap shell and fixed-name runtime build outputs"
```

---

### Task 9: 宿主适配器与桥客户端

**Files:**
- Create: `src/runtime/host/config.ts`
- Create: `src/runtime/host/adapters.ts`
- Create: `src/runtime/host/useGameFrame.ts`
- Test: `src/runtime/host/adapters.test.ts`
- Test: `src/runtime/host/config.test.ts`

**Interfaces:**
- Consumes: `Game`（Task 1）、`HostCommand`/`GameEvent`/`HELLO_TIMEOUT_MS`（Task 2）
- Produces: `runtimeConfig()`、`derivePlayOrigin(id, baseDomain, protocol)`、`resolveRuntimeTargets(game, opts)`、`useGameFrame(opts)`

- [ ] **Step 1: 写失败测试**

```ts
// src/runtime/host/config.test.ts
import { expect, test } from 'vitest'
import { derivePlayOrigin } from './config'

test('生产 https 与本地 http', () => {
  expect(derivePlayOrigin('2048', 'games.example.com', 'https:')).toBe('https://2048.games.example.com')
  expect(derivePlayOrigin('2048', 'localhost:4173', 'http:')).toBe('http://2048.localhost:4173')
})
test('拒绝非法 id', () => {
  expect(() => derivePlayOrigin('../evil', 'games.example.com', 'https:')).toThrowError()
})
```

```ts
// src/runtime/host/adapters.test.ts
import { expect, test } from 'vitest'
import type { Game } from '../../app/data/types'
import { resolveRuntimeTargets } from './adapters'

const base = {
  id: 'demo', name: 'D', url: 'https://upstream.example/game', author: { name: 'a' }, description: 'd',
  durationMinutes: { min: 1, max: 2 }, type: 'puzzle' as const, tags: ['x'], addedAt: '2026-09-17'
}
const opts = { baseDomain: 'games.example.com', protocol: 'https:' }

test('external 只有外链', () => {
  const targets = resolveRuntimeTargets({ ...base }, opts)
  expect(targets).toEqual([{ mode: 'external', url: 'https://upstream.example/game', origin: null }])
})

test('virtual 生成 bootstrap URL 并带 fragment 参数', () => {
  const game: Game = {
    ...base, runtime: 'virtual', version: 'v1', entry: 'index.html',
    bundle: { url: '/data/bundles/demo.zip', bytes: 10, sha256: 'a'.repeat(64) }
  }
  const [primary] = resolveRuntimeTargets(game, opts)
  expect(primary.mode).toBe('virtual')
  expect(primary.origin).toBe('https://demo.games.example.com')
  const url = new URL(primary.url)
  expect(url.pathname).toBe('/__bootstrap')
  expect(url.hash).toContain('v=v1')
  expect(url.hash).toContain(`sha=${'a'.repeat(64)}`)
  expect(url.hash).toContain('bundle=' + encodeURIComponent('https://games.example.com/data/bundles/demo.zip'))
})

test('fallback 链：hosted 再 external', () => {
  const game: Game = {
    ...base, runtime: 'virtual', version: 'v1',
    bundle: { url: 'https://games.example.com/data/bundles/demo.zip', bytes: 1, sha256: 'b'.repeat(64) },
    hostedUrl: 'https://demo.games.example.com/', fallback: 'hosted'
  }
  const targets = resolveRuntimeTargets(game, opts)
  expect(targets.map((t) => t.mode)).toEqual(['virtual', 'hosted', 'external'])
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd src && npx vitest run runtime/host`
Expected: FAIL

- [ ] **Step 3: 实现 config.ts / adapters.ts**

```ts
// src/runtime/host/config.ts
export interface RuntimeConfig {
  baseDomain: string
  hostOrigin: string
  apiBase: string
}

export function runtimeConfig(): RuntimeConfig {
  return {
    baseDomain: import.meta.env.VITE_GAMES_BASE_DOMAIN ?? 'games.example.com',
    hostOrigin: import.meta.env.VITE_HOST_ORIGIN ?? 'https://games.example.com',
    apiBase: import.meta.env.VITE_DATA_BASE_URL ?? '/data'
  }
}

const LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/

export function derivePlayOrigin(id: string, baseDomain: string, protocol: string): string {
  if (!LABEL.test(id)) throw new Error(`非法游戏 id: ${id}`)
  return `${protocol}//${id}.${baseDomain}`
}
```

```ts
// src/runtime/host/adapters.ts
import type { Game } from '../../app/data/types'
import { derivePlayOrigin, runtimeConfig } from './config'

export interface RuntimeTarget {
  mode: 'virtual' | 'hosted' | 'external'
  url: string
  origin: string | null
}

export function resolveRuntimeTargets(game: Game, opts: { baseDomain: string; protocol: string; config?: ReturnType<typeof runtimeConfig> }): RuntimeTarget[] {
  const config = opts.config ?? runtimeConfig()
  const origin = game.playOrigin ?? derivePlayOrigin(game.id, opts.baseDomain, opts.protocol)
  const targets: RuntimeTarget[] = []
  if (game.runtime === 'virtual' && game.version && game.bundle) {
    const absoluteBundle = new URL(game.bundle.url, `${opts.protocol}//${opts.baseDomain}`).href
    const hash = new URLSearchParams({
      v: game.version,
      id: game.id,
      entry: game.entry ?? 'index.html',
      bundle: absoluteBundle,
      sha: game.bundle.sha256
    })
    targets.push({ mode: 'virtual', url: `${origin}/__bootstrap#${hash.toString()}`, origin })
  }
  if (game.runtime === 'hosted' && (game.hostedUrl ?? game.runtime === 'hosted')) {
    targets.push({ mode: 'hosted', url: game.hostedUrl ?? `${origin}/`, origin })
  }
  if (game.fallback === 'hosted' && targets[0]?.mode === 'virtual' && game.hostedUrl) {
    targets.push({ mode: 'hosted', url: game.hostedUrl, origin })
  }
  if (game.fallback !== 'none') {
    targets.push({ mode: 'external', url: game.url, origin: null })
  }
  return targets
}
```

- [ ] **Step 4: 实现 useGameFrame.ts**

```ts
// src/runtime/host/useGameFrame.ts
import { computed, ref, type Ref } from 'vue'
import { HELLO_TIMEOUT_MS, PROTOCOL_VERSION, isGameEvent, isHostCommand, isShellSignal, type FeatureFlags, type GameEvent, type HostCommand } from '../bridge/protocol'
import type { RuntimeTarget } from './adapters'

const BOOTSTRAP_TIMEOUT_MS = 60_000

export type GameFramePhase = 'booting' | 'ready' | 'degraded' | 'error'
export interface GameFrameState {
  phase: GameFramePhase
  progress: number | null
  error: string | null
  paused: boolean
  score: number | null
  storageKeys: number | null
  storageBytes: number | null
}

export interface GameFrameOptions {
  targets: () => RuntimeTarget[]
  features: () => FeatureFlags
  hostOrigin: string
  onExternal: (url: string) => void
  onEvent?: (event: GameEvent) => void
}

export function useGameFrame(options: GameFrameOptions) {
  const iframeRef: Ref<HTMLIFrameElement | null> = ref(null)
  const targetIndex = ref(0)
  const state = ref<GameFrameState>({ phase: 'booting', progress: null, error: null, paused: false, score: null, storageKeys: null, storageBytes: null })
  let port: MessagePort | null = null
  let timeout: ReturnType<typeof setTimeout> | null = null

  const target = computed(() => options.targets()[targetIndex.value] ?? null)
  const sandbox = 'allow-scripts allow-same-origin allow-pointer-lock'
  const allow = computed(() => {
    const parts = ['fullscreen', 'autoplay']
    if (options.features().gamepad) parts.push('gamepad')
    return parts.join('; ')
  })

  function attach(element: HTMLIFrameElement): void {
    iframeRef.value = element
  }

  function start(): void {
    state.value = { phase: 'booting', progress: null, error: null, paused: false, score: null, storageKeys: null, storageBytes: null }
    targetIndex.value = 0
    const current = target.value
    if (!current) { state.value.phase = 'error'; state.value.error = '没有可用的运行目标'; return }
    if (current.mode === 'virtual') armTimeout(BOOTSTRAP_TIMEOUT_MS)
    else state.value.phase = 'ready'
  }

  function armTimeout(ms: number): void {
    clearTimeout()
    timeout = setTimeout(() => {
      if (state.value.phase === 'booting') degrade('运行环境准备超时')
    }, ms)
  }

  function clearTimeout(): void {
    if (timeout) { globalThis.clearTimeout(timeout); timeout = null }
  }

  function onMessage(event: MessageEvent): void {
    const current = target.value
    if (!current || !current.origin) return
    if (event.origin !== current.origin) return
    if (event.source !== iframeRef.value?.contentWindow) return
    if (isShellSignal(event.data)) { degrade(event.data.message); return }
    if (event.data?.type === 'agent:boot' && isGameEvent(event.data)) {
      armTimeout(HELLO_TIMEOUT_MS)
      const channel = new MessageChannel()
      port = channel.port1
      port.onmessage = (message) => { if (isGameEvent(message.data)) handleEvent(message.data) }
      port.start()
      iframeRef.value?.contentWindow?.postMessage(
        { type: 'host:hello', v: PROTOCOL_VERSION, locale: navigator.language, capabilities: { save: true, score: true }, port: channel.port2 } satisfies HostCommand as HostCommand & { port: MessagePort },
        current.origin,
        [channel.port2]
      )
      return
    }
  }

  function handleEvent(event: GameEvent): void {
    options.onEvent?.(event)
    if (event.type === 'agent:hello-ack') { clearTimeout(); state.value.phase = 'ready' }
    else if (event.type === 'game:ready') { clearTimeout(); state.value.phase = 'ready' }
    else if (event.type === 'game:error') { state.value.error = event.message }
    else if (event.type === 'game:score') { state.value.score = event.score }
    else if (event.type === 'game:storage-changed') { state.value.storageKeys = event.keys; state.value.storageBytes = event.bytes }
    else if (event.type === 'game:exit-request') { options.onExternal('__exit__') }
  }

  function send(command: HostCommand): void {
    const current = target.value
    if (!port || !current?.origin) return
    port.postMessage(command)
  }

  function pause(): void { send({ type: 'host:pause' }); state.value.paused = true }
  function resume(): void { send({ type: 'host:resume' }); state.value.paused = false }
  function clearSave(): void { send({ type: 'host:clear-save' }) }

  function degrade(reason: string): void {
    clearTimeout()
    const next = targetIndex.value + 1
    const chain = options.targets()
    if (next < chain.length && chain[next].mode === 'external') {
      state.value.phase = 'degraded'
      state.value.error = reason
      options.onExternal(chain[next].url)
      return
    }
    if (next < chain.length) {
      targetIndex.value = next
      state.value.phase = chain[next].mode === 'hosted' ? 'ready' : 'booting'
      state.value.error = null
      if (chain[next].mode === 'virtual') armTimeout(BOOTSTRAP_TIMEOUT_MS)
      return
    }
    state.value.phase = 'error'
    state.value.error = reason
  }

  function stop(): void {
    clearTimeout()
    port?.close()
    port = null
  }

  return { iframeRef, attach, onMessage, target, state, sandbox, allow, start, stop, pause, resume, clearSave, degrade, send }
}
```

- [ ] **Step 5: 运行测试**

Run: `cd src && npx vitest run runtime/host && npm run typecheck`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
git add src/runtime/host
git commit -m "feat: add host runtime adapters and iframe bridge client"
```

---

### Task 10: GameHost 组件与 GameView 集成

**Files:**
- Create: `src/runtime/host/GameHost.vue`
- Modify: `src/app/views/GameView.vue`
- Modify: `src/app/components/GameCard.vue`（可选：站内可玩标记；有则加，无则跳过）

**Interfaces:**
- Consumes: Task 9 全部、Task 1 类型
- Produces: `<GameHost :game="game" />` 内嵌播放器；`runtime=external` 时保持现行为

- [ ] **Step 1: 实现 GameHost.vue**

```vue
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Game } from '@/data'
import { runtimeConfig } from './config'
import { resolveRuntimeTargets, type RuntimeTarget } from './adapters'
import { useGameFrame } from './useGameFrame'
import { DEFAULT_FEATURES } from '../bridge/protocol'

const props = defineProps<{ game: Game }>()
const config = runtimeConfig()
const frame = useGameFrame({
  targets: () => targets.value,
  features: () => ({ ...DEFAULT_FEATURES, ...props.game.features }),
  hostOrigin: config.hostOrigin,
  onExternal: (url) => {
    if (url === '__exit__') { emit('exit'); return }
    degradedToExternal.value = url
  },
  onEvent: (event) => { if (event.type === 'game:error') lastError.value = event.message }
})
const emit = defineEmits<{ exit: [] }>()
const targets = computed<RuntimeTarget[]>(() => resolveRuntimeTargets(props.game, {
  baseDomain: config.baseDomain,
  protocol: location.protocol,
  config
}))
const degradedToExternal = ref<string | null>(null)
const lastError = ref<string | null>(null)
const aspect = computed(() => props.game.display?.aspect ?? '16:9')
const aspectClass = computed(() => aspect.value === '4:3' ? 'aspect-[4/3]' : aspect.value === 'fill' ? 'h-[70vh]' : 'aspect-video')
const iframeSrc = computed(() => frame.target.value?.url ?? '')
const frameKey = ref(0)
watch(() => props.game.version, () => { frameKey.value++; frame.stop(); frame.start() })
function restart(): void { frameKey.value++; frame.stop(); frame.start() }

function onIframeLoad(): void {
  // iframe 加载完成不等于桥就绪：virtual 模式等 agent:boot，hosted 模式已由 start() 置为 ready
}
onMounted(() => {
  window.addEventListener('message', onMessage)
  frame.start()
})
onBeforeUnmount(() => {
  window.removeEventListener('message', onMessage)
  frame.stop()
})
function onMessage(event: MessageEvent): void { frame.onMessage(event) }
</script>

<template>
  <div class="space-y-3">
    <div class="relative overflow-hidden rounded-xl border border-neutral-800 bg-black" :class="aspectClass">
      <iframe
        v-if="!degradedToExternal"
        :key="frameKey"
        :ref="(el) => frame.attach(el as HTMLIFrameElement)"
        :src="iframeSrc"
        :sandbox="frame.sandbox"
        :allow="frame.allow.value"
        allowfullscreen
        referrerpolicy="no-referrer"
        class="h-full w-full border-0"
        @load="onIframeLoad"
      />
      <div v-else class="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p class="text-neutral-300">站内运行不可用：{{ frame.state.value.error }}</p>
        <a :href="degradedToExternal" target="_blank" rel="noopener noreferrer"
           class="rounded-lg bg-violet-600 px-5 py-2.5 font-medium hover:bg-violet-500">在新标签打开 ↗</a>
      </div>
      <div v-if="frame.state.value.phase === 'booting' && !degradedToExternal"
           class="absolute inset-0 grid place-items-center bg-black/70 text-sm text-neutral-300">
        正在加载游戏…
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-2 text-sm">
      <button class="rounded-md bg-neutral-800 px-3 py-1.5 hover:bg-neutral-700" @click="frame.pause()">暂停</button>
      <button class="rounded-md bg-neutral-800 px-3 py-1.5 hover:bg-neutral-700" @click="frame.resume()">继续</button>
      <button class="rounded-md bg-neutral-800 px-3 py-1.5 hover:bg-neutral-700" @click="restart()">重开</button>
      <button class="rounded-md bg-neutral-800 px-3 py-1.5 hover:bg-neutral-700" @click="frame.clearSave()">清除存档</button>
      <button class="rounded-md bg-neutral-800 px-3 py-1.5 hover:bg-neutral-700" @click="emit('exit')">退出</button>
      <span v-if="frame.state.value.score !== null" class="text-neutral-400">得分：{{ frame.state.value.score }}</span>
      <span v-if="lastError" class="text-red-400">{{ lastError }}</span>
    </div>
  </div>
</template>
```

- [ ] **Step 2: GameView.vue 集成**

在 `GameView.vue` 中：

```vue
<script setup lang="ts">
// 追加导入
import GameHost from '@/runtime/host/GameHost.vue'
import { useRouter } from 'vue-router'
const router = useRouter()
const playable = computed(() => game.value?.runtime === 'virtual' || game.value?.runtime === 'hosted')
function onExit(): void {
  router.push('/')
}
</script>

<template>
  <!-- 原"开始游戏 ↗"按钮改为：可站内运行的游戏显示内嵌播放器，仍保留外链按钮 -->
  <GameHost v-if="playable" :game="game" @exit="onExit" />
  <a v-else :href="game.url" target="_blank" rel="noopener noreferrer"
     class="inline-block rounded-lg bg-violet-600 px-5 py-2.5 font-medium hover:bg-violet-500">开始游戏 ↗</a>
</template>
```

- [ ] **Step 3: 类型检查与构建**

Run: `cd src && npm run typecheck && npm run build`
Expected: PASS；`dist/bootstrap/index.html`、`dist/sw.js`、`dist/agent.js` 存在

- [ ] **Step 4: 提交**

```bash
git add src/runtime/host/GameHost.vue src/app/views/GameView.vue
git commit -m "feat: embed game runtime player in game detail page"
```

---

### Task 11: 夹具管道与多源 mock 服务

**Files:**
- Create: `src/scripts/build-fixtures.mjs`
- Create: `src/scripts/serve-runtime.mjs`
- Create: `src/fixtures/catalog/*.json`（8 个）
- Create: `src/fixtures/games/*/index.html` 等（8 组）
- Modify: `src/scripts/build-data.mjs`（`--with-fixtures` 合并 + 复制 zip）
- Modify: `src/package.json`（scripts：`build:e2e`）

**Interfaces:**
- Consumes: Task 1 的 schema/pickGame、fflate（dev 端打包）
- Produces: `src/fixtures/generated/games/<id>.json`、`src/fixtures/generated/bundles/<id>.zip`；`public/data/bundles/*.zip`；`serve-runtime.mjs --port 4173`

- [ ] **Step 1: 建夹具游戏（8 组）**

目录与关键内容：

```text
src/fixtures/games/abs-paths/index.html      # <link href="/style.css">、<script src="/js/game.js">；body 写 data-ok=abs、data-ready=1、data-version=__FIXTURE_VERSION__
src/fixtures/games/abs-paths/style.css
src/fixtures/games/abs-paths/js/game.js
src/fixtures/games/rel-paths/index.html      # ./a/b.js、../style.css；body 写 data-ok=rel、data-ready=1
src/fixtures/games/rel-paths/a/b.js
src/fixtures/games/rel-paths/style.css
src/fixtures/games/worker/index.html         # new Worker('worker.js')，worker importScripts('lib.js')，结果写 body.data-worker=lib-ok
src/fixtures/games/worker/worker.js
src/fixtures/games/worker/lib.js
src/fixtures/games/storage/index.html        # 启动读 localStorage.k 写 body.data-k；#write 按钮写 k='from-a' 并刷新 data-k；#score 按钮调 __GAME_HOST__.reportScore(42)；body 写 data-ready=1
src/fixtures/games/crash/index.html           # throw new Error('fixture crash')
src/fixtures/games/exfil/index.html           # fetch('https://example.com/x')，成功写 body.data-fetch=allowed，失败写 blocked
src/fixtures/games/nested-sw/index.html       # navigator.serviceWorker.register('/x.js') 抛错则 body.data-sw=blocked
src/fixtures/games/range/index.html           # fetch('/data.bin', { headers: { Range: 'bytes=0-3' } })，写 body.data-range=状态码、body.data-body=响应文本
src/fixtures/games/range/data.bin             # 内容为 ASCII "0123456789"
```

夹具游戏自己的 `data-ready=1` 在 body 解析时同步写入（`<body onload>` 或文档末尾 `<script>`），`helpers.ts` 用它判断游戏可交互。

每个 `index.html` 只做一件事并把结果写到 `document.body.dataset.*`，便于 e2e 断言。

- [ ] **Step 2: 写夹具目录（catalog）**

每个 `<id>.json` 是完整 game 对象但**不含** `runtime/version/bundle`（由脚本注入）。示例：

```jsonc
// src/fixtures/catalog/abs-paths.json
{
  "id": "abs-paths", "name": "绝对路径夹具", "url": "https://example.com/abs",
  "author": { "name": "test" }, "description": "fixture", "durationMinutes": { "min": 1, "max": 1 },
  "type": "other", "tags": ["fixture"], "addedAt": "2026-09-17", "entry": "index.html",
  "display": { "aspect": "4:3" }
}
```

`corrupt.json` 额外带控制字段（脚本读取后剔除）：

```jsonc
{ "id": "corrupt", "_corruptSha": true, "fallback": "hosted", "hostedUrl": "http://corrupt.localhost:4173/", ... }
```

- [ ] **Step 3: 实现 build-fixtures.mjs**

```js
#!/usr/bin/env node
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { zipSync } from 'fflate'

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const gamesDir = path.join(root, 'fixtures', 'games')
const catalogDir = path.join(root, 'fixtures', 'catalog')
const outDir = path.join(root, 'fixtures', 'generated')
const FIXTURE_PORT = process.env.FIXTURE_GAME_PORT ?? '4173'

async function collect(dir, prefix = '') {
  const files = {}
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) Object.assign(files, await collect(full, rel))
    else files[rel] = new Uint8Array(await readFile(full))
  }
  return files
}

const TEXT_EXT = new Set(['.html', '.js', '.css', '.json', '.txt', '.svg'])

function render(files, version) {
  const out = {}
  for (const [name, bytes] of Object.entries(files)) {
    if (TEXT_EXT.has(path.extname(name)) && !name.endsWith('.wav')) {
      out[name] = new TextEncoder().encode(new TextDecoder().decode(bytes).replaceAll('__FIXTURE_VERSION__', version))
    } else {
      out[name] = bytes
    }
  }
  return out
}

function pack(files) {
  return zipSync(Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, [bytes, { level: 6 }]])))
}

await rm(outDir, { recursive: true, force: true })
await mkdir(path.join(outDir, 'bundles'), { recursive: true })
await mkdir(path.join(outDir, 'games'), { recursive: true })
await mkdir(path.join(outDir, 'games-alt'), { recursive: true })

for (const file of (await readdir(catalogDir)).filter((f) => f.endsWith('.json')).sort()) {
  const catalog = JSON.parse(await readFile(path.join(catalogDir, file), 'utf8'))
  const { _corruptSha, ...game } = catalog
  const files = await collect(path.join(gamesDir, game.id))
  const seed = createHash('sha256').update(pack(render(files, ''))).digest('hex')
  const version = seed.slice(0, 16)
  const version2 = seed.slice(2, 18)
  const zipV1 = pack(render(files, version))
  const zipV2 = pack(render(files, version2))
  const shaV1 = createHash('sha256').update(zipV1).digest('hex')
  const shaV2 = createHash('sha256').update(zipV2).digest('hex')
  const declaredSha = _corruptSha ? shaV1.replace(/^./, (c) => (c === '0' ? '1' : '0')) : shaV1
  await writeFile(path.join(outDir, 'bundles', `${game.id}.zip`), zipV1)
  await writeFile(path.join(outDir, 'bundles', `${game.id}-v2.zip`), zipV2)
  await writeFile(path.join(outDir, 'games', `${game.id}.json`), JSON.stringify({
    ...game,
    runtime: 'virtual',
    version,
    entry: game.entry ?? 'index.html',
    bundle: { url: `/data/bundles/${game.id}.zip`, bytes: zipV1.length, sha256: declaredSha }
  }, null, 2) + '\n')
  await writeFile(path.join(outDir, 'games-alt', `${game.id}.json`), JSON.stringify({
    version: version2,
    bundle: { url: `/data/bundles/${game.id}-v2.zip`, bytes: zipV2.length, sha256: shaV2 }
  }, null, 2) + '\n')
  console.log(`[fixtures] ${game.id}: ${Object.keys(files).length} files, v1=${version} v2=${version2} (${zip.length} bytes)`)
}
void FIXTURE_PORT
```

- [ ] **Step 4: build-data.mjs 支持 `--with-fixtures`**

```js
// generate() 签名追加 withFixtures = false
export async function generate({ srcRoot = SRC_ROOT, check = false, withFixtures = false, now = new Date() } = {}) {
  // ... 现有 games 加载之后：
  if (withFixtures) {
    const fixtureDir = path.join(srcRoot, 'fixtures', 'generated', 'games')
    try {
      for (const file of (await readdir(fixtureDir)).filter((f) => f.endsWith('.json')).sort()) {
        games.push(JSON.parse(await readFile(path.join(fixtureDir, file), 'utf8')))
      }
    } catch { /* 未生成夹具时忽略 */ }
  }
  // ... 生成 index/games JSON 后：
  if (withFixtures) {
    const bundlesSrc = path.join(srcRoot, 'fixtures', 'generated', 'bundles')
    try { await cp(bundlesSrc, path.join(outDir, 'bundles'), { recursive: true }) } catch { /* noop */ }
  }
}
// CLI：const withFixtures = process.argv.includes('--with-fixtures')；generate({ check, withFixtures })
```

注意：夹具数据不参与 `--check`（CI 校验仍只跑 `src/games`）。

- [ ] **Step 5: 实现 serve-runtime.mjs**

```js
#!/usr/bin/env node
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const dist = path.join(root, 'dist')
const fixtures = path.join(root, 'fixtures')
const port = Number(process.argv[process.argv.indexOf('--port') + 1] || 4173)
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.zip': 'application/zip', '.bin': 'application/octet-stream', '.wav': 'audio/wav', '.png': 'image/png', '.svg': 'image/svg+xml' }

async function fileOrNull(file) {
  try { const info = await stat(file); return info.isFile() ? file : null } catch { return null }
}

const versionOverrides = new Map()

const server = createServer(async (req, res) => {
  const host = (req.headers.host ?? '').split(':')[0]
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
  const isGameHost = host.endsWith('.localhost')

  try {
    if (url.pathname === '/__test/bump-version') {
      const id = url.searchParams.get('id')
      try {
        const alt = JSON.parse(await readFile(path.join(fixtures, 'generated', 'games-alt', `${id}.json`), 'utf8'))
        versionOverrides.set(id, alt)
        res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}'); return
      } catch {
        res.writeHead(404, { 'Content-Type': 'application/json' }); res.end('{"ok":false}'); return
      }
    }

    if (isGameHost) {
      const gameId = host.split('.')[0]
      if (url.pathname === '/__bootstrap') {
        const file = await fileOrNull(path.join(dist, 'bootstrap', 'index.html'))
        res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' })
        res.end(await readFile(file)); return
      }
      if (url.pathname === '/sw.js' || url.pathname === '/agent.js') {
        const file = path.join(dist, url.pathname.slice(1))
        res.writeHead(200, { 'Content-Type': MIME['.js'], 'Cache-Control': 'no-store' })
        res.end(await readFile(file)); return
      }
      // C 模式 mock：直接服务夹具源文件并注入 agent
      const candidate = await fileOrNull(path.join(fixtures, 'games', gameId, url.pathname.replace(/^\//, '') || 'index.html'))
      if (candidate) {
        const ext = path.extname(candidate)
        if (ext === '.html') {
          const html = await readFile(candidate, 'utf8')
          const tag = `<script src="/agent.js?host=${encodeURIComponent(`http://localhost:${port}`)}"></script>`
          const at = html.search(/<head[^>]*>/i)
          const injected = at >= 0 ? html.slice(0, html.indexOf('>', at) + 1) + tag + html.slice(html.indexOf('>', at) + 1) : tag + html
          res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' })
          res.end(injected); return
        }
        res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream', 'Access-Control-Allow-Origin': '*' })
        res.end(await readFile(candidate)); return
      }
      res.writeHead(404); res.end(); return
    }

    // 宿主站
    let file = url.pathname === '/' ? '/index.html' : url.pathname
    if (file.startsWith('/data/')) {
      const override = versionOverrides.get(file.match(/\/data\/games\/([a-z0-9-]+)\.json$/)?.[1] ?? '')
      if (override) {
        const json = JSON.parse(await readFile(path.join(dist, file), 'utf8'))
        json.version = override.version
        json.bundle = override.bundle
        res.writeHead(200, { 'Content-Type': MIME['.json'], 'Access-Control-Allow-Origin': '*' })
        res.end(JSON.stringify(json)); return
      }
      const headers = { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' }
      if (file.startsWith('/data/bundles/')) headers['Access-Control-Allow-Origin'] = '*'
      res.writeHead(200, headers)
      res.end(await readFile(path.join(dist, file))); return
    }
    const exists = await fileOrNull(path.join(dist, file))
    if (!exists) file = '/index.html'
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'text/html; charset=utf-8' })
    res.end(await readFile(path.join(dist, file)))
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end(String(error))
  }
})

server.listen(port, () => console.log(`[serve-runtime] http://localhost:${port} (+ *.localhost:${port})`))
```

- [ ] **Step 6: package.json 脚本**

```jsonc
"build:fixtures": "node scripts/build-fixtures.mjs",
"build:e2e": "node scripts/build-fixtures.mjs && node scripts/build-data.mjs --with-fixtures && vite build && node scripts/build-runtime.mjs",
```

- [ ] **Step 7: 手工冒烟**

```bash
cd src && npm run build:e2e && node scripts/serve-runtime.mjs --port 4173 &
# 浏览器打开 http://localhost:4173/games/abs-paths，检查是否出现内嵌播放器并可玩
```
Expected: 页面显示"正在加载游戏…"后进入夹具游戏；DevTools Network 中 `sw.js` 已注册，游戏资产来自 Service Worker。

- [ ] **Step 8: 提交**

```bash
git add src/scripts/build-fixtures.mjs src/scripts/serve-runtime.mjs src/scripts/build-data.mjs src/fixtures src/package.json
git commit -m "test: add fixture games, bundler and multi-origin mock server"
```

---

### Task 12: Playwright 基建与核心 e2e

**Files:**
- Create: `src/playwright.config.ts`
- Create: `src/e2e/helpers.ts`
- Create: `src/e2e/core.spec.ts`
- Modify: `src/package.json`（devDependencies `@playwright/test`，scripts `e2e`）

**Interfaces:**
- Consumes: Task 11 的 `build:e2e` 与 `serve-runtime.mjs`
- Produces: `npm run e2e` 可跑；覆盖绝对/相对路径、worker、存储隔离、外联阻断、SW 剥夺

- [ ] **Step 1: 安装依赖与配置**

Run: `cd src && npm install -D @playwright/test && npx playwright install chromium`

```ts
// src/playwright.config.ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  use: { baseURL: 'http://localhost:4173', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run build:e2e && node scripts/serve-runtime.mjs --port 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000
  }
})
```

```jsonc
// package.json scripts 追加
"e2e": "playwright test",
```

- [ ] **Step 2: helpers.ts**

```ts
// src/e2e/helpers.ts
import { expect, type Page } from '@playwright/test'

export async function openGame(page: Page, id: string): Promise<void> {
  await page.goto(`http://localhost:4173/games/${id}`)
  const frame = page.frameLocator('iframe')
  await expect(frame.locator('body')).toHaveAttribute('data-ready', '1', { timeout: 20_000 })
}

export async function frameDataset(page: Page, key: string): Promise<string | null> {
  return page.frameLocator('iframe').locator('body').getAttribute(`data-${key}`)
}
```

- [ ] **Step 3: core.spec.ts**

```ts
import { expect, test } from '@playwright/test'
import { frameDataset, openGame } from './helpers'

test('绝对路径资产可加载', async ({ page }) => {
  await openGame(page, 'abs-paths')
  expect(await frameDataset(page, 'ok')).toBe('abs')
})

test('相对路径与 ../ 可加载', async ({ page }) => {
  await openGame(page, 'rel-paths')
  expect(await frameDataset(page, 'ok')).toBe('rel')
})

test('worker 与 importScripts 可加载', async ({ page }) => {
  await openGame(page, 'worker')
  expect(await frameDataset(page, 'worker')).toBe('lib-ok')
})

test('两个游戏的存储互相隔离且持久', async ({ page }) => {
  await page.goto('http://localhost:4173/games/storage')
  const frame = page.frameLocator('iframe')
  await expect(frame.locator('body')).toHaveAttribute('data-ready', '1')
  await frame.locator('#write').click()
  await expect(frame.locator('body')).toHaveAttribute('data-k', 'from-a')
  await page.reload()
  await expect(page.frameLocator('iframe').locator('body')).toHaveAttribute('data-k', 'from-a')
})

test('外联被 CSP 阻断', async ({ page }) => {
  const failures: string[] = []
  page.on('console', (msg) => { if (msg.type() === 'error') failures.push(msg.text()) })
  await openGame(page, 'exfil')
  expect(await frameDataset(page, 'fetch')).toBe('blocked')
})

test('游戏自注册 SW 被剥夺且运行时 SW 仍工作', async ({ page }) => {
  await openGame(page, 'nested-sw')
  expect(await frameDataset(page, 'sw')).toBe('blocked')
  await expect(page.frameLocator('iframe').locator('body')).toHaveAttribute('data-ready', '1')
})

test('桥事件：score 上报到宿主 UI', async ({ page }) => {
  await openGame(page, 'storage')
  await page.frameLocator('iframe').locator('#score').click()
  await expect(page.getByText('得分：42')).toBeVisible()
})

test('Range 请求返回 206 与正确片段', async ({ page }) => {
  await openGame(page, 'range')
  expect(await frameDataset(page, 'range')).toBe('206')
  expect(await frameDataset(page, 'body')).toBe('0123')
})
```

- [ ] **Step 4: 运行 e2e**

Run: `cd src && npm run e2e`
Expected: 8 个用例全部 PASS。若 SW 未接管导致夹具 404，检查 `serve-runtime.mjs` 是否对 `/__bootstrap`、`/sw.js`、`/agent.js` 返回 200，且 shell 的 fragment 参数完整。

**失败预案（sandbox 内注册 SW 被拒）**：若 Chromium 在 `sandbox="allow-scripts allow-same-origin …"` 的 iframe 中拒绝 `serviceWorker.register`（e2e 报 SecurityError 且资产 404），按 spec §18 的两段式实现：`GameHost` 首次以无 `sandbox` 属性加载 iframe 完成 SW 安装，收到 `runtime:ready` 后由宿主设置 `iframe.sandbox = frame.sandbox` 并触发一次重载；随后所有加载都在 sandbox 下进行。保持本用例不变，作为该预案的回归保护。

- [ ] **Step 5: 提交**

```bash
git add src/playwright.config.ts src/e2e src/package.json src/package-lock.json
git commit -m "test: add playwright e2e for core runtime isolation"
```

---

### Task 13: 降级链与错误面板

**Files:**
- Modify: `src/runtime/host/GameHost.vue`（错误态 UI）
- Test: `src/e2e/degrade.spec.ts`

**Interfaces:**
- Consumes: Task 9 的 `degrade()`、Task 11 的 `corrupt` 夹具（sha 错误、`fallback: hosted`）
- Produces: sha 校验失败 → hosted 降级 → 加载成功；无 hosted 时 external 降级

- [ ] **Step 1: 写 e2e**

```ts
// src/e2e/degrade.spec.ts
import { expect, test } from '@playwright/test'
import { frameDataset } from './helpers'

test('sha 校验失败自动降级到 hosted', async ({ page }) => {
  await page.goto('http://localhost:4173/games/corrupt')
  const frame = page.frameLocator('iframe')
  await expect(frame.locator('body')).toHaveAttribute('data-ready', '1', { timeout: 30_000 })
  expect(await frameDataset(page, 'ok')).toBe('hosted')
})
```

夹具 `corrupt` 的 `index.html` 需在 hosted 形态下也写 `data-ready=1`、`data-ok=hosted`（与 virtual 形态区分：virtual 形态不会成功）。

- [ ] **Step 2: 运行确认失败/通过**

Run: `cd src && npx playwright test e2e/degrade.spec.ts`
Expected: 初次可能失败。此时检查：`corrupt` 夹具的 sha 声明错误 → SW 上报 `runtime:error` → shell 发 `runtime:degrade` → `useGameFrame.degrade()` 切到 hosted 目标。确认 shell 的 `hostOrigin` 与宿主 `event.origin` 一致、`event.source === iframe.contentWindow`。

- [ ] **Step 3: GameHost.vue 补错误态**

在 booting 遮罩后追加：

```vue
<div v-if="frame.state.value.phase === 'error'"
     class="absolute inset-0 grid place-items-center bg-black/80 p-6 text-center text-sm text-neutral-300">
  <div class="space-y-3">
    <p>游戏加载失败：{{ frame.state.value.error }}</p>
    <button class="rounded-md bg-violet-600 px-4 py-2 hover:bg-violet-500" @click="restart()">重试</button>
  </div>
</div>
```

- [ ] **Step 4: 重跑**

Run: `cd src && npx playwright test e2e/degrade.spec.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/e2e/degrade.spec.ts src/runtime/host/GameHost.vue
git commit -m "feat: fallback chain and runtime error panel"
```

---

### Task 14: 版本更新、离线与缓存回收

**Files:**
- Test: `src/e2e/update.spec.ts`
- Modify: `src/runtime/sw/index.ts`（旧版本保留策略、缓存缺失自愈）
- Modify: `src/runtime/host/GameHost.vue`（重开时清空 iframe 状态）

**Interfaces:**
- Consumes: Task 11 mock 服务的 `/__test/bump-version`
- Produces: 版本切换后重新进入即拿新资产；离线可玩；缓存缺失时回 bootstrap 重下

- [ ] **Step 1: 写 e2e**

```ts
// src/e2e/update.spec.ts
import { expect, test } from '@playwright/test'
import { frameDataset, openGame } from './helpers'

test('版本切换后重新进入加载新资产', async ({ page, request }) => {
  await openGame(page, 'abs-paths')
  expect(await frameDataset(page, 'version')).toBe('v1')
  await request.get('http://localhost:4173/__test/bump-version?id=abs-paths&version=v2')
  await page.reload()
  await expect(page.frameLocator('iframe').locator('body')).toHaveAttribute('data-version', 'v2', { timeout: 30_000 })
})

test('离线后已安装游戏仍可玩', async ({ page, context }) => {
  await openGame(page, 'abs-paths')
  await context.setOffline(true)
  await page.reload()
  const frame = page.frameLocator('iframe')
  await expect(frame.locator('body')).toHaveAttribute('data-ready', '1', { timeout: 30_000 })
})
```

夹具 `abs-paths/index.html` 需要把 `data-version` 写为构建时注入的值（asset 路径不含版本，`?v=` 不可靠）。实现：夹具源码写占位符 `__FIXTURE_VERSION__`，`build-fixtures.mjs` 打包时对 `.html`/`.js` 文本执行 `replaceAll`。`corrupt` 夹具除外（它走 hosted）。

**v2 变体（更新 e2e 必需）**：`build-fixtures.mjs` 对每个夹具额外产出 v2 变体，供 mock 服务切换版本：

- 复制源文件后把 `__FIXTURE_VERSION__` 替换为 `version2`（取 sha256 第 2–17 位，保证与 v1 不同）
- 打包为 `fixtures/generated/bundles/<id>-v2.zip`
- 写入 `fixtures/generated/games-alt/<id>.json`，内容为 `{ version, bundle: { url: '/data/bundles/<id>-v2.zip', bytes, sha256 } }`（`build-data.mjs` 只读 `generated/games/`，alt 目录天然被忽略，但 bundles 目录整体复制，`-v2.zip` 会进 dist）

- [ ] **Step 2: 运行确认失败**

Run: `cd src && npx playwright test e2e/update.spec.ts`
Expected: FAIL（v2 变体与 mock 切换未实现）

- [ ] **Step 3: 实现 v2 切换链路**

- `build-fixtures.mjs`：按 Step 1 说明生成 `<id>-v2.zip` 与 `generated/games-alt/<id>.json`
- `serve-runtime.mjs` 的 `/__test/bump-version?id=<id>`：读取 `fixtures/generated/games-alt/<id>.json` 并把 `{version, bundle}` 存入 `versionOverrides`；在返回 `/data/games/<id>.json` 时用 override 覆盖 `version` 与 `bundle` 三个字段（url/bytes/sha256）
- `GameHost.vue` 的 `watch(() => props.game.version)` 与 `:key="frameKey"`、SW 的缓存未命中导航重定向已在 Task 6/10 实现，本任务只做验证
- 离线用例依赖 SW 已缓存 v1：`openGame` 完成后 `caches.keys()` 应含 `bundle-<v1>`；若 `context.setOffline(true)` 后 reload 落到 bootstrap（因为 `/` 请求在离线时由 SW 缓存提供，不受网络状态影响），确认 `handle()` 未对导航请求走网络

- [ ] **Step 4: 重跑**

Run: `cd src && npx playwright test e2e/update.spec.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/e2e/update.spec.ts src/scripts/build-fixtures.mjs src/scripts/serve-runtime.mjs src/fixtures
git commit -m "test: add bundle update and offline e2e with v2 fixture variants"
```

---

### Task 15: 存档管理 UI 与清除/快照

**Files:**
- Modify: `src/runtime/host/GameHost.vue`
- Modify: `src/runtime/agent/index.ts`（实现 `host:snapshot-request` 与 `host:clear-save` 响应）
- Test: `src/e2e/save.spec.ts`

**Interfaces:**
- Consumes: Task 7、Task 9
- Produces: 宿主显示存档键数/字节；清除存档后游戏内 localStorage 为空；snapshot 事件返回数据

- [ ] **Step 1: 写 e2e**

```ts
// src/e2e/save.spec.ts
import { expect, test } from '@playwright/test'

test('写入后宿主显示存档大小，清除后归零', async ({ page }) => {
  await page.goto('http://localhost:4173/games/storage')
  const frame = page.frameLocator('iframe')
  await expect(frame.locator('body')).toHaveAttribute('data-ready', '1')
  await frame.locator('#write').click()
  await expect(page.getByText(/存档：\d+ 项/)).toBeVisible()
  await page.getByRole('button', { name: '清除存档' }).click()
  await expect(page.getByText('存档：0 项')).toBeVisible()
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd src && npx playwright test e2e/save.spec.ts`
Expected: FAIL（无"存档：N 项"文案）

- [ ] **Step 3: 实现**

- Agent：`host:clear-save` 已实现；补 `host:snapshot-request`：

```ts
else if (command.type === 'host:snapshot-request') {
  const data = JSON.stringify(Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])))
  const bytes = new TextEncoder().encode(data).length
  const truncated = bytes > 512 * 1024
  emit({ type: 'game:snapshot', id: command.id, data: truncated ? '' : data, bytes, truncated })
}
```

- `useGameFrame`：收到 `game:storage-changed` 后更新 state（已有）；新增 `requestSnapshot(id)`；`clearSave()` 后本地状态清零
- `GameHost.vue`：`<span v-if="frame.state.value.storageKeys !== null">存档：{{ frame.state.value.storageKeys }} 项</span>`；清除后立即把 `storageKeys` 置 0

- [ ] **Step 4: 重跑**

Run: `cd src && npx playwright test e2e/save.spec.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/e2e/save.spec.ts src/runtime/agent/index.ts src/runtime/host/useGameFrame.ts src/runtime/host/GameHost.vue
git commit -m "feat: host-visible save stats, clear and snapshot bridge"
```

---

### Task 16: C 模式（hosted）完整支持

**Files:**
- Modify: `src/runtime/host/adapters.ts`（hosted 目标推导）
- Modify: `src/runtime/agent/index.ts`（C 模式下允许或剥夺游戏自身 SW：保持剥夺）
- Create: `src/e2e/hosted.spec.ts`
- Modify: `src/fixtures/catalog/hosted-demo.json` + `src/fixtures/games/hosted-demo/*`

**Interfaces:**
- Consumes: Task 11 mock 服务已支持 C 模式静态托管与 agent 注入
- Produces: `runtime=hosted` 游戏可内嵌运行、桥、存储、CSP 与外联阻断行为与 A 一致

- [ ] **Step 1: 夹具与 e2e**

`src/fixtures/catalog/hosted-demo.json`：

```jsonc
{
  "id": "hosted-demo", "name": "托管夹具", "url": "https://example.com/hosted",
  "author": { "name": "test" }, "description": "fixture", "durationMinutes": { "min": 1, "max": 1 },
  "type": "other", "tags": ["fixture"], "addedAt": "2026-09-17",
  "runtime": "hosted", "hostedUrl": "http://hosted-demo.localhost:4173/"
}
```

`src/fixtures/games/hosted-demo/index.html`：写 `data-ok=hosted`、`data-ready=1`，按钮 `#score` 调 `__GAME_HOST__.reportScore(7)`，按钮 `#write` 写 localStorage。

```ts
// src/e2e/hosted.spec.ts
import { expect, test } from '@playwright/test'

test('hosted 模式可运行并建立桥', async ({ page }) => {
  await page.goto('http://localhost:4173/games/hosted-demo')
  const frame = page.frameLocator('iframe')
  await expect(frame.locator('body')).toHaveAttribute('data-ready', '1')
  await frame.locator('#score').click()
  await expect(page.getByText('得分：7')).toBeVisible()
})

test('hosted 模式外联仍被阻断', async ({ page }) => {
  await page.goto('http://localhost:4173/games/hosted-demo')
  const frame = page.frameLocator('iframe')
  await expect(frame.locator('body')).toHaveAttribute('data-fetch', 'blocked')
})
```

`hosted-demo` 夹具同样需要 exfil 探测（fetch `https://example.com/x` 写 `body.data-fetch`）；其 CSP 头由 Step 3 在 mock 服务端补上。

- [ ] **Step 2: 运行确认失败**

Run: `cd src && npx playwright test e2e/hosted.spec.ts`
Expected: FAIL（CSP 头缺失或桥未建立）

- [ ] **Step 3: 修复实现**

- `serve-runtime.mjs`：为游戏 host 的 HTML 响应加 `Content-Security-Policy`（与 `csp.ts` 同语义的默认 features）、`X-Content-Type-Options`、`Referrer-Policy`。mock 中内联一份最小 CSP 生成（注释注明与运行时同源语义），不要 import `runtime/sw/csp.ts`（Node 端无 TS 构建）
- `adapters.ts`：`hosted` 分支在 `hostedUrl` 缺失时用 `playOrigin` 推导（schema 已强制 `hostedUrl`，此处仅防御）
- hosted 目标的就绪与桥：`useGameFrame.start()` 已把 hosted 置为 `ready`，`agent:boot` 到达后照常建桥（Task 9/10 已实现），本任务只做验证；若 3s 内收不到 `agent:boot`，仅在控制台告警，不降级（后端未注入 agent 时游戏仍可玩，只是无桥）

- [ ] **Step 4: 重跑**

Run: `cd src && npx playwright test e2e/hosted.spec.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/e2e/hosted.spec.ts src/fixtures src/scripts/serve-runtime.mjs src/runtime/host
git commit -m "feat: complete hosted runtime mode with agent injection and csp"
```

---

### Task 17: 部署产物与 nginx/k8s 配置

**Files:**
- Modify: `deploy/nginx.conf`
- Modify: `deploy/k8s/ingress.yaml`
- Create: `deploy/k8s/tls-wildcard-secret.example.yaml`（占位示例）
- Create: `src/scripts/build-data.test.ts` 追加产物路径断言（或新增 `src/scripts/artifacts.test.ts`）
- Modify: `docs/README.md`（运维配置说明小节）

**Interfaces:**
- Consumes: Task 8 的固定产物路径
- Produces: nginx 通配 server block（仅暴露 `/__bootstrap`、`/sw.js`、`/agent.js`）；ingress 通配 host；构建产物测试防止路径漂移

- [ ] **Step 1: 写失败测试（防止构建产物路径漂移）**

```ts
// src/scripts/artifacts.test.ts
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const nginx = await readFile(path.resolve(root, '..', 'deploy', 'nginx.conf'), 'utf8')

test('nginx 通配 server block 只暴露运行时三件套', () => {
  expect(nginx).toContain('server_name *.games.example.com')
  expect(nginx).toMatch(/location\s*=\s*\/__bootstrap/)
  expect(nginx).toMatch(/location\s*=\s*\/sw\.js/)
  expect(nginx).toMatch(/location\s*=\s*\/agent\.js/)
})

test('宿主站为 bundle 提供 CORS', () => {
  expect(nginx).toMatch(/location \/data\/bundles\/[\s\S]*Access-Control-Allow-Origin/)
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd src && npx vitest run scripts/artifacts.test.ts`
Expected: FAIL

- [ ] **Step 3: 更新 nginx.conf**

```nginx
server {
  listen 80;
  server_name *.games.example.com;
  root /usr/share/nginx/html;

  location = /__bootstrap {
    add_header Cache-Control "no-store";
    try_files /bootstrap/index.html =404;
  }
  location = /sw.js {
    add_header Cache-Control "no-store";
    try_files /sw.js =404;
  }
  location = /agent.js {
    add_header Cache-Control "no-store";
    try_files /agent.js =404;
  }
  location / { return 404; }
}

server {
  listen 80;
  server_name _;
  # 现有主站配置保持不变，另在 location /data/bundles/ 增加：
  # add_header Access-Control-Allow-Origin "*";
}
```

（实现时把现有主站 server block 原样保留，仅插入 CORS 头；`try_files` 前的 `/` 前缀写法按实际 nginx 行为校验：`try_files /bootstrap/index.html =404;` 会从 root 解析，正确。）

- [ ] **Step 4: 更新 ingress 与文档**

```yaml
# deploy/k8s/ingress.yaml 增加第二条 rule 与 TLS
spec:
  tls:
    - hosts: ['games.example.com', '*.games.example.com']
      secretName: webgame-collection-tls
  rules:
    - host: games.example.com
      http: { paths: [{ path: /, pathType: Prefix, backend: { service: { name: webgame-collection, port: { number: 80 } } } }] }
    - host: '*.games.example.com'
      http: { paths: [{ path: /, pathType: Prefix, backend: { service: { name: webgame-collection, port: { number: 80 } } } }] }
```

`deploy/k8s/tls-wildcard-secret.example.yaml` 注释说明：由 acme.sh `dns_ali` 或 cert-manager（alidns webhook）签发 `*.games.example.com` 后导入为 `kubernetes.io/tls` Secret。

`docs/README.md` 追加"运行时运维配置"一节：DNS 通配、证书签发/续期（DNS-01 + AK/SK）、ingress 通配、`VITE_GAMES_BASE_DOMAIN`/`VITE_HOST_ORIGIN` 构建变量。

- [ ] **Step 5: 运行测试 + 提交**

Run: `cd src && npx vitest run scripts/artifacts.test.ts`
Expected: PASS

```bash
git add deploy src/scripts/artifacts.test.ts docs/README.md
git commit -m "chore: add wildcard game host nginx block, ingress rules and ops docs"
```

---

### Task 18: CI 扩展与最终验收

**Files:**
- Modify: `.github/workflows/validate.yml`
- Modify: `src/package.json`（`check` 保持；确认 `test` 不包含 e2e）

**Interfaces:**
- Consumes: 全部前序任务
- Produces: PR 上 `validate:data` + 单测/构建 + e2e 全绿

- [ ] **Step 1: 扩展 validate.yml**

```yaml
  e2e:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: src
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: npm, cache-dependency-path: src/package-lock.json }
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run build:fixtures
      - run: npm run e2e
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-trace
          path: src/test-results
          retention-days: 7
```

- [ ] **Step 2: 本地最终验收**

```bash
cd src && npm run validate:data && npm run check && npm run e2e
```
Expected: 全部 PASS；`npm run check` 输出 vitest 全绿 + typecheck + build 成功。

- [ ] **Step 3: 按 spec §17 核对验收清单**

逐条走查 spec 的 11 条验收标准；对"离线可玩""缓存回收""两游戏隔离"等已在 e2e 覆盖项记录用例名；对部署类（镜像产物、ingress）记录手工验证方式。

- [ ] **Step 4: 提交**

```bash
git add .github/workflows/validate.yml
git commit -m "ci: run runtime e2e on pull requests"
```

---

## 自检记录（写计划时已核对）

- **Spec 覆盖**：§5 源模型 → Task 1/9；§6 隔离与 CSP → Task 4/7/16；§7 桥 → Task 2/7/9；§8 存档 → Task 7/15；§9 schema/API → Task 1/9；§10 SW 虚拟源 → Task 3/4/5/6/11/14；§11 C 模式 → Task 16；§12 降级 → Task 13；§13 代码组织 → Task 2-10；§14 部署 → Task 17；§15 测试 → Task 11/12；§16 错误处理 → Task 13/14；§17 验收 → Task 18。
- **类型一致性**：`RuntimeTarget`、`GameFrameState`、`HostCommand`/`GameEvent`/`ShellMessage`/`ShellSignal`、`DEFAULT_FEATURES`、`AGENT_CACHE_PATH`、`RuntimeMeta` 在全部任务中同名同形。
- **降级链路**：`runtime:install` 失败/超时 → shell 发 `runtime:degrade`（`ShellSignal`）→ `useGameFrame.degrade()` 依 `RuntimeTarget` 链切换；宿主侧两段超时（bootstrap 60s / 握手 10s）。
