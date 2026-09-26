# 内容管线前端接入实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 前端接入后端内容管线：双源合并数据层（静态 JSON ∪ API，同 id API 胜出）、`/submit` 提交页全生命周期、`/admin` 审核管理页、分层 e2e（mock + 真栈 smoke）。

**Architecture:** `data/` 增加 `ApiContentRepository`（ETag 条件请求 + in-flight 去重）与 `MergeContentRepository`（并集合并 + `source` 标注 + API 故障降级纯静态）；`app/content/` 新模块承载提交/管理 API 客户端（fetch 包装 + XHR 上传进度）与错误映射；五个新视图沿用既有平面海报设计语言与 auth 页表单模式；e2e 分 mock 层（page.route）与真栈 smoke（docker 编排脚本 + 独立 playwright 配置，可 skip）。

**Tech Stack:** Vue 3 + vue-router + TypeScript + Vite 8 + Tailwind 4；vitest（node 环境 + happy-dom 按需）；Playwright；后端契约以 crearte-server `feat/content-pipeline` 分支（已推送 origin）为准。

**Spec:** `docs/superpowers/specs/2026-09-27-content-pipeline-frontend-design.md`（本仓，分支 `feat/content-pipeline-ui`）

## Global Constraints

- 工作目录：`/Users/xingfend/Documents/MyDocs/project/repos/crearte`，npm 命令都在 `src/` 下执行
- 分支：`feat/content-pipeline-ui`（已建）。每次 commit 前 `git branch --show-current` 确认非 master
- **执行前置**：计划 A（`feat/sw-bundle-decryption`，SW 解密链）先合并进 master，本分支 merge 最新 master 后再执行 Task 11（真栈 smoke 的「可玩/降级」断言依赖解密链）。Task 1-10 不依赖 A，可先行
- **部署顺序约束**：本分支上线前，后端 content-pipeline 必须已在生产部署并跑过存量 import——否则静态 4 作品已删、API 又无数据，线上目录为空（Task 3 删文件的不可逆前提）
- 禁止从 crearte-server 复制代码；后端契约（路径/DTO/错误码/状态码）以本计划 §Task 4 清单为准，实现时如对不上以 crearte-server `src/internal/handler/*`、`src/internal/api/dto/content.go` 实测为准
- 零新运行时依赖；UI 沿用既有 token：`border-2 border-ink`、`bg-surface`、`bg-paper`、`bg-highlight`、`shadow-hard`、`btn-ink lift`、`font-display`/`font-mono`、状态色 `bg-accent-ink text-paper`
- 管理页与表单预填**直连 apiRepo 单例**（`data/index.ts` 导出的 `apiRepo`，可能为 null），不走 merge
- 所有写操作按钮 in-flight 禁用防重复提交；错误文案经 `toContentMessage()` 统一映射
- 门禁：`npm run check`、`npm run e2e`、`npm run e2e:noauth` 全绿（Task 12 终验）；stack smoke 尽力而为（skip 不算失败）
- CHANGELOG：`docs/CHANGELOG.md` 英文行+中文行紧邻、条目间空行、高版本在上

## Review Focus

1. **双源同时失败**（API 5xx + 静态 500）→ 目录错误态 + 重试按钮，不白屏、不无限骨架屏 → Task 2 单测 + 既有 landing.spec 错误态用例回归（Task 3 验证步骤）
2. **非 draft/rejected 提交的编辑防护** → pending/approved 打开 `/submit/:id` 为只读展示、无保存入口；操作竞态（他端已撤回/已审）→ 后端 404/409 映射为友好文案并返回列表 → Task 8 视图逻辑 + Task 10 mock e2e
3. **上传时序约束** → work_id/version 未填时 bundle 文件选择器禁用；上传后修改 work_id/version → 已传 bundle 作废清空并提示重传（AAD 绑定，后端会 400） → Task 8 表单联动 + Task 10 e2e
4. **限流 429**（上传 10/min、提交 20/hour）→ 按钮倒计时（Retry-After）后自动恢复，期间禁止重复提交 → Task 4 client retryAfterSeconds + Task 7/8 UI + Task 10 e2e
5. **权限边界** → 非 admin 访问 `/admin*` 重定向首页、header 不显示「审核」；未登录访问 `/submit*` 跳登录带 next 回跳；`VITE_API_BASE_URL` 为空（noauth）时五个路由全部重定向首页 → Task 5 guards 单测 + Task 10 e2e

---

### Task 1: `ApiContentRepository`（ETag + in-flight 去重）

**Files:**
- Modify: `src/app/data/staticRepo.ts`（导出断言函数供复用，行为不变）
- Create: `src/app/data/apiRepo.ts`
- Test: `src/app/data/apiRepo.test.ts`

**Interfaces:**
- Consumes: `ContentRepository`/`NotFoundError`（`data/repository.ts` 既有）、`staticRepo` 导出的断言函数
- Produces: `ApiContentRepository`（构造 `(base: string, docsSource: Pick<ContentRepository,'listDocs'|'getDoc'>)`）；`assertGamesIndex`/`assertGameSummary`/`assertGameDetail` 导出（Task 2 复用）

- [ ] **Step 1: staticRepo 导出断言函数（重构，不改行为）**

`staticRepo.ts`：`assertGameSummary`、`assertGamesIndex` 加 `export`；新增导出：

```ts
export function assertGameDetail(value: unknown, path: string): asserts value is Game {
  assertGameSummary(value, path)
  const g = value as Game
  if (g.runtime === 'virtual' && !g.bundle) {
    throw new Error(`数据格式错误: ${path}.bundle 缺失（runtime=virtual 必须提供 bundle）`)
  }
}
```

`getGame` 内联的 virtual/bundle 检查替换为 `assertGameDetail(data, \`games/${id}\`)`（原 `assertGameSummary` 调用一并被涵盖）。

- [ ] **Step 2: 写失败测试 `src/app/data/apiRepo.test.ts`**

```ts
import { afterEach, describe, expect, test, vi } from 'vitest'
import { NotFoundError } from './repository'
import { ApiContentRepository } from './apiRepo'

const INDEX = { schemaVersion: 1, generatedAt: 'x', games: [{ id: 'g1', name: 'G', url: 'https://u', author: { name: 'a' }, description: 'd', durationMinutes: { min: 1, max: 2 }, type: 'puzzle', tags: [], addedAt: '2026-09-27' }] }

function jsonResponse(body: unknown, init: { status?: number; etag?: string; cacheControl?: string } = {}): Response {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (init.etag) headers.ETag = init.etag
  if (init.cacheControl) headers['Cache-Control'] = init.cacheControl
  return new Response(init.status === 304 ? null : JSON.stringify(body), { status: init.status ?? 200, headers })
}

const docsStub = { listDocs: async () => [], getDoc: async () => { throw new NotFoundError('x') } }

afterEach(() => vi.unstubAllGlobals())

describe('ApiContentRepository', () => {
  test('listGames 解析 games 数组', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(INDEX)))
    const repo = new ApiContentRepository('http://api', docsStub)
    const games = await repo.listGames()
    expect(games.map((g) => g.id)).toEqual(['g1'])
  })

  test('ETag 条件请求：第二次带 If-None-Match，304 复用缓存 body', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(INDEX))
    vi.stubGlobal('fetch', fetchMock)
    const repo = new ApiContentRepository('http://api', docsStub)
    await repo.listGames()
    expect(fetchMock.mock.calls[0][1]?.headers).not.toHaveProperty('If-None-Match')

    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if ((init?.headers as Record<string, string>)?.['If-None-Match'] === 'W/"e1"') return new Response(null, { status: 304 })
      return jsonResponse(INDEX)
    })
    // 首次响应无 ETag 头则不缓存——重设 stub 使首次带 ETag
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(INDEX, { etag: 'W/"e1"' })))
    const repo2 = new ApiContentRepository('http://api', docsStub)
    await repo2.listGames()
    vi.stubGlobal('fetch', fetchMock)
    const again = await repo2.listGames()
    expect(again.map((g) => g.id)).toEqual(['g1'])
    expect(fetchMock).toHaveBeenCalled()
  })

  test('Cache-Control: no-store 时不缓存 ETag', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(INDEX, { etag: 'W/"e1"', cacheControl: 'no-store' }))
    vi.stubGlobal('fetch', fetchMock)
    const repo = new ApiContentRepository('http://api', docsStub)
    await repo.listGames()
    await repo.listGames()
    expect(fetchMock.mock.calls[1][1]?.headers).not.toHaveProperty('If-None-Match')
  })

  test('404 → NotFoundError；500 → Error；网络错误 → Error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })))
    const repo = new ApiContentRepository('http://api', docsStub)
    await expect(repo.getGame('nope')).rejects.toThrow(NotFoundError)

    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })))
    await expect(repo.listGames()).rejects.toThrow(/请求失败 500/)

    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed') }))
    await expect(repo.listGames()).rejects.toThrow(/网络请求失败/)
  })

  test('并发同 URL 去重：两次 listGames 只发一次请求', async () => {
    let resolveFirst: (r: Response) => void = () => {}
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { resolveFirst = resolve }))
    vi.stubGlobal('fetch', fetchMock)
    const repo = new ApiContentRepository('http://api', docsStub)
    const p1 = repo.listGames()
    const p2 = repo.listGames()
    resolveFirst(jsonResponse(INDEX))
    await Promise.all([p1, p2])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('getGame：virtual 缺 bundle 抛数据格式错误', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ ...INDEX.games[0], runtime: 'virtual' })))
    const repo = new ApiContentRepository('http://api', docsStub)
    await expect(repo.getGame('g1')).rejects.toThrow(/bundle 缺失/)
  })

  test('listDocs/getDoc 委托静态源', async () => {
    const listDocs = vi.fn(async () => [{ slug: 's', title: 't', order: 1 }])
    const repo = new ApiContentRepository('http://api', { listDocs, getDoc: async () => { throw new NotFoundError('x') } })
    expect((await repo.listDocs())[0].slug).toBe('s')
    expect(listDocs).toHaveBeenCalled()
  })
})
```

注意「ETag 条件请求」用例分两个 repo 实例是因为首个响应必须带 ETag 才会缓存——按给出的代码原样实现即可。

- [ ] **Step 3: 运行确认失败**

Run: `cd src && npx vitest run app/data/apiRepo.test.ts`
Expected: FAIL（`apiRepo.ts` 不存在）

- [ ] **Step 4: 实现 `src/app/data/apiRepo.ts`**

```ts
import { NotFoundError, type ContentRepository } from './repository'
import { assertGameDetail, assertGamesIndex } from './staticRepo'
import type { Doc, DocMeta, Game, GameSummary } from './types'

interface CacheEntry { etag: string; body: unknown }

// 后端内容 API 读侧：ETag 条件请求 + in-flight 去重（缓存语义与 staticRepo 一致）。
// 与 staticRepo 的差异：不做永久 promise 缓存——每次调用都再验证（304 时零 body 传输），
// 保证审批发布后目录在 max-age 60s 内自然刷新。docs 委托静态源（内容管线不含文档）。
export class ApiContentRepository implements ContentRepository {
  private readonly etagCache = new Map<string, CacheEntry>()
  private readonly inflight = new Map<string, Promise<unknown>>()

  constructor(
    private readonly base: string,
    private readonly docsSource: Pick<ContentRepository, 'listDocs' | 'getDoc'>
  ) {}

  private fetchJson(path: string): Promise<unknown> {
    const url = `${this.base}${path}`
    let pending = this.inflight.get(url)
    if (!pending) {
      pending = this.request(url)
      this.inflight.set(url, pending)
      const done = (): void => { this.inflight.delete(url) }
      pending.then(done, done)
    }
    return pending
  }

  private async request(url: string): Promise<unknown> {
    const headers: Record<string, string> = {}
    const cached = this.etagCache.get(url)
    if (cached) headers['If-None-Match'] = cached.etag
    let response: Response
    try {
      response = await fetch(url, { headers })
    } catch {
      throw new Error(`网络请求失败: ${url}`)
    }
    if (response.status === 304) {
      if (cached) return cached.body
      throw new Error(`数据格式错误: 304 但无本地缓存 ${url}`)
    }
    if (response.status === 404) throw new NotFoundError(url)
    if (!response.ok) throw new Error(`请求失败 ${response.status}: ${url}`)
    const body: unknown = await response.json()
    const etag = response.headers.get('ETag')
    if (etag && !(response.headers.get('Cache-Control') ?? '').includes('no-store')) {
      this.etagCache.set(url, { etag, body })
    }
    return body
  }

  listGames(): Promise<GameSummary[]> {
    return this.fetchJson('/api/games').then((body) => assertGamesIndex(body).games)
  }

  getGame(id: string): Promise<Game> {
    return this.fetchJson(`/api/games/${encodeURIComponent(id)}`).then((body) => {
      assertGameDetail(body, `games/${id}`)
      return body
    })
  }

  listDocs(): Promise<DocMeta[]> {
    return this.docsSource.listDocs()
  }

  getDoc(slug: string): Promise<Doc> {
    return this.docsSource.getDoc(slug)
  }
}
```

- [ ] **Step 5: 运行确认通过（含 staticRepo 既有测试回归）**

Run: `cd src && npx vitest run app/data/`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add src/app/data/staticRepo.ts src/app/data/apiRepo.ts src/app/data/apiRepo.test.ts
git commit -m "feat(data): add ApiContentRepository with ETag revalidation and in-flight dedup"
```

---

### Task 2: `MergeContentRepository` + 装配 + `source` 类型

**Files:**
- Modify: `src/app/data/types.ts`（`GameSummary.source?: 'api' | 'static'`）
- Create: `src/app/data/mergeRepo.ts`
- Modify: `src/app/data/index.ts`（装配 + 导出 `apiRepo` 单例）
- Test: `src/app/data/mergeRepo.test.ts`

**Interfaces:**
- Consumes: Task 1 `ApiContentRepository`；既有 `StaticContentRepository`
- Produces: `MergeContentRepository(api, staticRepo)`；`repo` 单例（apiBase 空→纯静态，非空→merge）；**`apiRepo: ApiContentRepository | null` 具名导出**（Task 6/8/9 管理页与预填直连）；`GameSummary.source`

- [ ] **Step 1: 写失败测试 `src/app/data/mergeRepo.test.ts`**

```ts
import { describe, expect, test, vi } from 'vitest'
import { NotFoundError, type ContentRepository } from './repository'
import { MergeContentRepository } from './mergeRepo'
import type { Game, GameSummary } from './types'

function summary(id: string, name = id): GameSummary {
  return { id, name, url: `https://u/${id}`, author: { name: 'a' }, description: 'd', durationMinutes: { min: 1, max: 2 }, type: 'puzzle', tags: [], addedAt: '2026-09-27' }
}
function game(id: string): Game { return summary(id) }

function stub(impl: Partial<ContentRepository>): ContentRepository {
  return {
    listGames: async () => [],
    getGame: async () => { throw new NotFoundError('x') },
    listDocs: async () => [],
    getDoc: async () => { throw new NotFoundError('x') },
    ...impl
  }
}

describe('MergeContentRepository.listGames', () => {
  test('并集，同 id API 胜出，source 标注', async () => {
    const api = stub({ listGames: async () => [summary('dup', 'API 版'), summary('api-only')] })
    const stat = stub({ listGames: async () => [summary('dup', '静态版'), summary('static-only')] })
    const games = await new MergeContentRepository(api, stat).listGames()
    expect(games.map((g) => g.id).sort()).toEqual(['api-only', 'dup', 'static-only'])
    const dup = games.find((g) => g.id === 'dup')!
    expect(dup.name).toBe('API 版')
    expect(dup.source).toBe('api')
    expect(games.find((g) => g.id === 'static-only')!.source).toBe('static')
    expect(games.find((g) => g.id === 'api-only')!.source).toBe('api')
  })

  test('API 失败 → console.warn + 纯静态', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const api = stub({ listGames: async () => { throw new Error('boom') } })
    const stat = stub({ listGames: async () => [summary('s1')] })
    const games = await new MergeContentRepository(api, stat).listGames()
    expect(games.map((g) => g.id)).toEqual(['s1'])
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  test('静态失败但 API 成功 → 纯 API（warn）', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const api = stub({ listGames: async () => [summary('a1')] })
    const stat = stub({ listGames: async () => { throw new Error('static down') } })
    const games = await new MergeContentRepository(api, stat).listGames()
    expect(games.map((g) => g.id)).toEqual(['a1'])
    warn.mockRestore()
  })

  test('双失败 → 抛 API 侧错误', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const api = stub({ listGames: async () => { throw new Error('api down') } })
    const stat = stub({ listGames: async () => { throw new Error('static down') } })
    await expect(new MergeContentRepository(api, stat).listGames()).rejects.toThrow('api down')
    vi.mocked(console.warn).mockRestore()
  })
})

describe('MergeContentRepository.getGame', () => {
  test('API 命中 → source api', async () => {
    const api = stub({ getGame: async () => game('g') })
    const g = await new MergeContentRepository(api, stub({})).getGame('g')
    expect(g.source).toBe('api')
  })
  test('API 404 → 回落静态，source static', async () => {
    const api = stub({ getGame: async () => { throw new NotFoundError('g') } })
    const stat = stub({ getGame: async () => game('g') })
    const g = await new MergeContentRepository(api, stat).getGame('g')
    expect(g.source).toBe('static')
  })
  test('API 5xx/网络错 → 直接上抛（不伪装 NotFound）', async () => {
    const api = stub({ getGame: async () => { throw new Error('请求失败 503') } })
    const stat = stub({ getGame: async () => game('g') })
    await expect(new MergeContentRepository(api, stat).getGame('g')).rejects.toThrow(/503/)
  })
  test('双侧 404 → NotFoundError', async () => {
    const merge = new MergeContentRepository(stub({}), stub({}))
    await expect(merge.getGame('nope')).rejects.toThrow(NotFoundError)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd src && npx vitest run app/data/mergeRepo.test.ts`
Expected: FAIL（`mergeRepo.ts` 不存在）

- [ ] **Step 3: 实现**

`types.ts` 的 `GameSummary` 末尾加：

```ts
  /** 前端合并标注（非服务端契约）：目录数据来自 API 源还是静态源；纯静态模式下为 undefined */
  source?: 'api' | 'static'
```

`src/app/data/mergeRepo.ts`：

```ts
import { NotFoundError, type ContentRepository } from './repository'
import type { Doc, DocMeta, Game, GameSummary } from './types'

// 双源合并：静态 JSON（PR 贡献通道）∪ 后端 API（审核发布通道）。
// 合并规则（spec §3/§4）：同 id API 胜出；API 目录失败降级纯静态（运营约定
// 「import 后删静态」保证降级不会复活已下架作品）；详情仅 404 回落静态，
// 5xx/网络错直接上抛（不把故障伪装成 NotFound）。
export class MergeContentRepository implements ContentRepository {
  constructor(
    private readonly api: ContentRepository,
    private readonly staticRepo: ContentRepository
  ) {}

  async listGames(): Promise<GameSummary[]> {
    const [apiResult, staticResult] = await Promise.allSettled([
      this.api.listGames(),
      this.staticRepo.listGames()
    ])
    if (apiResult.status === 'rejected' && staticResult.status === 'rejected') {
      throw apiResult.reason instanceof Error ? apiResult.reason : new Error(String(apiResult.reason))
    }
    let staticGames: GameSummary[] = []
    if (staticResult.status === 'fulfilled') {
      staticGames = staticResult.value.map((g) => ({ ...g, source: 'static' as const }))
    } else {
      console.warn('[data] 静态目录不可用，仅展示 API 源', staticResult.reason)
    }
    if (apiResult.status === 'rejected') {
      console.warn('[data] API 目录不可用，降级静态源', apiResult.reason)
      return staticGames
    }
    const merged = new Map<string, GameSummary>()
    for (const g of staticGames) merged.set(g.id, g)
    for (const g of apiResult.value) merged.set(g.id, { ...g, source: 'api' })
    return [...merged.values()]
  }

  async getGame(id: string): Promise<Game> {
    try {
      return { ...(await this.api.getGame(id)), source: 'api' }
    } catch (error) {
      if (error instanceof NotFoundError) {
        return { ...(await this.staticRepo.getGame(id)), source: 'static' }
      }
      throw error
    }
  }

  listDocs(): Promise<DocMeta[]> {
    return this.staticRepo.listDocs()
  }

  getDoc(slug: string): Promise<Doc> {
    return this.staticRepo.getDoc(slug)
  }
}
```

`src/app/data/index.ts` 整文件替换为：

```ts
import { ApiContentRepository } from './apiRepo'
import { MergeContentRepository } from './mergeRepo'
import type { ContentRepository } from './repository'
import { StaticContentRepository } from './staticRepo'

export * from './repository'
export * from './types'

const staticRepo = new StaticContentRepository()
const apiBase = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '')

// 双源装配：VITE_API_BASE_URL 为空（noauth 部署）→ 纯静态；非空 → 并集合并（spec §3）
export const apiRepo: ApiContentRepository | null = apiBase
  ? new ApiContentRepository(apiBase, staticRepo)
  : null
export const repo: ContentRepository = apiRepo
  ? new MergeContentRepository(apiRepo, staticRepo)
  : staticRepo
```

- [ ] **Step 4: 运行确认通过（全量单测回归，静态装配路径不变）**

Run: `cd src && npx vitest run`
Expected: PASS（mergeRepo 新用例 + 既有全绿；单测环境 `VITE_API_BASE_URL` 未设 → `repo` 为纯静态，既有依赖 `repo` 的测试不受影响）

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add src/app/data/types.ts src/app/data/mergeRepo.ts src/app/data/mergeRepo.test.ts src/app/data/index.ts
git commit -m "feat(data): add MergeContentRepository (union merge, API wins, degrade to static)"
```

---

### Task 3: 静态源徽标 + 存量 4 作品迁移 e2e 夹具

**Files:**
- Modify: `src/app/components/GameCard.vue`（static 源徽标）
- Move: `src/games/{2048,a-dark-room,arclight-nightcast,case-files}.json` → `src/fixtures/catalog/`（内容不变）
- Modify: `src/scripts/build-fixtures.mjs`（external runtime 直出分支）

**Interfaces:**
- Consumes: Task 2 的 `GameSummary.source`
- Produces: e2e 数据集不变（15 款、同 id 同内容 → landing/outbound spec 零改动）；`src/games/` 清空（生产静态源为空，目录全量来自 API）

**背景（执行者必读）**：e2e 数据 = `src/games/*`（4 款真实作品）+ `fixtures/catalog/*`（11 款夹具）。直接删 4 款会打破 landing.spec（「收录 15 款」、精选区精确顺序含 2048 等）与 outbound.spec（用 2048 的外链）。迁移为夹具后 e2e 数据集逐字节等价（buildIndex 按 id 排序，与来源目录无关），两套 spec 零改动。`build-fixtures.mjs` 目前只认 hosted 直出，external 会误入 virtual 打包分支（找不到 `fixtures/games/<id>/` 目录而崩溃），需加分支。生产影响：`src/games/` 空 → 生产构建静态 index 为空数组 → 目录完全依赖 API 源（Global Constraints 的部署顺序约束由此生效）。

- [ ] **Step 1: GameCard 徽标**

`GameCard.vue` 模板 tag 行（`v-if="hiddenTags.length"` 的 span 之后）追加：

```html
        <span
          v-if="game.source === 'static'"
          class="border-[1.5px] border-ink bg-highlight px-1 py-0.5 font-mono text-[0.625rem]"
        >社区投稿</span>
```

- [ ] **Step 2: 迁移 4 作品为 e2e 夹具**

```bash
cd /Users/xingfend/Documents/MyDocs/project/repos/crearte
git mv src/games/2048.json src/fixtures/catalog/2048.json
git mv src/games/a-dark-room.json src/fixtures/catalog/a-dark-room.json
git mv src/games/arclight-nightcast.json src/fixtures/catalog/arclight-nightcast.json
git mv src/games/case-files.json src/fixtures/catalog/case-files.json
```

检查 4 个文件均含 `"runtime": "external"`（迁移前提；若有 hosted/virtual 需先停下来上报——external/hosted 才走直出分支）。

- [ ] **Step 3: build-fixtures external 直出分支**

```js
  if (game.runtime === 'hosted' || game.runtime === 'external') {
    await writeFile(path.join(outDir, 'games', `${game.id}.json`), JSON.stringify(game, null, 2) + '\n')
    console.log(`[fixtures] ${game.id}: ${game.runtime} (no bundle)`)
    continue
  }
```

（替换原 `if (game.runtime === 'hosted')` 三行块。）

- [ ] **Step 4: 验证——夹具生成等价 + 生产数据构建（空静态）+ e2e 全绿**

```bash
cd src
npm run build:fixtures
python3 -c "
import json, pathlib
gen = {p.name: json.loads(p.read_text()) for p in pathlib.Path('fixtures/generated/games').glob('*.json')}
assert gen['2048.json']['runtime'] == 'external' and gen['2048.json']['url'] == 'https://play2048.co/', '2048 迁移失真'
assert len(gen) == 15, f'夹具总数 {len(gen)} != 15'
print('fixtures ok:', len(gen))"
npm run validate:data        # src/games 已空：0 个游戏也应通过
node scripts/build-data.mjs --with-fixtures
python3 -c "
import json
idx = json.load(open('public/data/index.json'))
ids = [g['id'] for g in idx['games']]
assert len(ids) == 15 and '2048' in ids and ids == sorted(ids), ids
print('index ok:', len(ids))"
npm run e2e                  # landing/outbound/core 等全部零改动通过
npm run e2e:noauth
```

Expected: 全部通过。若 landing.spec「收录 15 款」失败，检查是否有夹具被 external 分支漏输出。

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add -A src/app/components/GameCard.vue src/scripts/build-fixtures.mjs src/games src/fixtures/catalog
git commit -m "feat(data): badge static-source works on cards; move 4 legacy games to e2e fixtures"
```

---

### Task 4: 内容 API 客户端（fetch + XHR 上传）+ 错误映射 + session.getToken

**Files:**
- Modify: `src/app/auth/session.ts`（`AuthSession` 增加 `getToken()`）
- Create: `src/app/content/errors.ts`、`src/app/content/types.ts`、`src/app/content/client.ts`、`src/app/content/index.ts`
- Test: `src/app/content/errors.test.ts`、`src/app/content/client.test.ts`、`src/app/auth/session.test.ts`（追加）

**Interfaces:**
- Consumes: `session`（token 来源）、`Game` 类型（预填）
- Produces（Task 6-9 全部依赖，签名冻结）:
  - `AuthSession.getToken(): string | null`
  - `ContentApiError { status: number; code: ContentErrorCode; retryAfterSeconds: number | null; details: string | null }`、`CONTENT_ERROR_MESSAGES`、`toContentErrorCode(unknown)`、`toContentMessage(unknown): string`
  - 类型：`SubmissionKind = 'new_work'|'new_version'|'metadata_change'`、`SubmissionStatus = 'draft'|'pending'|'approved'|'rejected'`、`WorkPayload`、`SubmissionView`、`UploadResult`、`SubmissionDraft { kind; work_id; payload; bundle_upload_id; cover_upload_id; submit }`、`SubmissionUpdate { payload; bundle_upload_id; cover_upload_id; submit }`
  - `ContentClient` 接口 + `contentClient` 单例（`content/index.ts`，apiBase 空时为 null-safe 桩：所有方法 reject `ContentApiError(0,'network')`，视图层由 authEnabled 守卫兜底不会调用）

**后端契约清单（实测冻结，crearte-server feat/content-pipeline）**：

| 调用 | 端点 | 成功响应 |
|---|---|---|
| 上传 | `POST /api/uploads`（multipart：`kind`=bundle/cover、`work_id`、`version`（bundle 必填）、`file`） | `201 {upload_id, sha256, bytes, kid?}` |
| 建提交 | `POST /api/submissions`（SubmissionDraft JSON） | `201 SubmissionView` |
| 我的提交 | `GET /api/submissions/mine` | `200 {submissions: SubmissionView[]}` |
| 详情 | `GET /api/submissions/:id` | `200 SubmissionView`（admin 可看任意） |
| 更新 | `PUT /api/submissions/:id`（SubmissionUpdate JSON，payload 必填全量） | `200 SubmissionView` |
| 删除/撤回 | `DELETE /api/submissions/:id`（draft 或 pending） | `204` |
| 管理队列 | `GET /api/admin/submissions?status=&limit=&offset=` | `200 {submissions, total}` |
| 通过/拒绝 | `POST /api/admin/submissions/:id/approve` / `reject`（reject body `{note}` 必填） | `200 {ok:true}` |
| 下架/恢复 | `POST /api/admin/works/:id/unpublish` / `republish`（body `{}`） | `200 {ok:true}` |
| revoke/恢复 | `POST /api/admin/works/:id/versions/:version/revoke`（body `{revoked: bool}`） | `200 {ok:true}` |
| 预填详情 | `GET /api/games/:id`（公开，经 apiRepo） | `200 Game` |

状态机（后端冻结）：仅 draft/rejected 可 PUT（含 `submit:true` 提交/重提）；pending 只能 DELETE（撤回，暂存对象由后端清理）；重复消费同一 upload_id 会被 409/400 拒绝，但**回传 envelope 里已有的同值 id 不重查**（列表页「提交」= GET 详情 → PUT 原样字段 + `submit:true`）。

- [ ] **Step 1: 写失败测试**

`src/app/content/errors.test.ts`：

```ts
import { expect, test } from 'vitest'
import { AuthApiError } from '@/auth/errors'
import { ContentApiError, toContentErrorCode, toContentMessage } from './errors'

test('已知码映射，未知码归 internal', () => {
  expect(toContentErrorCode('conflict')).toBe('conflict')
  expect(toContentErrorCode('rate_limited')).toBe('rate_limited')
  expect(toContentErrorCode('wat')).toBe('internal')
  expect(toContentErrorCode(undefined)).toBe('internal')
})

test('toContentMessage：ContentApiError 按码取文案，invalid_request 优先展示字段详情', () => {
  expect(toContentMessage(new ContentApiError(409, 'conflict', 'x'))).toContain('冲突')
  const detailed = new ContentApiError(400, 'invalid_request', 'x', null, 'version: must match pattern')
  expect(toContentMessage(detailed)).toBe('version: must match pattern')
  expect(toContentMessage(new ContentApiError(400, 'invalid_request', 'x'))).toContain('格式')
})

test('toContentMessage：AuthApiError 与未知错误', () => {
  expect(toContentMessage(new AuthApiError(401, 'unauthorized', 'x'))).toContain('登录')
  expect(toContentMessage(new Error('boom'))).toBe('boom')
  expect(toContentMessage('weird')).toBe('weird')
})
```

`src/app/content/client.test.ts`：

```ts
import { afterEach, describe, expect, test, vi } from 'vitest'
import { ContentApiError } from './errors'
import { createContentClient } from './client'

function jsonResponse(body: unknown, init: { status?: number; retryAfter?: string } = {}): Response {
  const headers: Record<string, string> = {}
  if (init.retryAfter) headers['Retry-After'] = init.retryAfter
  return new Response(init.status && init.status >= 400 && body === null
    ? JSON.stringify({ error: { code: 'internal', message: 'x' } })
    : JSON.stringify(body), { status: init.status ?? 200, headers })
}

const opts = { baseUrl: 'http://api', getToken: () => 'tok', onUnauthorized: vi.fn() }

afterEach(() => vi.unstubAllGlobals())

describe('createContentClient', () => {
  test('listMine：带 Bearer，解析 submissions', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ submissions: [{ id: 's1' }] }))
    vi.stubGlobal('fetch', fetchMock)
    const client = createContentClient(opts)
    const subs = await client.listMine()
    expect(subs[0].id).toBe('s1')
    expect((fetchMock.mock.calls[0][1]?.headers as Record<string, string>).Authorization).toBe('Bearer tok')
  })

  test('429：解析 Retry-After 与 code', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ error: { code: 'rate_limited', message: 'slow down' } }),
      { status: 429, headers: { 'Retry-After': '37' } }
    )))
    const client = createContentClient(opts)
    const err = await client.listMine().catch((e) => e)
    expect(err).toBeInstanceOf(ContentApiError)
    expect(err.code).toBe('rate_limited')
    expect(err.retryAfterSeconds).toBe(37)
  })

  test('400 invalid_request：details 保留服务端字段详情', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ error: { code: 'invalid_request', message: 'work_id: taken; version: bad' } }),
      { status: 400 }
    )))
    const client = createContentClient(opts)
    const err = await client.createSubmission({ kind: 'new_work', work_id: 'w', payload: {} as never, bundle_upload_id: '', cover_upload_id: '', submit: false }).catch((e) => e)
    expect(err.code).toBe('invalid_request')
    expect(err.details).toBe('work_id: taken; version: bad')
  })

  test('401 unauthorized 触发 onUnauthorized', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ error: { code: 'unauthorized', message: 'x' } }), { status: 401 }
    )))
    const onUnauthorized = vi.fn()
    const client = createContentClient({ ...opts, onUnauthorized })
    await client.listMine().catch(() => undefined)
    expect(onUnauthorized).toHaveBeenCalled()
  })

  test('DELETE 204 无 body；adminSetRevoked 组 body 与路径', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    const client = createContentClient(opts)
    await expect(client.deleteSubmission('s1')).resolves.toBeUndefined()

    fetchMock.mockImplementation(async () => jsonResponse({ ok: true }))
    await client.adminSetRevoked('w1', 'v2', true)
    const [url, init] = fetchMock.mock.calls[1]
    expect(url).toBe('http://api/api/admin/works/w1/versions/v2/revoke')
    expect(JSON.parse(String(init?.body))).toEqual({ revoked: true })
  })

  test('网络错误 → code network', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed') }))
    const client = createContentClient(opts)
    const err = await client.listMine().catch((e) => e)
    expect(err.code).toBe('network')
  })
})
```

XHR 上传路径（`uploadFile`）依赖浏览器 XHR，node 环境不单测——由 Task 10 mock e2e（真实浏览器 XHR + page.route）覆盖；`upload()` 的参数校验（bundle 缺 work_id/version、cover 类型白名单、大小上限）为纯逻辑，抽 `validateUploadInput()` 导出并加用例：

```ts
// client.test.ts 追加
import { validateUploadInput } from './client'

describe('validateUploadInput', () => {
  const zip = { name: 'a.zip', size: 10, type: 'application/zip' } as File
  const png = { name: 'c.png', size: 10, type: 'image/png' } as File
  test('bundle 必须带 work_id/version 且为 zip 且 ≤100MB', () => {
    expect(validateUploadInput({ kind: 'bundle', file: zip })).toMatch(/work_id/)
    expect(validateUploadInput({ kind: 'bundle', workId: 'w', version: 'v1', file: zip })).toBeNull()
    expect(validateUploadInput({ kind: 'bundle', workId: 'w', version: 'v1', file: { ...zip, name: 'a.rar', type: '' } as File })).toMatch(/zip/)
    expect(validateUploadInput({ kind: 'bundle', workId: 'w', version: 'v1', file: { ...zip, size: 101 * 1024 * 1024 } as File })).toMatch(/超过上限/)
  })
  test('cover 限 png/jpeg/webp 且 ≤5MB', () => {
    expect(validateUploadInput({ kind: 'cover', file: png })).toBeNull()
    expect(validateUploadInput({ kind: 'cover', file: { ...png, type: 'image/gif', name: 'c.gif' } as File })).toMatch(/png/)
    expect(validateUploadInput({ kind: 'cover', file: { ...png, size: 6 * 1024 * 1024 } as File })).toMatch(/超过上限/)
  })
})
```

`src/app/auth/session.test.ts` 追加（沿用该文件既有构造方式）：

```ts
test('getToken 返回当前会话 token，登出后为 null', async () => {
  // 沿用文件内既有的 fake client/store 构造 session；若既有辅助函数命名不同，按其模式适配
  const session = createAuthSession({ client: fakeClient({ token: 't1' }), store: memoryStore() })
  expect(session.getToken()).toBeNull()
  await session.login('a@b.c', 'password123')
  expect(session.getToken()).toBe('t1')
  session.logout()
  expect(session.getToken()).toBeNull()
})
```

注意：`session.test.ts` 若已有 `fakeClient`/`memoryStore` 等测试辅助，直接复用；没有则按该文件既有 mock 模式等价改写（断言不变：初始 null → 登录后 token → 登出 null）。

- [ ] **Step 2: 运行确认失败**

Run: `cd src && npx vitest run app/content/ app/auth/session.test.ts`
Expected: FAIL（模块不存在 + getToken 未实现）

- [ ] **Step 3: 实现**

`src/app/auth/session.ts`：接口 `AuthSession` 增加 `getToken(): string | null`；返回对象增加：

```ts
    getToken() {
      return current?.token ?? null
    },
```

`src/app/content/errors.ts`：

```ts
import { AuthApiError, toUserMessage as authMessage } from '@/auth/errors'

export type ContentErrorCode =
  | 'invalid_request'
  | 'conflict'
  | 'not_found'
  | 'payload_too_large'
  | 'unsupported_media_type'
  | 'rate_limited'
  | 'unauthorized'
  | 'forbidden'
  | 'internal'
  | 'network'

export const CONTENT_ERROR_MESSAGES: Record<ContentErrorCode, string> = {
  invalid_request: '提交内容格式不正确，请检查表单',
  conflict: '状态冲突：内容已存在或提交状态已变化，请刷新后重试',
  not_found: '内容不存在，可能已被删除',
  payload_too_large: '文件超过上限（bundle 100MB / 封面 5MB）',
  unsupported_media_type: '文件类型不支持（bundle 需 zip；封面需 png/jpeg/webp）',
  rate_limited: '操作太频繁，请稍后重试',
  unauthorized: '登录已过期，请重新登录',
  forbidden: '需要管理员权限',
  internal: '服务暂时不可用，请稍后重试',
  network: '网络连接失败，请检查网络后重试'
}

const KNOWN_CODES = new Set<string>(Object.keys(CONTENT_ERROR_MESSAGES))

export function toContentErrorCode(value: unknown): ContentErrorCode {
  return typeof value === 'string' && KNOWN_CODES.has(value) ? (value as ContentErrorCode) : 'internal'
}

export class ContentApiError extends Error {
  readonly status: number
  readonly code: ContentErrorCode
  readonly retryAfterSeconds: number | null
  /** invalid_request 时保留服务端字段级详情（`field: reason; ...`），UI 优先展示 */
  readonly details: string | null

  constructor(status: number, code: ContentErrorCode, message: string, retryAfterSeconds: number | null = null, details: string | null = null) {
    super(message)
    this.name = 'ContentApiError'
    this.status = status
    this.code = code
    this.retryAfterSeconds = retryAfterSeconds
    this.details = details
  }
}

export function toContentMessage(error: unknown): string {
  if (error instanceof ContentApiError) {
    if (error.code === 'invalid_request' && error.details) return error.details
    if (error.code === 'rate_limited' && error.retryAfterSeconds) {
      return `${CONTENT_ERROR_MESSAGES.rate_limited}（${error.retryAfterSeconds} 秒后）`
    }
    return CONTENT_ERROR_MESSAGES[error.code]
  }
  if (error instanceof AuthApiError) return authMessage(error)
  return error instanceof Error ? error.message : String(error)
}
```

`src/app/content/types.ts`：

```ts
import type { GameType } from '@/data/types'

export type SubmissionKind = 'new_work' | 'new_version' | 'metadata_change'
export type SubmissionStatus = 'draft' | 'pending' | 'approved' | 'rejected'

export interface WorkPayload {
  id: string
  name: string
  url: string
  author: { name: string; url?: string }
  description: string
  durationMinutes: { min: number; max: number }
  type: GameType
  tags: string[]
  intro?: string
  runtime?: 'external' | 'virtual'
  version?: string
  entry?: string
}

export interface SubmissionView {
  id: string
  kind: SubmissionKind
  status: SubmissionStatus
  work_id: string
  payload: WorkPayload
  bundle_upload_id?: string
  cover_upload_id?: string
  review_note?: string
  created_at: string
  updated_at: string
}

export interface UploadResult {
  upload_id: string
  sha256: string
  bytes: number
  kid?: string
}

export interface SubmissionDraft {
  kind: SubmissionKind
  work_id: string
  payload: WorkPayload
  bundle_upload_id: string
  cover_upload_id: string
  submit: boolean
}

export interface SubmissionUpdate {
  payload: WorkPayload
  bundle_upload_id: string
  cover_upload_id: string
  submit: boolean
}

export interface UploadInput {
  kind: 'bundle' | 'cover'
  workId?: string
  version?: string
  file: File
}

export interface UploadProgress {
  received: number
  total: number
}
```

`src/app/content/client.ts`：

```ts
import type { Game } from '@/data/types'
import { ContentApiError, toContentErrorCode } from './errors'
import type { SubmissionDraft, SubmissionUpdate, SubmissionView, UploadInput, UploadProgress, UploadResult } from './types'

export const MAX_BUNDLE_BYTES = 100 * 1024 * 1024
export const MAX_COVER_BYTES = 5 * 1024 * 1024
const COVER_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])
const COVER_EXT = /\.(png|jpe?g|webp)$/i

export interface ContentClientOptions {
  baseUrl: string
  getToken: () => string | null
  onUnauthorized?: () => void
  fetchImpl?: typeof fetch
}

export interface ContentClient {
  upload(input: UploadInput, onProgress?: (p: UploadProgress) => void): Promise<UploadResult>
  createSubmission(body: SubmissionDraft): Promise<SubmissionView>
  listMine(): Promise<SubmissionView[]>
  getSubmission(id: string): Promise<SubmissionView>
  updateSubmission(id: string, body: SubmissionUpdate): Promise<SubmissionView>
  deleteSubmission(id: string): Promise<void>
  adminListSubmissions(params: { status?: string; limit?: number; offset?: number }): Promise<{ submissions: SubmissionView[]; total: number }>
  adminApprove(id: string): Promise<void>
  adminReject(id: string, note: string): Promise<void>
  adminUnpublish(workId: string): Promise<void>
  adminRepublish(workId: string): Promise<void>
  adminSetRevoked(workId: string, version: string, revoked: boolean): Promise<void>
  gameDetail(id: string): Promise<Game>
}

/** 上传前置校验（纯函数，可单测）：返回错误文案或 null */
export function validateUploadInput(input: UploadInput): string | null {
  if (input.kind === 'bundle') {
    if (!input.workId || !input.version) return '请先填写作品 id 与版本号，再上传 bundle'
    const isZip = input.file.type === 'application/zip' ||
      input.file.type === 'application/x-zip-compressed' || /\.zip$/i.test(input.file.name)
    if (!isZip) return 'bundle 需为 zip 文件'
    if (input.file.size > MAX_BUNDLE_BYTES) return 'bundle 超过上限 100MB'
    if (input.file.size === 0) return 'bundle 为空文件'
    return null
  }
  const extOk = COVER_EXT.test(input.file.name)
  const typeOk = input.file.type === '' || COVER_TYPES.has(input.file.type)
  if (!extOk || !typeOk) return '封面需为 png/jpeg/webp'
  if (input.file.size > MAX_COVER_BYTES) return '封面超过上限 5MB'
  if (input.file.size === 0) return '封面为空文件'
  return null
}

function parseRetryAfter(headers: Headers): number | null {
  const raw = headers.get('Retry-After')
  if (!raw) return null
  const seconds = Number.parseInt(raw, 10)
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null
}

function toApiError(status: number, response: Response | null, body: { error?: { code?: unknown; message?: unknown } } | null, network = false): ContentApiError {
  const code = network ? 'network' : toContentErrorCode(body?.error?.code)
  const message = typeof body?.error?.message === 'string' ? body.error.message : `content request failed: ${code}`
  return new ContentApiError(
    status,
    code,
    message,
    response ? parseRetryAfter(response.headers) : null,
    code === 'invalid_request' && typeof body?.error?.message === 'string' ? body.error.message : null
  )
}

export function createContentClient(options: ContentClientOptions): ContentClient {
  const doFetch = options.fetchImpl ?? globalThis.fetch
  const base = options.baseUrl.replace(/\/+$/, '')

  async function send<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = options.getToken()
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(init.headers as Record<string, string> | undefined),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
    let response: Response
    try {
      response = await doFetch(`${base}${path}`, { ...init, headers })
    } catch {
      throw toApiError(0, null, null, true)
    }
    if (!response.ok) {
      let body: { error?: { code?: unknown; message?: unknown } } | null = null
      try { body = await response.json() } catch { /* 保留 null */ }
      const error = toApiError(response.status, response, body)
      if (response.status === 401 && error.code === 'unauthorized') options.onUnauthorized?.()
      throw error
    }
    if (response.status === 204) return undefined as T
    return (await response.json()) as T
  }

  // fetch 无上传进度事件：bundle 最大 100MB，必须用 XHR
  function uploadXhr(path: string, form: FormData, onProgress?: (p: UploadProgress) => void): Promise<UploadResult> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('POST', `${base}${path}`)
      const token = options.getToken()
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
      xhr.upload.onprogress = (event) => {
        onProgress?.({ received: event.loaded, total: event.lengthComputable ? event.total : 0 })
      }
      xhr.onload = () => {
        let body: { error?: { code?: unknown; message?: unknown } } & Partial<UploadResult> | null = null
        try { body = JSON.parse(xhr.responseText) } catch { /* 保留 null */ }
        if (xhr.status >= 200 && xhr.status < 300 && body && body.upload_id) {
          resolve({ upload_id: body.upload_id, sha256: String(body.sha256 ?? ''), bytes: Number(body.bytes ?? 0), ...(body.kid ? { kid: String(body.kid) } : {}) })
          return
        }
        const code = toContentErrorCode(body?.error?.code)
        if (xhr.status === 401 && code === 'unauthorized') options.onUnauthorized?.()
        reject(new ContentApiError(xhr.status, code, typeof body?.error?.message === 'string' ? body.error.message : `upload failed: ${code}`, null, code === 'invalid_request' && typeof body?.error?.message === 'string' ? body.error.message : null))
      }
      xhr.onerror = () => reject(toApiError(0, null, null, true))
      xhr.send(form)
    })
  }

  const submissionBody = (b: SubmissionDraft | SubmissionUpdate): string => JSON.stringify(b)

  return {
    async upload(input, onProgress) {
      const invalid = validateUploadInput(input)
      if (invalid) throw new ContentApiError(0, 'invalid_request', invalid, null, invalid)
      const form = new FormData()
      form.append('kind', input.kind)
      if (input.kind === 'bundle') {
        form.append('work_id', input.workId!)
        form.append('version', input.version!)
      }
      form.append('file', input.file)
      return uploadXhr('/api/uploads', form, onProgress)
    },
    createSubmission(body) {
      return send<SubmissionView>('/api/submissions', { method: 'POST', body: submissionBody(body) })
    },
    listMine() {
      return send<{ submissions: SubmissionView[] }>('/api/submissions/mine').then((r) => r.submissions)
    },
    getSubmission(id) {
      return send<SubmissionView>(`/api/submissions/${encodeURIComponent(id)}`)
    },
    updateSubmission(id, body) {
      return send<SubmissionView>(`/api/submissions/${encodeURIComponent(id)}`, { method: 'PUT', body: submissionBody(body) })
    },
    deleteSubmission(id) {
      return send<void>(`/api/submissions/${encodeURIComponent(id)}`, { method: 'DELETE' })
    },
    adminListSubmissions(params) {
      const query = new URLSearchParams()
      if (params.status) query.set('status', params.status)
      query.set('limit', String(params.limit ?? 20))
      query.set('offset', String(params.offset ?? 0))
      return send<{ submissions: SubmissionView[]; total: number }>(`/api/admin/submissions?${query.toString()}`)
    },
    adminApprove(id) {
      return send<{ ok: boolean }>(`/api/admin/submissions/${encodeURIComponent(id)}/approve`, { method: 'POST', body: '{}' }).then(() => undefined)
    },
    adminReject(id, note) {
      return send<{ ok: boolean }>(`/api/admin/submissions/${encodeURIComponent(id)}/reject`, { method: 'POST', body: JSON.stringify({ note }) }).then(() => undefined)
    },
    adminUnpublish(workId) {
      return send<{ ok: boolean }>(`/api/admin/works/${encodeURIComponent(workId)}/unpublish`, { method: 'POST', body: '{}' }).then(() => undefined)
    },
    adminRepublish(workId) {
      return send<{ ok: boolean }>(`/api/admin/works/${encodeURIComponent(workId)}/republish`, { method: 'POST', body: '{}' }).then(() => undefined)
    },
    adminSetRevoked(workId, version, revoked) {
      return send<{ ok: boolean }>(`/api/admin/works/${encodeURIComponent(workId)}/versions/${encodeURIComponent(version)}/revoke`, { method: 'POST', body: JSON.stringify({ revoked }) }).then(() => undefined)
    },
    gameDetail(id) {
      return send<Game>(`/api/games/${encodeURIComponent(id)}`)
    }
  }
}
```

`src/app/content/index.ts`：

```ts
import { session } from '@/auth'
import { createContentClient, type ContentClient } from './client'
import { ContentApiError } from './errors'

export * from './client'
export * from './errors'
export * from './types'

const apiBase = (import.meta.env.VITE_API_BASE_URL ?? '').trim()

// apiBase 为空（noauth 部署）时所有调用直接失败：路由守卫已挡住页面入口，这里只是兜底
const disabledClient: ContentClient = new Proxy({} as ContentClient, {
  get: () => () => Promise.reject(new ContentApiError(0, 'network', '内容 API 未启用'))
})

export const contentClient: ContentClient = apiBase
  ? createContentClient({
      baseUrl: apiBase,
      getToken: () => session.getToken(),
      onUnauthorized: () => session.invalidate()
    })
  : disabledClient
```

- [ ] **Step 4: 运行确认通过**

Run: `cd src && npx vitest run app/content/ app/auth/ && npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add src/app/auth/session.ts src/app/auth/session.test.ts src/app/content/
git commit -m "feat(content): content API client (fetch + XHR upload progress) with error mapping; expose session.getToken"
```

---

### Task 5: 路由、守卫（requiresAdmin）与 Header 入口

**Files:**
- Modify: `src/app/router/guards.ts`（`NavigationContext.isAdmin` + requiresAdmin 分支 + 受账号保护路由名单扩充）
- Modify: `src/app/router/index.ts`（5 条新路由 + beforeEach 传 isAdmin；本任务先挂**占位视图**，Task 7/8/9 替换为完整实现）
- Create（占位，后续任务整文件替换）: `src/app/views/SubmitListView.vue`、`SubmitFormView.vue`、`AdminView.vue`、`AdminSubmissionView.vue`
- Modify: `src/app/components/AppHeader.vue`（登录态「提交作品」、admin「审核」入口）
- Test: `src/app/router/guards.test.ts`（追加）

**Interfaces:**
- Consumes: Task 4 的 `session`（`state.user.role`）
- Produces: 路由 name 冻结：`submit`（/submit）、`submit-new`（/submit/new）、`submit-edit`（/submit/:id）、`admin`（/admin）、`admin-submission`（/admin/submissions/:id）；meta：前三个 `requiresAuth`，后两个 `requiresAuth + requiresAdmin`

- [ ] **Step 1: 写失败测试（追加到 `guards.test.ts`，沿用既有用例的构造风格）**

```ts
const ctx = (over: Partial<NavigationContext> = {}): NavigationContext => ({
  authEnabled: true, authenticated: true, isAdmin: false, ...over
})
const to = (name: string, meta: Record<string, unknown> = {}, fullPath = `/${name}`) =>
  ({ name, meta, fullPath }) as never

test('requiresAdmin：非 admin 重定向首页，admin 放行', () => {
  expect(resolveNavigation(to('admin', { requiresAuth: true, requiresAdmin: true }), ctx())).toEqual({ name: 'home' })
  expect(resolveNavigation(to('admin', { requiresAuth: true, requiresAdmin: true }), ctx({ isAdmin: true }))).toBe(true)
})

test('未登录访问 /submit → login 带 next 回跳', () => {
  expect(resolveNavigation(to('submit-new', { requiresAuth: true }, '/submit/new'), ctx({ authenticated: false })))
    .toEqual({ name: 'login', query: { next: '/submit/new' } })
})

test('auth 未启用：submit/admin 全家重定向首页', () => {
  for (const name of ['submit', 'submit-new', 'submit-edit', 'admin', 'admin-submission']) {
    expect(resolveNavigation(to(name, { requiresAuth: true }), ctx({ authEnabled: false }))).toEqual({ name: 'home' })
  }
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd src && npx vitest run app/router/guards.test.ts`
Expected: FAIL（`NavigationContext` 无 `isAdmin`，类型错误即红）

- [ ] **Step 3: 实现 guards.ts（整文件）**

```ts
import type { RouteLocationNormalized } from 'vue-router'

const AUTH_ROUTE_NAMES = new Set([
  'login', 'register', 'account',
  'submit', 'submit-new', 'submit-edit', 'admin', 'admin-submission'
])

export interface NavigationContext {
  authEnabled: boolean
  authenticated: boolean
  isAdmin: boolean
}

export type NavigationDecision = true | { name: string; query?: Record<string, string> }

export function resolveNavigation(
  to: Pick<RouteLocationNormalized, 'name' | 'meta' | 'fullPath'>,
  context: NavigationContext
): NavigationDecision {
  if (!context.authEnabled && typeof to.name === 'string' && AUTH_ROUTE_NAMES.has(to.name)) {
    return { name: 'home' }
  }
  if (context.authEnabled && to.meta.requiresAuth === true && !context.authenticated) {
    return { name: 'login', query: { next: to.fullPath } }
  }
  if (context.authEnabled && to.meta.requiresAdmin === true && !context.isAdmin) {
    return { name: 'home' }
  }
  return true
}
```

（`requiresAdmin` 检查放在 requiresAuth 之后：未登录先跳登录；已登录非 admin 回首页。）

- [ ] **Step 4: router/index.ts 加路由与 isAdmin**

routes 数组 `/account` 行之后插入：

```ts
    { path: '/submit', name: 'submit', component: () => import('@/views/SubmitListView.vue'), meta: { requiresAuth: true } },
    { path: '/submit/new', name: 'submit-new', component: () => import('@/views/SubmitFormView.vue'), meta: { requiresAuth: true } },
    { path: '/submit/:id', name: 'submit-edit', component: () => import('@/views/SubmitFormView.vue'), props: true, meta: { requiresAuth: true } },
    { path: '/admin', name: 'admin', component: () => import('@/views/AdminView.vue'), meta: { requiresAuth: true, requiresAdmin: true } },
    { path: '/admin/submissions/:id', name: 'admin-submission', component: () => import('@/views/AdminSubmissionView.vue'), props: true, meta: { requiresAuth: true, requiresAdmin: true } },
```

beforeEach 改为：

```ts
router.beforeEach((to) =>
  resolveNavigation(to, {
    authEnabled,
    authenticated: session.state.status === 'authenticated',
    isAdmin: session.state.user?.role === 'admin'
  })
)
```

- [ ] **Step 5: 四个占位视图（Task 7/8/9 整文件替换）**

每个文件同构，仅标题与 name 不同（示例 SubmitListView，其余三个把「我的提交」换成「提交作品」/「审核管理」/「审核详情」）：

```vue
<template>
  <section class="mx-auto w-full max-w-3xl px-4 py-10">
    <h1 class="font-display text-[1.75rem] font-black leading-tight">我的提交</h1>
  </section>
</template>
```

- [ ] **Step 6: AppHeader 入口**

`AppHeader.vue` script 增加：

```ts
const isAdmin = computed(() => user.value?.role === 'admin')
```

模板 `<details>` 下拉内、「我的账号」链接之前插入：

```html
            <RouterLink to="/submit" class="block px-3 py-2 text-xs font-bold hover:bg-paper">提交作品</RouterLink>
            <RouterLink
              v-if="isAdmin"
              to="/admin"
              class="block border-t-2 border-ink px-3 py-2 text-xs font-bold hover:bg-paper"
            >审核</RouterLink>
```

并把「我的账号」链接的 class 加上 `border-t-2 border-ink`（与后续项分隔一致）。

- [ ] **Step 7: 验证**

Run: `cd src && npx vitest run app/router/ && npm run typecheck && npm run build`
Expected: PASS（占位视图可懒加载构建）

- [ ] **Step 8: Commit**

```bash
git branch --show-current
git add src/app/router/ src/app/views/SubmitListView.vue src/app/views/SubmitFormView.vue src/app/views/AdminView.vue src/app/views/AdminSubmissionView.vue src/app/components/AppHeader.vue
git commit -m "feat(router): /submit and /admin routes with requiresAdmin guard and header entries"
```

---

### Task 6: `content/validation.ts` 表单校验纯函数

**Files:**
- Create: `src/app/content/validation.ts`
- Test: `src/app/content/validation.test.ts`

**Interfaces:**
- Consumes: `GAME_TYPES`（data/types）、`SubmissionKind`/`WorkPayload`（Task 4）
- Produces: `WORK_ID_PATTERN`、`VERSION_PATTERN`、`TAG_MAX=8`、`slugify(name): string`、`parseTags(raw): string[]`、`FieldKey`、`validateWorkPayload(payload, kind): Partial<Record<FieldKey,string>>`（Task 8 表单消费）

- [ ] **Step 1: 写失败测试 `src/app/content/validation.test.ts`**

```ts
import { describe, expect, test } from 'vitest'
import type { WorkPayload } from './types'
import { parseTags, slugify, validateWorkPayload } from './validation'

const good: WorkPayload = {
  id: 'my-game', name: 'My Game', url: 'https://example.com', author: { name: 'A' },
  description: 'desc', durationMinutes: { min: 5, max: 20 }, type: 'puzzle', tags: ['x'],
  runtime: 'external'
}

test('slugify：中文清空、空格/大写/符号转连字符、修剪首尾', () => {
  expect(slugify('My Cool Game!')).toBe('my-cool-game')
  expect(slugify('  Hello   World ')).toBe('hello-world')
  expect(slugify('中文名字')).toBe('')
  expect(slugify('a'.repeat(80))).toBe('a'.repeat(64))
})

test('parseTags：中英分隔符、去重、去空、上限 8', () => {
  expect(parseTags('数字, 休闲、idle puzzle')).toEqual(['数字', '休闲', 'idle', 'puzzle'])
  expect(parseTags('a,a,b')).toEqual(['a', 'b'])
  expect(parseTags('1,2,3,4,5,6,7,8,9,10')).toHaveLength(8)
  expect(parseTags('  ')).toEqual([])
})

describe('validateWorkPayload', () => {
  test('合法 external 载荷无错误', () => {
    expect(validateWorkPayload(good, 'new_work')).toEqual({})
  })
  test('逐字段错误', () => {
    expect(validateWorkPayload({ ...good, id: 'Bad_ID' }, 'new_work').workId).toBeTruthy()
    expect(validateWorkPayload({ ...good, name: '  ' }, 'new_work').name).toBeTruthy()
    expect(validateWorkPayload({ ...good, url: 'ftp://x' }, 'new_work').url).toBeTruthy()
    expect(validateWorkPayload({ ...good, author: { name: '' } }, 'new_work').authorName).toBeTruthy()
    expect(validateWorkPayload({ ...good, durationMinutes: { min: 20, max: 5 } }, 'new_work').duration).toBeTruthy()
    expect(validateWorkPayload({ ...good, durationMinutes: { min: 0, max: 5 } }, 'new_work').duration).toBeTruthy()
    expect(validateWorkPayload({ ...good, type: 'nope' as never }, 'new_work').type).toBeTruthy()
    expect(validateWorkPayload({ ...good, tags: ['1','2','3','4','5','6','7','8','9'] }, 'new_work').tags).toBeTruthy()
  })
  test('virtual：new_work/new_version 需要合法 version 与 entry；metadata_change 不检查', () => {
    const virtual = { ...good, runtime: 'virtual' as const }
    expect(validateWorkPayload(virtual, 'new_work').version).toBeTruthy()
    expect(validateWorkPayload({ ...virtual, version: 'V1' }, 'new_work').version).toBeTruthy()
    expect(validateWorkPayload({ ...virtual, version: 'v1' }, 'new_work').entry).toBeTruthy()
    expect(validateWorkPayload({ ...virtual, version: 'v1', entry: 'index.html' }, 'new_version')).toEqual({})
    expect(validateWorkPayload(virtual, 'metadata_change')).toEqual({})
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd src && npx vitest run app/content/validation.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `src/app/content/validation.ts`**

```ts
import { GAME_TYPES } from '@/data/types'
import type { SubmissionKind, WorkPayload } from './types'

// 与后端 checkSubmissionRules / game schema 对齐的 TS 复刻（后端为最终权威，
// 漂移时以后端 400 invalid_request 的字段详情为准展示）
export const WORK_ID_PATTERN = /^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$/
export const VERSION_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/
export const TAG_MAX = 8

export type FieldKey =
  | 'workId' | 'name' | 'url' | 'authorName' | 'description'
  | 'duration' | 'type' | 'tags' | 'version' | 'entry'

export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}

export function parseTags(raw: string): string[] {
  const parts = raw.split(/[,，、\s]+/).map((t) => t.trim()).filter(Boolean)
  return [...new Set(parts)].slice(0, TAG_MAX)
}

export function validateWorkPayload(payload: WorkPayload, kind: SubmissionKind): Partial<Record<FieldKey, string>> {
  const errors: Partial<Record<FieldKey, string>> = {}
  if (!WORK_ID_PATTERN.test(payload.id)) errors.workId = '作品 id 需为小写字母/数字/连字符（1–64 字符，首尾非连字符）'
  if (!payload.name.trim()) errors.name = '名称必填'
  if (!/^https?:\/\/\S+$/.test(payload.url)) errors.url = '需为有效的 http(s) 链接'
  if (!payload.author.name.trim()) errors.authorName = '作者必填'
  if (!payload.description.trim()) errors.description = '描述必填'
  const { min, max } = payload.durationMinutes
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max < min) {
    errors.duration = '时长需为整数，且 1 ≤ 最短 ≤ 最长'
  }
  if (!(GAME_TYPES as readonly string[]).includes(payload.type)) errors.type = '未知类型'
  if (payload.tags.length > TAG_MAX) errors.tags = `标签最多 ${TAG_MAX} 个`
  const runtime = payload.runtime ?? 'external'
  if (kind !== 'metadata_change' && runtime === 'virtual') {
    if (!VERSION_PATTERN.test(payload.version ?? '')) errors.version = '版本号需匹配 ^[a-z0-9][a-z0-9._-]{0,63}$'
    if (!(payload.entry ?? '').trim()) errors.entry = '入口文件必填（如 index.html）'
  }
  return errors
}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd src && npx vitest run app/content/`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add src/app/content/validation.ts src/app/content/validation.test.ts
git commit -m "feat(content): submission form validation helpers (slug, tags, per-field payload rules)"
```

---

### Task 7: `/submit` 列表视图（状态机操作）

**Files:**
- Modify: `src/app/views/SubmitListView.vue`（整文件替换占位）

**Interfaces:**
- Consumes: Task 4 `contentClient`/`toContentMessage`/`SubmissionView`；既有 `useAsync`、`StatePanel`
- Produces: 无（终端视图；Task 10 e2e 依赖的 DOM 锚点：每条提交卡片 `data-testid="submission-<id>"`、状态文案、按钮 name：编辑/提交/撤回/删除/新建提交）

- [ ] **Step 1: 实现（整文件替换）**

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import StatePanel from '@/components/StatePanel.vue'
import { useAsync } from '@/composables/useAsync'
import { contentClient, toContentMessage, type SubmissionView } from '@/content'

const KIND_LABELS: Record<string, string> = {
  new_work: '新作品', new_version: '新版本', metadata_change: '元数据更新'
}
const STATUS_LABELS: Record<string, string> = {
  draft: '草稿', pending: '审核中', approved: '已通过', rejected: '已拒绝'
}
const STATUS_CLASS: Record<string, string> = {
  draft: 'border-ink bg-surface',
  pending: 'border-ink bg-highlight',
  approved: 'border-ink bg-accent-ink text-paper',
  rejected: 'border-ink bg-accent-ink text-paper'
}

const { data, error, loading, reload } = useAsync<SubmissionView[]>(() => contentClient.listMine(), [])
const submissions = computed(() => data.value ?? [])

const busyId = ref<string | null>(null)
const actionError = ref<string | null>(null)
// 危险操作两步确认：记录待确认的 (id, 动作)
const confirm = ref<{ id: string; action: 'withdraw' | 'delete' } | null>(null)

function nameOf(s: SubmissionView): string {
  return s.payload?.name?.trim() || s.work_id
}

async function run(id: string, fn: () => Promise<unknown>): Promise<void> {
  if (busyId.value) return
  busyId.value = id
  actionError.value = null
  try {
    await fn()
    reload()
  } catch (e) {
    actionError.value = toContentMessage(e)
  } finally {
    busyId.value = null
    confirm.value = null
  }
}

// 列表页「提交」：PUT 需全量字段——先取详情原样回传 + submit:true（重复 upload_id 后端不重查）
function submitNow(s: SubmissionView): void {
  void run(s.id, async () => {
    const full = await contentClient.getSubmission(s.id)
    await contentClient.updateSubmission(full.id, {
      payload: full.payload,
      bundle_upload_id: full.bundle_upload_id ?? '',
      cover_upload_id: full.cover_upload_id ?? '',
      submit: true
    })
  })
}

function askConfirm(s: SubmissionView, action: 'withdraw' | 'delete'): void {
  confirm.value = { id: s.id, action }
}

function doConfirm(s: SubmissionView): void {
  void run(s.id, () => contentClient.deleteSubmission(s.id))
}
</script>

<template>
  <section class="mx-auto w-full max-w-3xl px-4 py-10">
    <div class="flex items-center justify-between gap-4">
      <h1 class="font-display text-[1.75rem] font-black leading-tight">我的提交</h1>
      <RouterLink to="/submit/new" class="btn-ink lift shrink-0 hover:shadow-hard active:shadow-none">新建提交</RouterLink>
    </div>

    <p v-if="actionError" role="alert" class="mt-4 border-2 border-ink bg-highlight px-3 py-2 text-xs font-bold">{{ actionError }}</p>

    <div class="mt-6">
      <StatePanel :loading="loading" :error="error" @retry="reload">
        <p v-if="submissions.length === 0" class="border-2 border-ink bg-surface p-6 text-sm text-ink-soft shadow-hard">
          还没有提交。把你的作品分享给所有人——
          <RouterLink class="text-accent-ink underline decoration-2 underline-offset-2" to="/submit/new">提交第一个作品</RouterLink>
        </p>
        <ul v-else class="space-y-4">
          <li
            v-for="s in submissions"
            :key="s.id"
            :data-testid="`submission-${s.id}`"
            class="border-2 border-ink bg-surface p-4 shadow-hard"
          >
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="font-display text-sm font-black">{{ nameOf(s) }}</h2>
              <span class="border-[1.5px] border-ink px-1 py-0.5 font-mono text-[0.625rem]">{{ KIND_LABELS[s.kind] ?? s.kind }}</span>
              <span :class="['border-[1.5px] px-1.5 py-0.5 font-mono text-[0.625rem] font-bold', STATUS_CLASS[s.status] ?? 'border-ink bg-surface']">
                {{ STATUS_LABELS[s.status] ?? s.status }}
              </span>
              <span class="ml-auto font-mono text-[0.625rem] text-ink-soft">{{ s.work_id }}</span>
            </div>

            <p v-if="s.status === 'rejected' && s.review_note" class="mt-3 border-2 border-ink bg-paper px-3 py-2 text-xs">
              <span class="font-mono font-bold">审核意见：</span>{{ s.review_note }}
            </p>
            <RouterLink
              v-if="s.status === 'approved'"
              :to="`/games/${s.work_id}`"
              class="mt-2 inline-block text-xs text-accent-ink underline decoration-2 underline-offset-2"
            >查看已发布作品 →</RouterLink>

            <div class="mt-3 flex flex-wrap gap-2 text-xs font-bold">
              <RouterLink
                v-if="s.status === 'draft' || s.status === 'rejected'"
                :to="`/submit/${s.id}`"
                class="border-2 border-ink bg-surface px-2 py-1 hover:bg-paper"
              >编辑</RouterLink>
              <button
                v-if="s.status === 'draft' || s.status === 'rejected'"
                type="button"
                class="border-2 border-ink bg-highlight px-2 py-1 disabled:opacity-50"
                :disabled="busyId === s.id"
                @click="submitNow(s)"
              >{{ busyId === s.id ? '处理中…' : (s.status === 'rejected' ? '重新提交' : '提交') }}</button>
              <button
                v-if="s.status === 'pending'"
                type="button"
                class="border-2 border-ink bg-surface px-2 py-1 disabled:opacity-50"
                :disabled="busyId === s.id"
                @click="askConfirm(s, 'withdraw')"
              >撤回</button>
              <button
                v-if="s.status === 'draft' || s.status === 'rejected'"
                type="button"
                class="border-2 border-ink bg-surface px-2 py-1 disabled:opacity-50"
                :disabled="busyId === s.id"
                @click="askConfirm(s, 'delete')"
              >删除</button>
            </div>

            <div v-if="confirm?.id === s.id" class="mt-3 border-2 border-ink bg-paper p-3 text-xs">
              <p class="font-bold">
                {{ confirm.action === 'withdraw' ? '撤回后提交将被删除（已上传文件由服务端清理），需重新创建。确认撤回？' : '删除后不可恢复。确认删除？' }}
              </p>
              <div class="mt-2 flex gap-2 font-bold">
                <button type="button" class="border-2 border-ink bg-accent-ink px-2 py-1 text-paper disabled:opacity-50" :disabled="busyId === s.id" @click="doConfirm(s)">
                  {{ busyId === s.id ? '处理中…' : '确认' }}
                </button>
                <button type="button" class="border-2 border-ink bg-surface px-2 py-1" @click="confirm = null">取消</button>
              </div>
            </div>
          </li>
        </ul>
      </StatePanel>
    </div>
  </section>
</template>
```

- [ ] **Step 2: 验证**

Run: `cd src && npm run typecheck && npx vitest run`
Expected: PASS（视图逻辑由 Task 10 e2e 覆盖）

- [ ] **Step 3: Commit**

```bash
git branch --show-current
git add src/app/views/SubmitListView.vue
git commit -m "feat(submit): my-submissions list with lifecycle actions and two-step confirm"
```

---

### Task 8: `/submit/new` 与 `/submit/:id` 表单视图

**Files:**
- Modify: `src/app/views/SubmitFormView.vue`（整文件替换占位）

**Interfaces:**
- Consumes: Task 4 `contentClient`（upload/create/update/getSubmission/gameDetail）+ `validateUploadInput`；Task 6 `slugify/parseTags/validateWorkPayload/VERSION_PATTERN`；`GAME_TYPES`/`GAME_TYPE_LABELS`（data/types、lib/labels）
- Produces: Task 10 e2e 依赖的 DOM 锚点：`data-testid` = `kind-select`、`work-id`、`runtime-virtual`、`version`、`bundle-file`、`cover-file`、`save-draft`、`submit-review`、`upload-progress`；预填失败文案「作品不存在」

**行为要点（spec §6.3 冻结）**：
- kind 仅新建可选；编辑模式 kind/work_id 只读
- `new_version`/`metadata_change`：work_id 失焦（或防抖 600ms）后 `gameDetail(work_id)` 预填全部元数据；`new_version` 预填后清空 version（必须新值）；404 → 错误条「作品不存在」
- 新建 `new_work` 时 work_id 随名称自动 slug 生成（用户手动改过则不再覆盖）
- bundle 文件选择器禁用条件：runtime≠virtual、kind=metadata_change、work_id 或 version 未填/非法
- 上传成功后修改 work_id/version → 清空已传 bundle 并提示重传（AAD 绑定）
- pending/approved 的 `:id` 为**只读视图**（禁用全部输入、隐藏保存条、显示状态横幅）
- 保存草稿 `submit:false`、提交审核 `submit:true`（确认对话框 `window.confirm`）；成功后回 `/submit`
- 429 → 错误条显示 `toContentMessage`（含倒计时秒数），按钮恢复可用由用户重试（不做自动计时器，YAGNI）

- [ ] **Step 1: 实现（整文件替换）**

```vue
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { contentClient, toContentMessage, validateUploadInput } from '@/content'
import { parseTags, slugify, validateWorkPayload, VERSION_PATTERN, WORK_ID_PATTERN, type FieldKey } from '@/content/validation'
import type { SubmissionKind, SubmissionView, UploadResult, WorkPayload } from '@/content/types'
import { GAME_TYPES } from '@/data/types'
import { GAME_TYPE_LABELS } from '@/lib/labels'
import { NotFoundError } from '@/data/repository'

const props = defineProps<{ id?: string }>()
const route = useRoute()
const router = useRouter()
const submissionId = computed(() => props.id ?? (route.params.id as string | undefined))

const kind = ref<SubmissionKind>('new_work')
const form = reactive({
  workId: '', name: '', url: '', authorName: '', authorUrl: '',
  description: '', durationMin: '5', durationMax: '20', type: 'puzzle',
  tagsText: '', intro: '', runtime: 'external' as 'external' | 'virtual',
  version: '', entry: 'index.html'
})

const existing = ref<SubmissionView | null>(null)
const readOnly = computed(() => existing.value !== null && (existing.value.status === 'pending' || existing.value.status === 'approved'))
const editing = computed(() => submissionId.value !== undefined)

const bundle = ref<UploadResult | null>(null)
const bundleLinkedOnly = ref(false) // 编辑模式仅有 upload_id（无 sha/bytes 元信息）
const cover = ref<UploadResult | null>(null)
const coverLinkedOnly = ref(false)
const coverPreview = ref<string | null>(null)
const progress = ref<{ which: 'bundle' | 'cover'; received: number; total: number } | null>(null)

const error = ref<string | null>(null)
const fieldErrors = ref<Partial<Record<FieldKey, string>>>({})
const showErrors = ref(false)
const busy = ref<'draft' | 'submit' | 'load' | null>(null)
const slugTouched = ref(false)
const notice = ref<string | null>(null) // 「请重新上传 bundle」等非错误提示

onBeforeUnmount(() => { if (coverPreview.value) URL.revokeObjectURL(coverPreview.value) })

const KIND_LABELS: Record<SubmissionKind, string> = { new_work: '新作品', new_version: '新版本', metadata_change: '元数据更新' }

function buildPayload(): WorkPayload {
  return {
    id: form.workId.trim(),
    name: form.name.trim(),
    url: form.url.trim(),
    author: { name: form.authorName.trim(), ...(form.authorUrl.trim() ? { url: form.authorUrl.trim() } : {}) },
    description: form.description.trim(),
    durationMinutes: { min: Number(form.durationMin), max: Number(form.durationMax) },
    type: form.type as WorkPayload['type'],
    tags: parseTags(form.tagsText),
    ...(form.intro.trim() ? { intro: form.intro.trim() } : {}),
    ...(form.runtime === 'virtual' ? { runtime: 'virtual' as const, version: form.version.trim(), entry: form.entry.trim() || 'index.html' } : {})
  }
}

// 新建 new_work：名称 → slug 自动生成（手动改过 work id 后停止覆盖）
watch(() => form.name, (name) => {
  if (!editing.value && kind.value === 'new_work' && !slugTouched.value) form.workId = slugify(name)
})
watch(() => form.workId, (_v, old) => { if (old !== undefined && _v !== slugify(form.name)) slugTouched.value = true }, { flush: 'post' })

// AAD 绑定 work_id/version：任一变化即作废已传 bundle。
// suppressAadWatch：编辑模式回填字段时不触发（回填≠用户修改）
let suppressAadWatch = false
watch([() => form.workId, () => form.version], () => {
  if (suppressAadWatch) return
  if (bundle.value || bundleLinkedOnly.value) {
    bundle.value = null
    bundleLinkedOnly.value = false
    notice.value = '作品 id 或版本号已修改，请重新上传 bundle'
  }
})

const bundleDisabled = computed(() =>
  form.runtime !== 'virtual' || kind.value === 'metadata_change' ||
  !WORK_ID_PATTERN.test(form.workId.trim()) || !VERSION_PATTERN.test(form.version.trim()) ||
  readOnly.value || busy.value !== null
)

// new_version / metadata_change 预填
let prefillTimer: ReturnType<typeof setTimeout> | null = null
watch([() => form.workId, kind], () => {
  if (editing.value || (kind.value !== 'new_version' && kind.value !== 'metadata_change')) return
  if (!WORK_ID_PATTERN.test(form.workId.trim())) return
  if (prefillTimer) clearTimeout(prefillTimer)
  prefillTimer = setTimeout(() => void prefill(form.workId.trim()), 600)
})

async function prefill(workId: string): Promise<void> {
  error.value = null
  try {
    const game = await contentClient.gameDetail(workId)
    form.name = game.name
    form.url = game.url
    form.authorName = game.author.name
    form.authorUrl = game.author.url ?? ''
    form.description = game.description
    form.durationMin = String(game.durationMinutes.min)
    form.durationMax = String(game.durationMinutes.max)
    form.type = game.type
    form.tagsText = game.tags.join(', ')
    form.intro = game.intro ?? ''
    form.runtime = game.runtime === 'virtual' ? 'virtual' : 'external'
    form.entry = game.entry ?? 'index.html'
    // new_version 必须提供新版本号：预填后清空强制用户输入
    form.version = kind.value === 'new_version' ? '' : (game.version ?? '')
    if (kind.value === 'new_version' && game.runtime !== 'virtual') {
      error.value = '该作品不是 virtual 运行时，不能提交新版本'
    }
  } catch (e) {
    error.value = e instanceof NotFoundError ? '作品不存在' : toContentMessage(e)
  }
}

// 编辑模式加载
watch(submissionId, (id) => { if (id) void loadExisting(id) }, { immediate: true })

async function loadExisting(id: string): Promise<void> {
  busy.value = 'load'
  error.value = null
  suppressAadWatch = true
  try {
    const s = await contentClient.getSubmission(id)
    existing.value = s
    kind.value = s.kind
    const p = s.payload
    form.workId = p.id ?? s.work_id
    form.name = p.name ?? ''
    form.url = p.url ?? ''
    form.authorName = p.author?.name ?? ''
    form.authorUrl = p.author?.url ?? ''
    form.description = p.description ?? ''
    form.durationMin = String(p.durationMinutes?.min ?? 5)
    form.durationMax = String(p.durationMinutes?.max ?? 20)
    form.type = p.type ?? 'puzzle'
    form.tagsText = (p.tags ?? []).join(', ')
    form.intro = p.intro ?? ''
    form.runtime = p.runtime === 'virtual' ? 'virtual' : 'external'
    form.version = p.version ?? ''
    form.entry = p.entry ?? 'index.html'
    bundleLinkedOnly.value = Boolean(s.bundle_upload_id)
    coverLinkedOnly.value = Boolean(s.cover_upload_id)
    await nextTick() // 等 watcher 队列冲完回填触发的回调
  } catch (e) {
    error.value = toContentMessage(e)
  } finally {
    suppressAadWatch = false
    busy.value = null
  }
}

async function onBundleFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || busy.value) return
  const invalid = validateUploadInput({ kind: 'bundle', workId: form.workId.trim(), version: form.version.trim(), file })
  if (invalid) { error.value = invalid; return }
  error.value = null
  notice.value = null
  busy.value = 'draft'
  try {
    bundle.value = await contentClient.upload(
      { kind: 'bundle', workId: form.workId.trim(), version: form.version.trim(), file },
      (p) => { progress.value = { which: 'bundle', ...p } }
    )
    bundleLinkedOnly.value = false
  } catch (e) {
    error.value = toContentMessage(e)
  } finally {
    progress.value = null
    busy.value = null
  }
}

async function onCoverFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || busy.value) return
  const invalid = validateUploadInput({ kind: 'cover', file })
  if (invalid) { error.value = invalid; return }
  error.value = null
  busy.value = 'draft'
  try {
    cover.value = await contentClient.upload({ kind: 'cover', file }, (p) => { progress.value = { which: 'cover', ...p } })
    coverLinkedOnly.value = false
    if (coverPreview.value) URL.revokeObjectURL(coverPreview.value)
    coverPreview.value = URL.createObjectURL(file)
  } catch (e) {
    error.value = toContentMessage(e)
  } finally {
    progress.value = null
    busy.value = null
  }
}

async function save(submit: boolean): Promise<void> {
  if (busy.value || readOnly.value) return
  error.value = null
  notice.value = null
  const payload = buildPayload()
  const errors = validateWorkPayload(payload, kind.value)
  fieldErrors.value = errors
  showErrors.value = true
  if (Object.keys(errors).length > 0) return
  if (submit && !window.confirm('确认提交审核？审核通过后作品将公开可见。')) return
  busy.value = submit ? 'submit' : 'draft'
  try {
    if (existing.value) {
      await contentClient.updateSubmission(existing.value.id, {
        payload,
        bundle_upload_id: bundle.value?.upload_id ?? existing.value.bundle_upload_id ?? '',
        cover_upload_id: cover.value?.upload_id ?? existing.value.cover_upload_id ?? '',
        submit
      })
    } else {
      await contentClient.createSubmission({
        kind: kind.value,
        work_id: payload.id,
        payload,
        bundle_upload_id: bundle.value?.upload_id ?? '',
        cover_upload_id: cover.value?.upload_id ?? '',
        submit
      })
    }
    await router.push('/submit')
  } catch (e) {
    error.value = toContentMessage(e)
    showErrors.value = false
  } finally {
    busy.value = null
  }
}

function err(key: FieldKey): string | undefined {
  return showErrors.value ? fieldErrors.value[key] : undefined
}
const inputClass = 'w-full border-2 border-ink bg-surface px-3 py-2 disabled:opacity-60'
const labelClass = 'font-mono text-[0.6875rem] tracking-[0.05em]'
</script>

<template>
  <section class="mx-auto w-full max-w-3xl px-4 py-10">
    <h1 class="font-display text-[1.75rem] font-black leading-tight">
      {{ editing ? (readOnly ? '提交详情' : '编辑提交') : '提交作品' }}
    </h1>

    <p
      v-if="existing && (existing.status !== 'draft' && existing.status !== 'rejected')"
      class="mt-4 border-2 border-ink bg-highlight px-3 py-2 text-xs font-bold"
    >当前状态「{{ existing.status === 'pending' ? '审核中' : '已通过' }}」，不可编辑。</p>
    <p v-if="notice" class="mt-4 border-2 border-ink bg-paper px-3 py-2 text-xs font-bold">{{ notice }}</p>
    <p v-if="error" role="alert" class="mt-4 border-2 border-ink bg-highlight px-3 py-2 text-xs font-bold">{{ error }}</p>

    <form class="mt-6 space-y-8" novalidate @submit.prevent="save(false)">
      <!-- 1. 提交类型 -->
      <fieldset class="space-y-2" :disabled="readOnly">
        <legend :class="labelClass">提交类型</legend>
        <select v-if="!editing" v-model="kind" data-testid="kind-select" :class="inputClass">
          <option value="new_work">{{ KIND_LABELS.new_work }}</option>
          <option value="new_version">{{ KIND_LABELS.new_version }}（已收录的 virtual 作品）</option>
          <option value="metadata_change">{{ KIND_LABELS.metadata_change }}（已收录作品）</option>
        </select>
        <p v-else class="text-sm font-bold">{{ KIND_LABELS[kind] }}</p>
      </fieldset>

      <!-- 2. 基本信息 -->
      <fieldset class="space-y-4" :disabled="readOnly">
        <legend :class="labelClass">基本信息</legend>
        <div class="space-y-1.5">
          <label class="font-mono text-[0.6875rem]" for="sf-workid">作品 id（slug，收录后不可改）</label>
          <input id="sf-workid" v-model="form.workId" data-testid="work-id" type="text" :class="inputClass"
            :readonly="editing" :aria-invalid="Boolean(err('workId'))" @blur="kind !== 'new_work' && !editing && prefill(form.workId.trim())">
          <p v-if="err('workId')" class="text-xs font-bold text-accent-ink">{{ err('workId') }}</p>
        </div>
        <div class="space-y-1.5">
          <label class="font-mono text-[0.6875rem]" for="sf-name">名称</label>
          <input id="sf-name" v-model="form.name" type="text" :class="inputClass" :aria-invalid="Boolean(err('name'))">
          <p v-if="err('name')" class="text-xs font-bold text-accent-ink">{{ err('name') }}</p>
        </div>
        <div class="space-y-1.5">
          <label class="font-mono text-[0.6875rem]" for="sf-url">作品原始链接</label>
          <input id="sf-url" v-model="form.url" type="url" :class="inputClass" :aria-invalid="Boolean(err('url'))">
          <p v-if="err('url')" class="text-xs font-bold text-accent-ink">{{ err('url') }}</p>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <div class="space-y-1.5">
            <label class="font-mono text-[0.6875rem]" for="sf-author">作者名</label>
            <input id="sf-author" v-model="form.authorName" type="text" :class="inputClass" :aria-invalid="Boolean(err('authorName'))">
            <p v-if="err('authorName')" class="text-xs font-bold text-accent-ink">{{ err('authorName') }}</p>
          </div>
          <div class="space-y-1.5">
            <label class="font-mono text-[0.6875rem]" for="sf-author-url">作者链接（可选）</label>
            <input id="sf-author-url" v-model="form.authorUrl" type="url" :class="inputClass">
          </div>
        </div>
        <div class="space-y-1.5">
          <label class="font-mono text-[0.6875rem]" for="sf-desc">描述</label>
          <textarea id="sf-desc" v-model="form.description" rows="3" :class="inputClass" :aria-invalid="Boolean(err('description'))" />
          <p v-if="err('description')" class="text-xs font-bold text-accent-ink">{{ err('description') }}</p>
        </div>
        <div class="grid gap-4 sm:grid-cols-3">
          <div class="space-y-1.5">
            <label class="font-mono text-[0.6875rem]" for="sf-dur-min">最短时长（分钟）</label>
            <input id="sf-dur-min" v-model="form.durationMin" type="number" min="1" :class="inputClass">
          </div>
          <div class="space-y-1.5">
            <label class="font-mono text-[0.6875rem]" for="sf-dur-max">最长时长（分钟）</label>
            <input id="sf-dur-max" v-model="form.durationMax" type="number" min="1" :class="inputClass">
          </div>
          <div class="space-y-1.5">
            <label class="font-mono text-[0.6875rem]" for="sf-type">类型</label>
            <select id="sf-type" v-model="form.type" :class="inputClass">
              <option v-for="t in GAME_TYPES" :key="t" :value="t">{{ GAME_TYPE_LABELS[t] }}</option>
            </select>
          </div>
        </div>
        <p v-if="err('duration') || err('type')" class="text-xs font-bold text-accent-ink">{{ err('duration') ?? err('type') }}</p>
        <div class="space-y-1.5">
          <label class="font-mono text-[0.6875rem]" for="sf-tags">标签（逗号分隔，最多 8 个）</label>
          <input id="sf-tags" v-model="form.tagsText" type="text" :class="inputClass" :aria-invalid="Boolean(err('tags'))">
          <p v-if="err('tags')" class="text-xs font-bold text-accent-ink">{{ err('tags') }}</p>
        </div>
        <div class="space-y-1.5">
          <label class="font-mono text-[0.6875rem]" for="sf-intro">玩法简介（可选，支持 Markdown）</label>
          <textarea id="sf-intro" v-model="form.intro" rows="4" :class="inputClass" />
        </div>
      </fieldset>

      <!-- 3. 运行方式与文件 -->
      <fieldset class="space-y-4" :disabled="readOnly">
        <legend :class="labelClass">运行方式</legend>
        <div class="flex gap-4 text-sm font-bold">
          <label class="inline-flex items-center gap-1.5">
            <input v-model="form.runtime" type="radio" value="external"> 外链作品
          </label>
          <label class="inline-flex items-center gap-1.5">
            <input v-model="form.runtime" data-testid="runtime-virtual" type="radio" value="virtual"
              :disabled="kind === 'new_version' ? false : kind === 'metadata_change'"> 站内运行（上传 bundle）
          </label>
        </div>
        <template v-if="form.runtime === 'virtual'">
          <div class="grid gap-4 sm:grid-cols-2">
            <div class="space-y-1.5">
              <label class="font-mono text-[0.6875rem]" for="sf-version">版本号</label>
              <input id="sf-version" v-model="form.version" data-testid="version" type="text" placeholder="v1" :class="inputClass" :aria-invalid="Boolean(err('version'))">
              <p v-if="err('version')" class="text-xs font-bold text-accent-ink">{{ err('version') }}</p>
            </div>
            <div class="space-y-1.5">
              <label class="font-mono text-[0.6875rem]" for="sf-entry">入口文件</label>
              <input id="sf-entry" v-model="form.entry" type="text" :class="inputClass" :aria-invalid="Boolean(err('entry'))">
              <p v-if="err('entry')" class="text-xs font-bold text-accent-ink">{{ err('entry') }}</p>
            </div>
          </div>
          <div class="space-y-1.5">
            <label class="font-mono text-[0.6875rem]" for="sf-bundle">bundle（zip ≤ 100MB，服务端加密存储）</label>
            <input id="sf-bundle" data-testid="bundle-file" type="file" accept=".zip,application/zip,application/x-zip-compressed"
              :disabled="bundleDisabled" @change="onBundleFile">
            <p v-if="bundleDisabled && kind !== 'metadata_change'" class="text-xs text-ink-soft">先填写作品 id 与版本号后可上传</p>
            <p v-if="bundle" data-testid="bundle-done" class="border-2 border-ink bg-paper px-2 py-1 font-mono text-[0.6875rem]">
              已上传 {{ (bundle.bytes / 1024 / 1024).toFixed(2) }} MB · sha256 {{ bundle.sha256.slice(0, 12) }}…
            </p>
            <p v-else-if="bundleLinkedOnly" class="border-2 border-ink bg-paper px-2 py-1 font-mono text-[0.6875rem]">已关联上传（重新选择文件可替换）</p>
            <span v-if="progress?.which === 'bundle'" data-testid="upload-progress" class="block font-mono text-[0.6875rem]">
              上传中 {{ progress.total > 0 ? Math.round((progress.received / progress.total) * 100) : '…' }}%
            </span>
          </div>
        </template>
      </fieldset>

      <!-- 4. 封面 -->
      <fieldset class="space-y-2" :disabled="readOnly">
        <legend :class="labelClass">封面（可选，png/jpeg/webp ≤ 5MB）</legend>
        <input data-testid="cover-file" type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" @change="onCoverFile">
        <img v-if="coverPreview" :src="coverPreview" alt="封面预览" class="mt-2 w-40 border-2 border-ink">
        <p v-else-if="cover" class="font-mono text-[0.6875rem]">已上传封面 {{ cover.upload_id.slice(0, 8) }}…</p>
        <p v-else-if="coverLinkedOnly" class="font-mono text-[0.6875rem]">已关联封面（重新选择文件可替换）</p>
        <span v-if="progress?.which === 'cover'" class="block font-mono text-[0.6875rem]">上传中…</span>
      </fieldset>

      <!-- 5. 操作 -->
      <div v-if="!readOnly" class="flex gap-3">
        <button type="button" data-testid="save-draft" class="btn-ink lift disabled:opacity-50" :disabled="busy !== null" @click="save(false)">
          {{ busy === 'draft' ? '保存中…' : '存草稿' }}
        </button>
        <button type="button" data-testid="submit-review" class="btn-ink lift bg-highlight disabled:opacity-50" :disabled="busy !== null" @click="save(true)">
          {{ busy === 'submit' ? '提交中…' : '提交审核' }}
        </button>
        <RouterLink to="/submit" class="border-2 border-ink bg-surface px-3 py-2 text-sm font-bold">取消</RouterLink>
      </div>
    </form>
  </section>
</template>
```

（`RouterLink` 需在 script 中 import：`import { RouterLink, useRoute, useRouter } from 'vue-router'`。）

- [ ] **Step 2: 验证**

Run: `cd src && npm run typecheck && npx vitest run && npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git branch --show-current
git add src/app/views/SubmitFormView.vue
git commit -m "feat(submit): submission form view (three kinds, prefill, XHR uploads, AAD-change bundle invalidation)"
```

---

### Task 9: `/admin` 管理页（两 tab）+ 审核详情视图

**Files:**
- Modify: `src/app/views/AdminView.vue`（整文件替换占位）
- Modify: `src/app/views/AdminSubmissionView.vue`（整文件替换占位）

**Interfaces:**
- Consumes: Task 4 `contentClient`（adminListSubmissions/adminApprove/adminReject/adminUnpublish/adminRepublish/adminSetRevoked/getSubmission）、`apiRepo` 单例（data/index，作品列表与详情直连）、`GAME_TYPE_LABELS`
- Produces: Task 10 e2e 的 DOM 锚点：tab 按钮 name「审核队列」「作品管理」；行 `data-testid="queue-<submission_id>"`、`work-row-<id>`；按钮 name「审核」「下架」「恢复上架」「吊销密钥」「恢复密钥」「通过」「拒绝」；详情字段 `data-testid="payload-<字段名>"`；拒绝输入 `data-testid="reject-note"`

**设计要点（spec §7 冻结）**：
- Tab 切换为视图内 state（非路由），status 筛选（pending 默认/approved/rejected）+ limit 20 分页（total 驱动）
- 作品管理列表来自 `apiRepo.listGames()`（apiRepo 为 null 时显示「未配置 API」提示——理论上到不了这页，防御性）；virtual 作品行内「当前版本」操作需先 `apiRepo.getGame(id)` 取 version（GameSummary 无 version 字段），用行展开懒加载
- **revoked 状态不可见**（后端无查询端点）：revoke 与恢复两个按钮并列，由管理员自行选择，操作结果以成功/失败反馈
- approved 历史区提供 republish 与该历史版本的 revoke/恢复（补无版本清单端点的缺口）
- 审核详情仅 pending 显示操作栏；approve 确认文案说明发布投影不可静默撤销（可下架）；reject note 必填（空则按钮禁用）

- [ ] **Step 1: 实现 `AdminView.vue`（整文件替换）**

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import StatePanel from '@/components/StatePanel.vue'
import { useAsync } from '@/composables/useAsync'
import { apiRepo } from '@/data'
import type { GameSummary } from '@/data/types'
import { contentClient, toContentMessage, type SubmissionView } from '@/content'

const LIMIT = 20
const tab = ref<'queue' | 'works'>('queue')
const status = ref<'pending' | 'approved' | 'rejected'>('pending')
const offset = ref(0)
const worksOffset = ref(0)
const actionError = ref<string | null>(null)
const busyKey = ref<string | null>(null)

const { data: queueData, error: queueError, loading: queueLoading, reload: reloadQueue } = useAsync(
  () => contentClient.adminListSubmissions({ status: status.value, limit: LIMIT, offset: offset.value }),
  [status, offset]
)
const { data: worksData, error: worksError, loading: worksLoading, reload: reloadWorks } = useAsync<GameSummary[]>(
  () => (apiRepo ? apiRepo.listGames() : Promise.reject(new Error('未配置内容 API'))),
  [tab]
)
const { data: historyData, error: historyError, loading: historyLoading, reload: reloadHistory } = useAsync(
  () => contentClient.adminListSubmissions({ status: 'approved', limit: LIMIT, offset: worksOffset.value }),
  [worksOffset, tab]
)

// virtual 作品的当前版本：行展开时懒加载详情
const expanded = ref<string | null>(null)
const versionOf = ref<Record<string, string | null>>({})

const KIND_LABELS: Record<string, string> = { new_work: '新作品', new_version: '新版本', metadata_change: '元数据更新' }
const queueSubs = computed(() => queueData.value?.submissions ?? [])
const queueTotal = computed(() => queueData.value?.total ?? 0)
const historySubs = computed(() => historyData.value?.submissions ?? [])
const historyTotal = computed(() => historyData.value?.total ?? 0)

function nameOf(s: SubmissionView): string {
  return s.payload?.name?.trim() || s.work_id
}
function versionOfSub(s: SubmissionView): string {
  return s.payload?.version ?? '—'
}

async function run(key: string, fn: () => Promise<unknown>, then?: () => void): Promise<void> {
  if (busyKey.value) return
  busyKey.value = key
  actionError.value = null
  try {
    await fn()
    then?.()
  } catch (e) {
    actionError.value = toContentMessage(e)
  } finally {
    busyKey.value = null
  }
}

async function toggleVersions(id: string): Promise<void> {
  expanded.value = expanded.value === id ? null : id
  if (expanded.value === id && versionOf.value[id] === undefined && apiRepo) {
    try {
      const game = await apiRepo.getGame(id)
      versionOf.value = { ...versionOf.value, [id]: game.version ?? null }
    } catch {
      versionOf.value = { ...versionOf.value, [id]: null }
    }
  }
}

function switchTab(next: 'queue' | 'works'): void {
  tab.value = next
  actionError.value = null
}
function switchStatus(next: 'pending' | 'approved' | 'rejected'): void {
  status.value = next
  offset.value = 0
}
</script>

<template>
  <section class="mx-auto w-full max-w-5xl px-4 py-10">
    <h1 class="font-display text-[1.75rem] font-black leading-tight">审核管理</h1>

    <div class="mt-4 flex gap-2 text-sm font-bold">
      <button type="button" class="border-2 border-ink px-3 py-1.5" :class="tab === 'queue' ? 'bg-accent-ink text-paper' : 'bg-surface'" @click="switchTab('queue')">审核队列</button>
      <button type="button" class="border-2 border-ink px-3 py-1.5" :class="tab === 'works' ? 'bg-accent-ink text-paper' : 'bg-surface'" @click="switchTab('works')">作品管理</button>
    </div>

    <p v-if="actionError" role="alert" class="mt-4 border-2 border-ink bg-highlight px-3 py-2 text-xs font-bold">{{ actionError }}</p>

    <!-- Tab 1：审核队列 -->
    <div v-if="tab === 'queue'" class="mt-6">
      <div class="flex gap-2 text-xs font-bold">
        <button v-for="s in (['pending', 'approved', 'rejected'] as const)" :key="s" type="button"
          class="border-2 border-ink px-2 py-1" :class="status === s ? 'bg-highlight' : 'bg-surface'"
          @click="switchStatus(s)">
          {{ s === 'pending' ? '待审' : s === 'approved' ? '已通过' : '已拒绝' }}
        </button>
      </div>
      <StatePanel class="mt-4" :loading="queueLoading" :error="queueError" @retry="reloadQueue">
        <p v-if="queueSubs.length === 0" class="border-2 border-ink bg-surface p-6 text-sm text-ink-soft shadow-hard">该状态下没有提交。</p>
        <table v-else class="w-full border-2 border-ink bg-surface text-sm shadow-hard">
          <thead class="border-b-2 border-ink bg-paper font-mono text-[0.6875rem]">
            <tr><th class="px-3 py-2 text-left">作品</th><th class="px-3 py-2 text-left">类型</th><th class="px-3 py-2 text-left">提交</th><th class="px-3 py-2 text-left">更新</th><th class="px-3 py-2" /></tr>
          </thead>
          <tbody>
            <tr v-for="s in queueSubs" :key="s.id" :data-testid="`queue-${s.id}`" class="border-b-[1.5px] border-ink">
              <td class="px-3 py-2"><span class="font-bold">{{ nameOf(s) }}</span><span class="ml-2 font-mono text-[0.625rem] text-ink-soft">{{ s.work_id }}</span></td>
              <td class="px-3 py-2 font-mono text-[0.6875rem]">{{ KIND_LABELS[s.kind] ?? s.kind }}</td>
              <td class="px-3 py-2 font-mono text-[0.625rem]">{{ s.id.slice(0, 8) }}</td>
              <td class="px-3 py-2 font-mono text-[0.625rem]">{{ s.updated_at.slice(0, 10) }}</td>
              <td class="px-3 py-2 text-right">
                <RouterLink :to="`/admin/submissions/${s.id}`" class="border-2 border-ink bg-surface px-2 py-1 text-xs font-bold hover:bg-paper">审核</RouterLink>
              </td>
            </tr>
          </tbody>
        </table>
        <div class="mt-3 flex items-center gap-3 text-xs font-bold">
          <button type="button" class="border-2 border-ink bg-surface px-2 py-1 disabled:opacity-40" :disabled="offset === 0" @click="offset = Math.max(0, offset - LIMIT)">上一页</button>
          <span class="font-mono">{{ offset + 1 }}–{{ Math.min(offset + LIMIT, queueTotal) }} / {{ queueTotal }}</span>
          <button type="button" class="border-2 border-ink bg-surface px-2 py-1 disabled:opacity-40" :disabled="offset + LIMIT >= queueTotal" @click="offset += LIMIT">下一页</button>
        </div>
      </StatePanel>
    </div>

    <!-- Tab 2：作品管理 -->
    <div v-else class="mt-6 space-y-8">
      <StatePanel :loading="worksLoading" :error="worksError" @retry="reloadWorks">
        <table class="w-full border-2 border-ink bg-surface text-sm shadow-hard">
          <thead class="border-b-2 border-ink bg-paper font-mono text-[0.6875rem]">
            <tr><th class="px-3 py-2 text-left">作品</th><th class="px-3 py-2 text-left">运行时</th><th class="px-3 py-2 text-left">当前版本</th><th class="px-3 py-2 text-left">操作</th></tr>
          </thead>
          <tbody>
            <template v-for="g in worksData ?? []" :key="g.id">
              <tr :data-testid="`work-row-${g.id}`" class="border-b-[1.5px] border-ink">
                <td class="px-3 py-2"><span class="font-bold">{{ g.name }}</span><span class="ml-2 font-mono text-[0.625rem] text-ink-soft">{{ g.id }}</span></td>
                <td class="px-3 py-2 font-mono text-[0.6875rem]">{{ g.runtime ?? 'external' }}</td>
                <td class="px-3 py-2 font-mono text-[0.6875rem]">
                  <template v-if="g.runtime === 'virtual'">
                    <button type="button" class="border-2 border-ink bg-surface px-2 py-0.5 text-xs font-bold" @click="toggleVersions(g.id)">
                      {{ expanded === g.id ? (versionOf[g.id] ?? '加载中…') : '查看' }}
                    </button>
                  </template>
                  <template v-else>—</template>
                </td>
                <td class="px-3 py-2">
                  <button type="button" class="border-2 border-ink bg-surface px-2 py-1 text-xs font-bold disabled:opacity-50"
                    :disabled="busyKey !== null"
                    @click="run(`unpub-${g.id}`, () => contentClient.adminUnpublish(g.id), reloadWorks)">下架</button>
                  <button v-if="expanded === g.id && versionOf[g.id]" type="button"
                    class="ml-2 border-2 border-ink bg-surface px-2 py-1 text-xs font-bold disabled:opacity-50" :disabled="busyKey !== null"
                    @click="run(`revoke-${g.id}`, () => contentClient.adminSetRevoked(g.id, versionOf[g.id]!, true))">吊销密钥</button>
                  <button v-if="expanded === g.id && versionOf[g.id]" type="button"
                    class="ml-2 border-2 border-ink bg-surface px-2 py-1 text-xs font-bold disabled:opacity-50" :disabled="busyKey !== null"
                    @click="run(`restore-${g.id}`, () => contentClient.adminSetRevoked(g.id, versionOf[g.id]!, false))">恢复密钥</button>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </StatePanel>

      <section>
        <h2 class="font-display text-sm font-black">已通过提交（含已下架作品，可恢复上架 / 操作历史版本）</h2>
        <StatePanel class="mt-3" :loading="historyLoading" :error="historyError" @retry="reloadHistory">
          <table class="w-full border-2 border-ink bg-surface text-sm shadow-hard">
            <thead class="border-b-2 border-ink bg-paper font-mono text-[0.6875rem]">
              <tr><th class="px-3 py-2 text-left">作品</th><th class="px-3 py-2 text-left">版本</th><th class="px-3 py-2 text-left">通过时间</th><th class="px-3 py-2 text-left">操作</th></tr>
            </thead>
            <tbody>
              <tr v-for="s in historySubs" :key="s.id" class="border-b-[1.5px] border-ink">
                <td class="px-3 py-2"><span class="font-bold">{{ nameOf(s) }}</span><span class="ml-2 font-mono text-[0.625rem] text-ink-soft">{{ s.work_id }}</span></td>
                <td class="px-3 py-2 font-mono text-[0.6875rem]">{{ versionOfSub(s) }}</td>
                <td class="px-3 py-2 font-mono text-[0.625rem]">{{ s.updated_at.slice(0, 10) }}</td>
                <td class="px-3 py-2">
                  <button type="button" class="border-2 border-ink bg-surface px-2 py-1 text-xs font-bold disabled:opacity-50" :disabled="busyKey !== null"
                    @click="run(`repub-${s.work_id}`, () => contentClient.adminRepublish(s.work_id), () => { reloadWorks(); reloadHistory() })">恢复上架</button>
                  <button v-if="s.payload?.version" type="button" class="ml-2 border-2 border-ink bg-surface px-2 py-1 text-xs font-bold disabled:opacity-50" :disabled="busyKey !== null"
                    @click="run(`hrev-${s.work_id}-${s.payload.version}`, () => contentClient.adminSetRevoked(s.work_id, s.payload.version!, true))">吊销密钥</button>
                  <button v-if="s.payload?.version" type="button" class="ml-2 border-2 border-ink bg-surface px-2 py-1 text-xs font-bold disabled:opacity-50" :disabled="busyKey !== null"
                    @click="run(`hres-${s.work_id}-${s.payload.version}`, () => contentClient.adminSetRevoked(s.work_id, s.payload.version!, false))">恢复密钥</button>
                </td>
              </tr>
            </tbody>
          </table>
          <div class="mt-3 flex items-center gap-3 text-xs font-bold">
            <button type="button" class="border-2 border-ink bg-surface px-2 py-1 disabled:opacity-40" :disabled="worksOffset === 0" @click="worksOffset = Math.max(0, worksOffset - LIMIT)">上一页</button>
            <span class="font-mono">{{ worksOffset + 1 }}–{{ Math.min(worksOffset + LIMIT, historyTotal) }} / {{ historyTotal }}</span>
            <button type="button" class="border-2 border-ink bg-surface px-2 py-1 disabled:opacity-40" :disabled="worksOffset + LIMIT >= historyTotal" @click="worksOffset += LIMIT">下一页</button>
          </div>
        </StatePanel>
      </section>
    </div>
  </section>
</template>
```

（`useAsync` 返回嵌套 Ref，模板不会自动解包——script 里必须如上解构成顶层变量再交给模板/StatePanel。）

- [ ] **Step 2: 实现 `AdminSubmissionView.vue`（整文件替换）**

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { contentClient, toContentMessage, type SubmissionView } from '@/content'
import { GAME_TYPE_LABELS } from '@/lib/labels'

const props = defineProps<{ id?: string }>()
const route = useRoute()
const router = useRouter()
const submissionId = computed(() => props.id ?? String(route.params.id ?? ''))

const sub = ref<SubmissionView | null>(null)
const loadError = ref<string | null>(null)
const actionError = ref<string | null>(null)
const busy = ref<'load' | 'approve' | 'reject' | null>(null)
const rejectMode = ref(false)
const rejectNote = ref('')

const KIND_LABELS: Record<string, string> = { new_work: '新作品', new_version: '新版本', metadata_change: '元数据更新' }
const STATUS_LABELS: Record<string, string> = { draft: '草稿', pending: '审核中', approved: '已通过', rejected: '已拒绝' }
const isPending = computed(() => sub.value?.status === 'pending')
const canReject = computed(() => rejectNote.value.trim().length > 0)

async function load(): Promise<void> {
  busy.value = 'load'
  loadError.value = null
  try {
    sub.value = await contentClient.getSubmission(submissionId.value)
  } catch (e) {
    loadError.value = toContentMessage(e)
  } finally {
    busy.value = null
  }
}
void load()

async function approve(): Promise<void> {
  if (busy.value) return
  if (!window.confirm('确认通过？将执行发布投影：bundle 转正式存储、目录立即可见、密钥开始签发。发布后可下架，但不会静默撤销。')) return
  busy.value = 'approve'
  actionError.value = null
  try {
    await contentClient.adminApprove(submissionId.value)
    await router.push('/admin')
  } catch (e) {
    actionError.value = toContentMessage(e)
  } finally {
    busy.value = null
  }
}

async function reject(): Promise<void> {
  if (busy.value || !canReject.value) return
  busy.value = 'reject'
  actionError.value = null
  try {
    await contentClient.adminReject(submissionId.value, rejectNote.value.trim())
    await router.push('/admin')
  } catch (e) {
    actionError.value = toContentMessage(e)
  } finally {
    busy.value = null
  }
}
</script>

<template>
  <section class="mx-auto w-full max-w-3xl px-4 py-10">
    <p class="font-mono text-[0.6875rem]"><RouterLink class="underline decoration-2 underline-offset-2" to="/admin">← 返回队列</RouterLink></p>
    <h1 class="mt-2 font-display text-[1.75rem] font-black leading-tight">审核详情</h1>

    <p v-if="loadError" role="alert" class="mt-4 border-2 border-ink bg-highlight px-3 py-2 text-xs font-bold">{{ loadError }}</p>
    <p v-if="busy === 'load'" class="mt-4 text-sm text-ink-soft" aria-busy="true">加载中…</p>

    <template v-if="sub">
      <div class="mt-4 flex flex-wrap items-center gap-2">
        <span class="border-2 border-ink bg-surface px-2 py-0.5 font-mono text-[0.6875rem] font-bold">{{ KIND_LABELS[sub.kind] ?? sub.kind }}</span>
        <span class="border-2 border-ink px-2 py-0.5 font-mono text-[0.6875rem] font-bold"
          :class="sub.status === 'pending' ? 'bg-highlight' : sub.status === 'approved' || sub.status === 'rejected' ? 'bg-accent-ink text-paper' : 'bg-surface'">
          {{ STATUS_LABELS[sub.status] ?? sub.status }}
        </span>
        <span class="font-mono text-[0.625rem] text-ink-soft">{{ sub.id }}</span>
      </div>
      <p v-if="sub.review_note" class="mt-3 border-2 border-ink bg-paper px-3 py-2 text-xs"><span class="font-mono font-bold">审核意见：</span>{{ sub.review_note }}</p>

      <dl class="mt-6 space-y-2 border-2 border-ink bg-surface p-4 text-sm shadow-hard">
        <div class="grid grid-cols-[10rem_1fr] gap-2"><dt class="font-mono text-[0.6875rem] text-ink-soft">work_id</dt><dd data-testid="payload-id" class="font-bold">{{ sub.work_id }}</dd></div>
        <div class="grid grid-cols-[10rem_1fr] gap-2"><dt class="font-mono text-[0.6875rem] text-ink-soft">名称</dt><dd data-testid="payload-name">{{ sub.payload?.name }}</dd></div>
        <div class="grid grid-cols-[10rem_1fr] gap-2"><dt class="font-mono text-[0.6875rem] text-ink-soft">原始链接</dt><dd><a v-if="sub.payload?.url" :href="sub.payload.url" target="_blank" rel="noopener noreferrer" class="text-accent-ink underline decoration-2 underline-offset-2">{{ sub.payload.url }}</a></dd></div>
        <div class="grid grid-cols-[10rem_1fr] gap-2"><dt class="font-mono text-[0.6875rem] text-ink-soft">作者</dt><dd>{{ sub.payload?.author?.name }}<span v-if="sub.payload?.author?.url" class="ml-2 font-mono text-[0.625rem] text-ink-soft">{{ sub.payload.author.url }}</span></dd></div>
        <div class="grid grid-cols-[10rem_1fr] gap-2"><dt class="font-mono text-[0.6875rem] text-ink-soft">描述</dt><dd>{{ sub.payload?.description }}</dd></div>
        <div class="grid grid-cols-[10rem_1fr] gap-2"><dt class="font-mono text-[0.6875rem] text-ink-soft">时长</dt><dd>{{ sub.payload?.durationMinutes?.min }}–{{ sub.payload?.durationMinutes?.max }} 分钟</dd></div>
        <div class="grid grid-cols-[10rem_1fr] gap-2"><dt class="font-mono text-[0.6875rem] text-ink-soft">类型 / 标签</dt><dd>{{ GAME_TYPE_LABELS[sub.payload?.type ?? 'other'] ?? sub.payload?.type }} · {{ (sub.payload?.tags ?? []).join('、') || '—' }}</dd></div>
        <div class="grid grid-cols-[10rem_1fr] gap-2"><dt class="font-mono text-[0.6875rem] text-ink-soft">运行时 / 版本</dt><dd>{{ sub.payload?.runtime ?? 'external' }}<span v-if="sub.payload?.version"> · {{ sub.payload.version }}</span><span v-if="sub.payload?.entry"> · 入口 {{ sub.payload.entry }}</span></dd></div>
        <div class="grid grid-cols-[10rem_1fr] gap-2"><dt class="font-mono text-[0.6875rem] text-ink-soft">bundle</dt><dd data-testid="payload-bundle" class="font-mono text-[0.6875rem]">{{ sub.bundle_upload_id ? `已关联上传 ${sub.bundle_upload_id.slice(0, 8)}…（密文，审批通过后可见）` : '—' }}</dd></div>
        <div class="grid grid-cols-[10rem_1fr] gap-2"><dt class="font-mono text-[0.6875rem] text-ink-soft">封面</dt><dd class="font-mono text-[0.6875rem]">{{ sub.cover_upload_id ? '已关联上传（审批通过后可见）' : '—' }}</dd></div>
        <div v-if="sub.payload?.intro" class="grid grid-cols-[10rem_1fr] gap-2"><dt class="font-mono text-[0.6875rem] text-ink-soft">简介</dt><dd class="whitespace-pre-wrap text-xs">{{ sub.payload.intro }}</dd></div>
      </dl>

      <p v-if="actionError" role="alert" class="mt-4 border-2 border-ink bg-highlight px-3 py-2 text-xs font-bold">{{ actionError }}</p>

      <div v-if="isPending" class="mt-6 space-y-3">
        <div class="flex gap-3">
          <button type="button" class="btn-ink lift bg-highlight disabled:opacity-50" :disabled="busy !== null" @click="approve">
            {{ busy === 'approve' ? '处理中…' : '通过' }}
          </button>
          <button type="button" class="btn-ink lift disabled:opacity-50" :disabled="busy !== null" @click="rejectMode = !rejectMode">
            拒绝
          </button>
        </div>
        <div v-if="rejectMode" class="border-2 border-ink bg-surface p-3">
          <label class="font-mono text-[0.6875rem]" for="reject-note">审核意见（必填，将展示给提交者）</label>
          <textarea id="reject-note" v-model="rejectNote" data-testid="reject-note" rows="3" class="mt-1 w-full border-2 border-ink bg-paper px-3 py-2 text-sm" />
          <button type="button" class="btn-ink lift mt-2 bg-accent-ink text-paper disabled:opacity-50" :disabled="!canReject || busy !== null" @click="reject">
            {{ busy === 'reject' ? '处理中…' : '确认拒绝' }}
          </button>
        </div>
      </div>
    </template>
  </section>
</template>
```

- [ ] **Step 3: 验证**

Run: `cd src && npm run typecheck && npx vitest run && npm run build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git branch --show-current
git add src/app/views/AdminView.vue src/app/views/AdminSubmissionView.vue
git commit -m "feat(admin): review queue and works tabs plus submission detail with approve/reject"
```

---

### Task 10: mock 层 e2e（submit-flow / admin-flow / merge-repo）

**Files:**
- Modify: `src/e2e/helpers.ts`（追加 `seedSession`、`API` 常量）
- Create: `src/e2e/submit-flow.spec.ts`、`src/e2e/admin-flow.spec.ts`、`src/e2e/merge-repo.spec.ts`

**Interfaces:**
- Consumes: Task 7/8/9 的 DOM 锚点；auth 构建（`VITE_API_BASE_URL=http://localhost:4173`，Task 3 前置已就位——注意 e2e 构建 env 切换在计划 A Task 7 完成，若计划 A 未合并，本任务先把 `build:e2e` 两处 `VITE_API_BASE_URL=http://localhost:8080` 改为 `http://localhost:4173`、`auth.spec.ts` 的 `const API` 同步改，并在 serve-runtime.mjs 加 SPA fallback 之外的 `/api/**` 404 兜底**不需要**——page.route 全部拦截）
- Produces: spec §9.1 的覆盖

**关键机制**：e2e 构建 apiBase=4173 指向 serve-runtime（它对 `/api/**` 返回 SPA HTML）——所有 API 请求必须被 page.route 拦截 fulfill，拦截不到的调用会因 JSON 解析失败而报错，这是预期防线（漏 mock 即红）。

- [ ] **Step 1: helpers.ts 追加**

```ts
export const API = 'http://localhost:4173'
export const SESSION_KEY = 'crearte.auth.session.v1'

/** 预置登录会话：localStorage 种子 + /api/auth/me mock（session.restore 复核用） */
export async function seedSession(page: Page, role: 'user' | 'admin' = 'user'): Promise<void> {
  const user = { id: 'u-e2e', email: `${role}@e2e.local`, display_name: role, role }
  await page.addInitScript(([key, u]) => {
    localStorage.setItem(key, JSON.stringify({
      token: 'e2e-token',
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      user: u
    }))
  }, [SESSION_KEY, user] as const)
  await page.route(`${API}/api/auth/me`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user }) })
  )
}
```

（`Page` 类型已在 helpers.ts import。）

- [ ] **Step 2: `src/e2e/submit-flow.spec.ts`**

```ts
import { expect, test, type Page, type Route } from '@playwright/test'
import { zipSync } from 'fflate'
import { API, seedSession } from './helpers'

interface Sub {
  id: string; kind: string; status: string; work_id: string
  payload: Record<string, unknown>; bundle_upload_id?: string
  review_note?: string; created_at: string; updated_at: string
}

function makeSub(over: Partial<Sub> = {}): Sub {
  return {
    id: 'sub-1', kind: 'new_work', status: 'draft', work_id: 'my-game',
    payload: { id: 'my-game', name: 'My Game' },
    created_at: '2026-09-27T00:00:00Z', updated_at: '2026-09-27T00:00:00Z', ...over
  }
}

/** 内存态提交 API：POST/GET mine/GET:id/PUT:id/DELETE:id + uploads */
function installSubmissionApi(page: Page, state: { subs: Sub[]; failCreate?: { status: number; code: string; retryAfter?: string } }): void {
  const json = (route: Route, status: number, body: unknown, headers: Record<string, string> = {}) =>
    route.fulfill({ status, contentType: 'application/json', headers, body: JSON.stringify(body) })

  page.route(`${API}/api/uploads`, (route) =>
    json(route, 201, { upload_id: 'up-1', sha256: 'a'.repeat(64), bytes: 1234, kid: 'k'.repeat(22) }))

  page.route(`${API}/api/submissions/mine`, (route) =>
    json(route, 200, { submissions: state.subs }))

  page.route(`${API}/api/submissions`, async (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    if (state.failCreate) {
      return json(route, state.failCreate.status, { error: { code: state.failCreate.code, message: 'x' } },
        state.failCreate.retryAfter ? { 'Retry-After': state.failCreate.retryAfter } : {})
    }
    const body = route.request().postDataJSON()
    const sub = makeSub({
      id: `sub-${state.subs.length + 1}`, kind: body.kind, work_id: body.work_id, payload: body.payload,
      bundle_upload_id: body.bundle_upload_id || undefined,
      status: body.submit ? 'pending' : 'draft'
    })
    state.subs.push(sub)
    return json(route, 201, sub)
  })

  page.route(`${API}/api/submissions/sub-*`, async (route) => {
    const id = new URL(route.request().url()).pathname.split('/').pop()!
    const idx = state.subs.findIndex((s) => s.id === id)
    const method = route.request().method()
    if (method === 'GET') return idx >= 0 ? json(route, 200, state.subs[idx]) : json(route, 404, { error: { code: 'not_found', message: 'x' } })
    if (method === 'PUT') {
      const body = route.request().postDataJSON()
      if (idx >= 0) {
        state.subs[idx] = { ...state.subs[idx], payload: body.payload ?? state.subs[idx].payload, status: body.submit ? 'pending' : 'draft' }
        return json(route, 200, state.subs[idx])
      }
      return json(route, 404, { error: { code: 'not_found', message: 'x' } })
    }
    if (method === 'DELETE') {
      if (idx >= 0) state.subs.splice(idx, 1)
      return route.fulfill({ status: 204, body: '' })
    }
    return route.fallback()
  })
}

const ZIP = zipSync({ 'index.html': [new TextEncoder().encode('<!doctype html><title>t</title>')] })

async function fillNewWorkForm(page: Page): Promise<void> {
  await page.goto('http://localhost:4173/submit/new')
  await page.getByLabel('名称').fill('My Game')
  await expect(page.locator('[data-testid=work-id]')).toHaveValue('my-game') // slug 联动
  await page.getByLabel('作品原始链接').fill('https://example.com/my-game')
  await page.getByLabel('作者名').fill('Tester')
  await page.getByLabel('描述').fill('An e2e test work.')
}

test('新建 virtual 提交：slug 联动 → 上传 → 存草稿 → 提交 → 撤回', async ({ page }) => {
  await seedSession(page)
  const state = { subs: [] as Sub[] }
  installSubmissionApi(page, state)

  await fillNewWorkForm(page)
  await page.locator('[data-testid=runtime-virtual]').check()
  await page.locator('[data-testid=version]').fill('v1')
  await page.locator('[data-testid=bundle-file]').setInputFiles({ name: 'bundle.zip', mimeType: 'application/zip', buffer: Buffer.from(ZIP) })
  await expect(page.locator('[data-testid=bundle-done]')).toBeVisible()

  await page.locator('[data-testid=save-draft]').click()
  await expect(page).toHaveURL('http://localhost:4173/submit')
  await expect(page.locator('[data-testid=submission-sub-1]')).toContainText('草稿')
  expect(state.subs[0].bundle_upload_id).toBe('up-1')

  await page.locator('[data-testid=submission-sub-1]').getByRole('button', { name: '提交' }).click()
  await expect(page.locator('[data-testid=submission-sub-1]')).toContainText('审核中')

  await page.locator('[data-testid=submission-sub-1]').getByRole('button', { name: '撤回' }).click()
  await page.locator('[data-testid=submission-sub-1]').getByRole('button', { name: '确认' }).click()
  await expect(page.locator('[data-testid=submission-sub-1]')).toHaveCount(0)
})

test('work_id/version 修改后已传 bundle 作废并提示重传', async ({ page }) => {
  await seedSession(page)
  installSubmissionApi(page, { subs: [] })
  await fillNewWorkForm(page)
  await page.locator('[data-testid=runtime-virtual]').check()
  await page.locator('[data-testid=version]').fill('v1')
  await page.locator('[data-testid=bundle-file]').setInputFiles({ name: 'bundle.zip', mimeType: 'application/zip', buffer: Buffer.from(ZIP) })
  await expect(page.locator('[data-testid=bundle-done]')).toBeVisible()
  await page.locator('[data-testid=version]').fill('v2')
  await expect(page.locator('[data-testid=bundle-done]')).toHaveCount(0)
  await expect(page.getByText('请重新上传 bundle')).toBeVisible()
})

test('429：存草稿展示限流文案与 Retry-After', async ({ page }) => {
  await seedSession(page)
  installSubmissionApi(page, { subs: [], failCreate: { status: 429, code: 'rate_limited', retryAfter: '37' } })
  await fillNewWorkForm(page)
  await page.locator('[data-testid=save-draft]').click()
  await expect(page.getByRole('alert')).toContainText('操作太频繁')
  await expect(page.getByRole('alert')).toContainText('37')
})

test('rejected：审核意见展示 → 编辑重提', async ({ page }) => {
  await seedSession(page)
  const state = { subs: [makeSub({ status: 'rejected', review_note: '截图不清晰' })] }
  installSubmissionApi(page, state)

  await page.goto('http://localhost:4173/submit')
  await expect(page.locator('[data-testid=submission-sub-1]')).toContainText('已拒绝')
  await expect(page.locator('[data-testid=submission-sub-1]')).toContainText('截图不清晰')

  await page.locator('[data-testid=submission-sub-1]').getByRole('link', { name: '编辑' }).click()
  await expect(page).toHaveURL('http://localhost:4173/submit/sub-1')
  await expect(page.getByLabel('名称')).toHaveValue('My Game')
  page.once('dialog', (d) => void d.accept())
  await page.locator('[data-testid=submit-review]').click()
  await expect(page).toHaveURL('http://localhost:4173/submit')
  await expect(page.locator('[data-testid=submission-sub-1]')).toContainText('审核中')
})
```

（存草稿 `submit:false` 不触发 confirm，无需 dialog 处理；`page.once('dialog')` 一律注册在 click 之前。）

- [ ] **Step 3: `src/e2e/admin-flow.spec.ts`**

```ts
import { expect, test, type Page, type Route } from '@playwright/test'
import { API, seedSession } from './helpers'

const PENDING = {
  id: 'sub-p1', kind: 'new_work', status: 'pending', work_id: 'pending-game',
  payload: { id: 'pending-game', name: 'Pending Game', url: 'https://example.com/pg', author: { name: 'A' }, description: 'd', durationMinutes: { min: 1, max: 5 }, type: 'puzzle', tags: [], runtime: 'external' },
  created_at: '2026-09-27T00:00:00Z', updated_at: '2026-09-27T00:00:00Z'
}

function installAdminApi(page: Page, calls: string[]): void {
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

  page.route(`${API}/api/admin/submissions**`, (route) => {
    const url = new URL(route.request().url())
    if (url.searchParams.get('status') === 'pending') return json(route, { submissions: [PENDING], total: 1 })
    return json(route, { submissions: [], total: 0 })
  })
  page.route(`${API}/api/submissions/sub-p1`, (route) => json(route, PENDING))
  page.route(`${API}/api/admin/submissions/sub-p1/approve`, (route) => { calls.push('approve'); json(route, { ok: true }) })
  page.route(`${API}/api/admin/submissions/sub-p1/reject`, (route) => {
    calls.push(`reject:${route.request().postDataJSON()?.note ?? ''}`)
    json(route, { ok: true })
  })
  page.route(`${API}/api/admin/works/**`, (route) => {
    calls.push(new URL(route.request().url()).pathname + ':' + (route.request().postData() ?? ''))
    json(route, { ok: true })
  })
  // 作品管理 tab：/api/games（页面上下文，可被 page.route 拦截）
  page.route(`${API}/api/games`, (route) => json(route, {
    schemaVersion: 1, generatedAt: 'x',
    games: [{ id: 'live-game', name: 'Live', url: 'https://example.com/lg', author: { name: 'a' }, description: 'd', durationMinutes: { min: 1, max: 2 }, type: 'puzzle', tags: [], addedAt: '2026-09-27', runtime: 'virtual' }]
  }))
  page.route(`${API}/api/games/live-game`, (route) => json(route, {
    id: 'live-game', name: 'Live', url: 'https://example.com/lg', author: { name: 'a' }, description: 'd', durationMinutes: { min: 1, max: 2 }, type: 'puzzle', tags: [], addedAt: '2026-09-27', runtime: 'virtual', version: 'v3', entry: 'index.html',
    bundle: { url: 'https://cdn/b.bin', bytes: 1, sha256: 'a'.repeat(64), enc: { v: 1, alg: 'AES-256-GCM', kid: 'k'.repeat(22) } }
  }))
}

test('审核队列 → 详情 → 拒绝必填 note', async ({ page }) => {
  await seedSession(page, 'admin')
  const calls: string[] = []
  installAdminApi(page, calls)

  await page.goto('http://localhost:4173/admin')
  await expect(page.locator('[data-testid=queue-sub-p1]')).toContainText('Pending Game')
  await page.locator('[data-testid=queue-sub-p1]').getByRole('link', { name: '审核' }).click()
  await expect(page).toHaveURL('http://localhost:4173/admin/submissions/sub-p1')
  await expect(page.locator('[data-testid=payload-name]')).toHaveText('Pending Game')

  await page.getByRole('button', { name: '拒绝' }).click()
  await expect(page.locator('[data-testid=reject-note]')).toBeVisible()
  await expect(page.getByRole('button', { name: '确认拒绝' })).toBeDisabled()
  await page.locator('[data-testid=reject-note]').fill('描述不完整')
  await page.getByRole('button', { name: '确认拒绝' }).click()
  await expect(page).toHaveURL('http://localhost:4173/admin')
  expect(calls).toContain('reject:描述不完整')
})

test('审核通过（confirm 对话框）', async ({ page }) => {
  await seedSession(page, 'admin')
  const calls: string[] = []
  installAdminApi(page, calls)
  page.once('dialog', (d) => void d.accept())

  await page.goto('http://localhost:4173/admin/submissions/sub-p1')
  await page.getByRole('button', { name: '通过' }).click()
  await expect(page).toHaveURL('http://localhost:4173/admin')
  expect(calls).toContain('approve')
})

test('作品管理：下架 / 版本吊销与恢复 / republish', async ({ page }) => {
  await seedSession(page, 'admin')
  const calls: string[] = []
  installAdminApi(page, calls)

  await page.goto('http://localhost:4173/admin')
  await page.getByRole('button', { name: '作品管理' }).click()
  await expect(page.locator('[data-testid=work-row-live-game]')).toBeVisible()

  await page.locator('[data-testid=work-row-live-game]').getByRole('button', { name: '查看' }).click()
  await expect(page.locator('[data-testid=work-row-live-game]')).toContainText('v3')
  await page.locator('[data-testid=work-row-live-game]').getByRole('button', { name: '下架' }).click()
  await page.locator('[data-testid=work-row-live-game]').getByRole('button', { name: '吊销密钥' }).click()
  await page.locator('[data-testid=work-row-live-game]').getByRole('button', { name: '恢复密钥' }).click()

  expect(calls.some((c) => c.includes('/api/admin/works/live-game/unpublish'))).toBe(true)
  expect(calls.some((c) => c.includes('/api/admin/works/live-game/versions/v3/revoke') && c.includes('"revoked":true'))).toBe(true)
  expect(calls.some((c) => c.includes('/api/admin/works/live-game/versions/v3/revoke') && c.includes('"revoked":false'))).toBe(true)
})

test('非 admin：header 无审核入口，/admin 重定向首页', async ({ page }) => {
  await seedSession(page, 'user')
  installAdminApi(page, [])
  await page.goto('http://localhost:4173/')
  await expect(page.getByRole('link', { name: '审核' })).toHaveCount(0)
  await page.goto('http://localhost:4173/admin')
  await expect(page).toHaveURL('http://localhost:4173/')
})
```

- [ ] **Step 4: `src/e2e/merge-repo.spec.ts`**

```ts
import { expect, test, type Page, type Route } from '@playwright/test'
import { API } from './helpers'

function summary(id: string, name: string) {
  return { id, name, url: `https://example.com/${id}`, author: { name: 'a' }, description: 'd', durationMinutes: { min: 1, max: 2 }, type: 'puzzle', tags: [], addedAt: '2026-09-17', runtime: 'external' }
}

function mockApiGames(page: Page, impl: (route: Route) => Promise<unknown> | unknown): void {
  void page.route(`${API}/api/games`, (route) => impl(route))
  void page.route(`${API}/api/games/**`, (route) => impl(route))
}

test('并集合并：同 id API 胜出、source 徽标只给静态源', async ({ page }) => {
  mockApiGames(page, (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ schemaVersion: 1, generatedAt: 'x', games: [summary('2048', '2048（API 版）'), summary('api-only', 'API Only')] })
  }))
  await page.goto('http://localhost:4173/games')
  await expect(page.getByRole('heading', { name: '2048（API 版）' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '2048', exact: true })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'API Only' })).toBeVisible()
  // 静态夹具（如 rel-paths）带社区投稿徽标；API 作品不带
  const staticCard = page.locator('a[href="/games/rel-paths"]')
  await expect(staticCard).toContainText('社区投稿')
  const apiCard = page.locator('a[href="/games/api-only"]')
  await expect(apiCard).not.toContainText('社区投稿')
})

test('API 目录挂掉：降级纯静态，15 款照常展示', async ({ page }) => {
  mockApiGames(page, (route) => route.fulfill({ status: 500, body: 'boom' }))
  await page.goto('http://localhost:4173/games')
  await expect(page.getByRole('heading', { name: '2048', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'rel-paths' })).toBeVisible()
  await expect(page.getByText('加载失败')).toHaveCount(0)
})

test('详情：API 404 回落静态；API 5xx 显示错误态', async ({ page }) => {
  // 静态夹具 rel-paths：API 404 → 回落
  mockApiGames(page, (route) => route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: { code: 'not_found', message: 'x' } }) }))
  await page.goto('http://localhost:4173/games/rel-paths')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('rel-paths')

  // API 5xx：错误态（不回落到静态）
  mockApiGames(page, (route) => route.fulfill({ status: 503, body: 'down' }))
  await page.goto('http://localhost:4173/games/2048')
  await expect(page.getByText('加载失败')).toBeVisible()
  await expect(page.getByRole('button', { name: '重试' })).toBeVisible()
})
```

注意：`mockApiGames` 的 `page.route` 只拦页面上下文请求——目录/详情 fetch 都发生在页面上下文（非 SW），可拦截 ✓。heading 断言按 GameView/CatalogView 实际 DOM 调整（执行时先读 `CatalogView.vue`/`GameView.vue` 确认 heading 层级与卡片结构，再对齐选择器；GameCard 的 name 是 `h2/h3`（headingLevel prop），目录页卡片链接是 `a[href^="/games/"]`）。

- [ ] **Step 5: 运行**

Run: `cd src && npx playwright test e2e/submit-flow.spec.ts e2e/admin-flow.spec.ts e2e/merge-repo.spec.ts && npm run e2e && npm run e2e:noauth`
Expected: 新 spec 全绿 + 既有套件不回归

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add src/e2e/helpers.ts src/e2e/submit-flow.spec.ts src/e2e/admin-flow.spec.ts src/e2e/merge-repo.spec.ts src/package.json src/e2e/auth.spec.ts src/scripts/serve-runtime.mjs
git commit -m "test(e2e): mocked submit flow, admin review flow and dual-source merge specs"
```

（若本任务同时改了 build:e2e env/auth.spec API 常量——计划 A 未合并时的兜底——一并纳入本提交。）

---

### Task 11: 真栈 smoke（docker 编排 + full-loop）

**Files:**
- Create: `src/scripts/e2e-stack.sh`、`src/playwright.stack.config.ts`、`src/e2e/full-loop.spec.ts`
- Modify: `src/package.json`（`build:e2e:stack`、`e2e:stack` 脚本）

**Interfaces:**
- Consumes: 计划 A 的 SW 解密链（**必须已合并进 master 且本分支已 merge master**，否则「可玩/降级」断言不成立——此时本任务整体顺延，先做 Task 12）；兄弟仓 `../crearte-server`（本地 go 工具链）；docker（`postgres:17-alpine` 本地已有、`pgsty/minio` 已验证可拉）
- Produces: `fixtures/generated/stack.json`（就绪旗标 + admin 凭据，spec 读取；缺失 → `test.skip`）

**端口约定**：DB 5433、MinIO 9001、后端 API 8091、前端 4175（全部避开开发环境常用端口；游戏子域 `<id>.localhost:4175`）。

- [ ] **Step 1: `src/scripts/e2e-stack.sh`（可执行）**

```bash
#!/usr/bin/env bash
# 真栈 smoke 编排：postgres + MinIO + 后端 serve + 前端构建/静态服务。
# 依赖缺失（docker 不可用 / 无兄弟后端仓 / go 构建失败）→ skip 模式：
# 不写 stack.json，full-loop.spec 自动跳过；前端照常起（其余套件不受影响）。
set -uo pipefail

FRONT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO_ROOT="$(dirname "$FRONT_ROOT")"
BACKEND="$REPO_ROOT/crearte-server"
STACK_FILE="$FRONT_ROOT/fixtures/generated/stack.json"
DB_PORT=5433 MINIO_PORT=9001 API_PORT=8091 WEB_PORT=4175
ADMIN_EMAIL="admin@stack.local" ADMIN_PASSWORD="stack-admin-password"
SERVER_BIN="/tmp/crearte-stack-server"

cleanup() {
  [ -n "${SERVER_PID:-}" ] && kill "$SERVER_PID" 2>/dev/null
  docker rm -f crearte-stack-db crearte-stack-minio >/dev/null 2>&1
  rm -f "$STACK_FILE"
}
trap cleanup EXIT

stack_ok=1
command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1 || stack_ok=0
[ -d "$BACKEND/src" ] || stack_ok=0
command -v go >/dev/null 2>&1 || stack_ok=0

if [ "$stack_ok" = 1 ]; then
  echo "[stack] starting postgres + minio…"
  docker rm -f crearte-stack-db crearte-stack-minio >/dev/null 2>&1
  docker run -d --name crearte-stack-db -e POSTGRES_USER=crearte -e POSTGRES_PASSWORD=crearte \
    -e POSTGRES_DB=crearte -p "$DB_PORT:5432" postgres:17-alpine >/dev/null || stack_ok=0
  docker run -d --name crearte-stack-minio -p "$MINIO_PORT:9000" \
    -e MINIO_ROOT_USER=minioadmin -e MINIO_ROOT_PASSWORD=minioadmin \
    -e MINIO_API_CORS_ALLOW_ORIGIN='*' pgsty/minio:latest server /data >/dev/null || stack_ok=0
fi

if [ "$stack_ok" = 1 ]; then
  for _ in $(seq 1 60); do curl -sf "http://localhost:$MINIO_PORT/minio/health/live" >/dev/null && break; sleep 1; done
  # 容器内 mc 对 localhost 即 MinIO 自身（9000 为容器内端口）
  docker exec crearte-stack-minio mc alias set local http://localhost:9000 minioadmin minioadmin >/dev/null 2>&1
  docker exec crearte-stack-minio mc mb --ignore-existing local/crearte >/dev/null 2>&1
  docker exec crearte-stack-minio mc anonymous set download local/crearte >/dev/null 2>&1
  for _ in $(seq 1 60); do docker exec crearte-stack-db pg_isready -U crearte >/dev/null 2>&1 && break; sleep 1; done

  echo "[stack] building backend…"
  (cd "$BACKEND/src" && go build -o "$SERVER_BIN" ./cmd) || stack_ok=0
fi

if [ "$stack_ok" = 1 ]; then
  echo "[stack] starting backend on :$API_PORT…"
  (cd "$BACKEND/src" && \
    PORT=$API_PORT \
    DATABASE_URL="postgres://crearte:crearte@localhost:$DB_PORT/crearte?sslmode=disable" \
    AUTH_TOKEN_SECRET="$(openssl rand -base64 32)" \
    BUNDLE_KEK_ACTIVE=k1 BUNDLE_KEK_k1="$(openssl rand -base64 32)" \
    STORAGE_S3_ENDPOINT="http://localhost:$MINIO_PORT" STORAGE_S3_BUCKET=crearte \
    STORAGE_S3_ACCESS_KEY_ID=minioadmin STORAGE_S3_SECRET_ACCESS_KEY=minioadmin \
    STORAGE_S3_FORCE_PATH_STYLE=true \
    "$SERVER_BIN" serve) &
  SERVER_PID=$!
  for _ in $(seq 1 60); do curl -sf "http://localhost:$API_PORT/healthz" >/dev/null && break; sleep 1; done
  curl -sf "http://localhost:$API_PORT/healthz" >/dev/null || stack_ok=0
fi

if [ "$stack_ok" = 1 ]; then
  curl -sf -X POST "http://localhost:$API_PORT/api/auth/register" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\",\"display_name\":\"Stack Admin\"}" >/dev/null
  (cd "$BACKEND/src" && DATABASE_URL="postgres://crearte:crearte@localhost:$DB_PORT/crearte?sslmode=disable" \
    go run ./cmd user set-role "$ADMIN_EMAIL" admin) >/dev/null 2>&1 || stack_ok=0
fi

if [ "$stack_ok" = 1 ]; then
  echo "[stack] building frontend (api base :$API_PORT)…"
  (cd "$FRONT_ROOT" && npm run build:e2e:stack) || stack_ok=0
fi

if [ "$stack_ok" = 1 ]; then
  mkdir -p "$(dirname "$STACK_FILE")"
  cat > "$STACK_FILE" <<JSON
{ "ready": true, "apiBase": "http://localhost:$API_PORT", "webBase": "http://localhost:$WEB_PORT", "adminEmail": "$ADMIN_EMAIL", "adminPassword": "$ADMIN_PASSWORD" }
JSON
  echo "[stack] ready: api=$API_PORT web=$WEB_PORT admin=$ADMIN_EMAIL"
else
  echo "[stack] dependencies missing — running in SKIP mode (frontend only, full-loop will skip)"
  (cd "$FRONT_ROOT" && npm run build:e2e) || exit 1
fi

exec node "$FRONT_ROOT/scripts/serve-runtime.mjs" --port "$WEB_PORT"
```

`chmod +x src/scripts/e2e-stack.sh`。

- [ ] **Step 2: `package.json` 增加脚本**

```json
"build:e2e:stack": "node scripts/build-fixtures.mjs && node scripts/build-data.mjs --with-fixtures && VITE_GAMES_BASE_DOMAIN=localhost:4175 VITE_HOST_ORIGIN=http://localhost:4175 VITE_API_BASE_URL=http://localhost:8091 vite build && VITE_GAMES_BASE_DOMAIN=localhost:4175 VITE_HOST_ORIGIN=http://localhost:4175 VITE_API_BASE_URL=http://localhost:8091 node scripts/build-runtime.mjs",
"e2e:stack": "playwright test --config playwright.stack.config.ts"
```

- [ ] **Step 3: `src/playwright.stack.config.ts`**

```ts
import { defineConfig } from '@playwright/test'

// 真栈 smoke：webServer 由 e2e-stack.sh 编排（docker 依赖缺失自动降级 skip 模式）。
// 与主套件隔离（独立端口 4175 / 独立 testMatch），不跑 noauth。
export default defineConfig({
  testDir: './e2e',
  testMatch: 'full-loop.spec.ts',
  baseURL: 'http://localhost:4175',
  workers: 1,
  timeout: 120_000,
  use: { trace: 'retain-on-failure' },
  webServer: {
    command: 'bash scripts/e2e-stack.sh',
    url: 'http://localhost:4175/',
    reuseExistingServer: false,
    timeout: 600_000
  }
})
```

- [ ] **Step 4: `src/e2e/full-loop.spec.ts`**

```ts
import { existsSync, readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { zipSync } from 'fflate'

const stackFile = new URL('../fixtures/generated/stack.json', import.meta.url)
const stack = existsSync(stackFile)
  ? (JSON.parse(readFileSync(stackFile, 'utf8')) as { ready: boolean; apiBase: string; adminEmail: string; adminPassword: string })
  : null

test.skip(!stack?.ready, '真栈不可用（docker/后端仓/go 缺失），跳过 full-loop smoke')

const WEB = 'http://localhost:4175'
const workId = `stack-work-${Date.now().toString(36)}`
const userEmail = `submitter-${Date.now()}@stack.local`
const userPassword = 'stack-user-password'
const ZIP = zipSync({
  'index.html': [new TextEncoder().encode(
    '<!doctype html><html><body><script>document.body.dataset.ok="stack";document.body.dataset.ready="1"</script></body></html>'
  )]
})

test('全链路：注册→提交→过审→目录可见→可玩→revoke→降级', async ({ page, browser }) => {
  test.setTimeout(240_000)

  // 1. 用户注册（真实 UI + 真实后端）
  await page.goto(`${WEB}/register`)
  await page.locator('#register-email').fill(userEmail)
  await page.locator('#register-name').fill('Stack Submitter')
  await page.locator('#register-password').fill(userPassword)
  await page.getByRole('button', { name: '注册' }).click()
  await expect(page).toHaveURL(`${WEB}/`)

  // 2. 新建 virtual 提交 + 真实上传（服务端加密）
  await page.goto(`${WEB}/submit/new`)
  await page.getByLabel('名称').fill('Stack Work')
  await page.locator('[data-testid=work-id]').fill(workId)
  await page.getByLabel('作品原始链接').fill(`https://example.com/${workId}`)
  await page.getByLabel('作者名').fill('Stack Submitter')
  await page.getByLabel('描述').fill('Real-stack smoke work.')
  await page.locator('[data-testid=runtime-virtual]').check()
  await page.locator('[data-testid=version]').fill('v1')
  await page.locator('[data-testid=bundle-file]').setInputFiles({ name: 'bundle.zip', mimeType: 'application/zip', buffer: Buffer.from(ZIP) })
  await expect(page.locator('[data-testid=bundle-done]')).toBeVisible({ timeout: 30_000 })
  page.once('dialog', (d) => void d.accept())
  await page.locator('[data-testid=submit-review]').click()
  await expect(page).toHaveURL(`${WEB}/submit`)
  await expect(page.getByText('审核中')).toBeVisible()

  // 3. admin（独立 context，脚本预置账号）审核通过
  const adminCtx = await browser.newContext()
  const adminPage = await adminCtx.newPage()
  await adminPage.goto(`${WEB}/login`)
  await adminPage.locator('#login-email').fill(stack!.adminEmail)
  await adminPage.locator('#login-password').fill(stack!.adminPassword)
  await adminPage.getByRole('button', { name: '登录' }).click()
  await adminPage.goto(`${WEB}/admin`)
  await adminPage.getByRole('link', { name: '审核' }).first().click()
  adminPage.once('dialog', (d) => void d.accept())
  await adminPage.getByRole('button', { name: '通过' }).click()
  await expect(adminPage).toHaveURL(`${WEB}/admin`, { timeout: 15_000 })

  // 4. 目录可见（API 源）且可玩（SW 解密链，依赖计划 A）
  await page.goto(`${WEB}/games`)
  await expect(page.getByRole('heading', { name: 'Stack Work' })).toBeVisible({ timeout: 15_000 })
  await page.goto(`${WEB}/games/${workId}`)
  const frame = page.frameLocator('iframe')
  await expect(frame.locator('body')).toHaveAttribute('data-ready', '1', { timeout: 60_000 })
  await expect(frame.locator('body')).toHaveAttribute('data-ok', 'stack')

  // 5. revoke 当前版本 → 全新上下文重进：安装失败（bundle-key 410），不再可玩
  await adminPage.goto(`${WEB}/admin`)
  await adminPage.getByRole('button', { name: '作品管理' }).click()
  const row = adminPage.locator(`[data-testid=work-row-${workId}]`)
  await expect(row).toBeVisible()
  await row.getByRole('button', { name: '查看' }).click()
  await row.getByRole('button', { name: '吊销密钥' }).click()
  await expect(adminPage.getByText('网络连接失败')).toHaveCount(0)

  const freshCtx = await browser.newContext()
  const freshPage = await freshCtx.newPage()
  await freshPage.goto(`${WEB}/games/${workId}`)
  const freshFrame = freshPage.frameLocator('iframe')
  // 410 → 安装失败；无 hosted 回退 → 降级 external（离开本站）或错误态。
  // 断言「不再可玩」：data-ok=stack 不出现
  await expect(freshFrame.locator('body')).not.toHaveAttribute('data-ok', 'stack', { timeout: 30_000 })
})
```

注意：admin 登录页输入框选择器以 `LoginView.vue` 实际值为准（执行时核对，若非 `#login-email`/`#login-password` 则替换）。`page.once('dialog')` 均须注册在触发 click **之前**（代码已按此写）。

- [ ] **Step 5: 运行**

Run: `cd src && npm run e2e:stack`
Expected: 栈可用时 full-loop 全绿；不可用时输出 skip 且退出码 0。随后 `npm run e2e && npm run e2e:noauth` 确认主套件不受影响（stack 容器已由 trap 清理）。

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add src/scripts/e2e-stack.sh src/playwright.stack.config.ts src/e2e/full-loop.spec.ts src/package.json
git commit -m "test(e2e): real-stack full-loop smoke with docker orchestration and skip guard"
```

---

### Task 12: 文档与终验门禁

**Files:**
- Modify: `docs/CHANGELOG.md`（0.8.0 或 0.9.0——若计划 A 已占用 0.8.0 则本计划用 0.9.0，执行时看 CHANGELOG 现状取更高版本）
- Modify: `docs/README.md`（贡献流程补「import 后删静态」运营约定；本地开发补双源说明；部署补顺序约束）

**Interfaces:**
- Consumes: 全部前序任务
- Produces: 可合并分支

- [ ] **Step 1: CHANGELOG 新版本条目（置于当前最高版本之上）**

```markdown
## [0.9.0] - 2026-09-27

### Added / 新增

- Dual-source content layer: catalog and game details now merge the backend API with static JSON (union by id, API wins, `source` badge for static-only community contributions); API outages degrade the catalog to static-only, while detail pages surface errors instead of masking them as not-found.
- 双源内容层：目录与作品详情合并后端 API 与静态 JSON（按 id 并集、API 胜出、静态源作品带「社区投稿」徽标）；API 故障时目录降级纯静态，详情页则显式报错而非伪装成不存在。

- Submission portal at /submit: full lifecycle (new work / new version / metadata change), slug auto-generation, prefill from existing works, XHR bundle & cover uploads with progress, drafts, submit/withdraw/resubmit after rejection with review notes.
- /submit 提交入口：完整生命周期（新作品/新版本/元数据更新）、slug 自动生成、已收录作品预填、XHR bundle 与封面上传（带进度）、草稿、提交/撤回/被拒后重提（含审核意见展示）。

- Admin console at /admin (admin role only): pending review queue with pagination, submission detail with approve/reject (note required), works management (unpublish, bundle-key revoke/restore, republish via approved-submission history).
- /admin 管理台（仅 admin 角色）：待审队列（分页）、审核详情（通过/拒绝，意见必填）、作品管理（下架、密钥吊销/恢复、经已通过提交历史恢复上架）。

### Changed / 变更

- The 4 legacy catalog entries moved from src/games to e2e fixtures: the backend is now the single source of truth for them in production, and the static pipeline remains for future PR contributions until imported.
- 存量 4 作品从 src/games 迁至 e2e 夹具：生产中它们以后端为唯一真源；静态通道保留给后续 PR 贡献（被 import 后同样删除静态文件）。
```

（版本号按 CHANGELOG 现状取；英文行+中文行紧邻、条目间空行的既有格式不变。）

- [ ] **Step 2: README 三处**

1. 「提交一个作品」章节补一段：作品被后端 import/审核收录后，**必须从 `src/games/` 删除对应 JSON**（避免后端下架后静态源复活）；未入库前由静态源展示（目录卡片带「社区投稿」徽标）。
2. 「本地开发」补：`VITE_API_BASE_URL` 非空时目录为双源合并（API ∪ 静态）；本地起后端见 crearte-server README（db-debug + serve）。
3. 「部署」补顺序约束：本版本前端上线前，后端内容管线必须已部署并完成存量 import，否则线上目录为空。

- [ ] **Step 3: 终验门禁**

```bash
cd src
npm run check        # vitest 全量 + vue-tsc + vite build + build-runtime
npm run e2e
npm run e2e:noauth
npm run e2e:stack    # 尽力而为：环境缺依赖时应 skip 且退出码 0
```

Expected: 全部通过（stack 为 skip 也算通过）。

- [ ] **Step 4: Commit**

```bash
git branch --show-current
git add docs/CHANGELOG.md docs/README.md
git commit -m "docs: changelog and README for dual-source content, submit portal and admin console"
```


