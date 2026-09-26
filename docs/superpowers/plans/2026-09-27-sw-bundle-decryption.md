# SW bundle 解密链路实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让前端 SW 运行时能安装并运行后端信封加密的 CRB1 bundle，打通内容管线「提交→审核→发布→可玩」的最后一环。

**Architecture:** SW 安装链路在「下载+sha256 校验」与「解包」之间插入解密段：与 bundle 下载并行取钥（`bundle-key` API）→ CRB1 头解析 → kid 三方交叉校验（文件头 ↔ key 响应 ↔ 目录 `bundle.enc.kid`）→ WebCrypto AES-256-GCM 解密（AAD=头部）→ 明文 zip 交给现有 `unzip.ts`。加密参数（`kid`/`key` URL）由 host 侧 `resolveRuntimeTargets` 经 bootstrap fragment 传入安装消息，并持久化进 `RuntimeMeta` 供自愈重装。目录数据无 `enc` 时走现有明文路径（双模共存）。

**Tech Stack:** Vue 3 + TypeScript + Vite 8；原生 WebCrypto（零新运行时依赖）；vitest（node 环境，`globalThis.crypto.subtle` 原生可用）；Playwright e2e（夹具服务器 mock bundle-key）；Node `crypto`（仅夹具脚本生成 CRB1 密文）。

**Spec:** `docs/superpowers/specs/2026-09-27-sw-bundle-decryption-design.md`（本仓）；上游契约：crearte-server `docs/superpowers/specs/2026-09-19-bundle-encryption-design.md` §7/§8/§9.2。

## Global Constraints

- 工作目录：`/Users/xingfend/Documents/MyDocs/project/repos/crearte`，所有 npm 命令在 `src/` 下执行
- 分支：`feat/sw-bundle-decryption`（已建）。每次 commit 前跑 `git branch --show-current` 确认非 master
- **禁止从 crearte-server 复制任何代码**（AGPL/专有边界）；唯一例外是数据文件 `bundle-vector.json`（两仓 spec §9.2 明文要求双落地）
- 零新运行时依赖：解密只用原生 WebCrypto；夹具加密只用 `node:crypto`
- `runtime/agent/` 零改动；`runtime/sw/unzip.ts` 及其安全校验（路径穿越/炸弹/限额）不得改动
- 任何错误消息、日志、postMessage **不得包含 key 值**（kid、HTTP 状态码可以出现）
- CRB1 格式以后端 `internal/bundle/format.go` 为准：42B 头（magic "CRB1" / hdr_len u16BE / alg 0x01 / kid_len 22 / kid ASCII / IV 12B），AAD=头部字节，GCM tag 附密文尾
- bundle-key API 契约：`GET {apiBase}/api/games/{id}/bundle-key?version={v}` → `{"alg":"AES-256-GCM","kid":"<22字符>","key":"<base64url 32B>"}`；410=吊销、429=限流（可能带 `Retry-After`）、404=未知
- `bundle.sha256` 语义 = **密文**哈希（后端管线已定）
- 门禁（Task 9 终验全跑）：`npm run check`、`npm run e2e`、`npm run e2e:noauth`
- CHANGELOG：本仓 `docs/CHANGELOG.md`，同条目英文行+中文行紧邻，不同条目空行分隔，高版本在上

## Review Focus

1. **半套加密参数**（目录有 `enc` 但 fragment 只传到 `kid` 或 `key` 之一）→ 按明文安装并 `console.warn`，绝不半加密半明文地静默错乱 → Task 4 bootstrap 解析测试点 + Task 6 编排 `kid&&key` 双在场判定
2. **bundle-key 410（吊销）** → 不写缓存；有旧版本回退旧版本（priorVersion），无则降级 hosted/external → Task 5 单测 + Task 8 e2e（revoked / revoke-update）
3. **bundle-key 429** → 按 `Retry-After`（缺失则 1s/2s/4s 指数退避）重试至多 3 次；成功则正常安装，超限则失败降级 → Task 5 单测 + Task 8 e2e（ratelimit）
4. **畸形输入**（短文件、错 magic、hdr_len 越界、alg≠0x01、kid_len≠22、非法 base64url、key≠32B、非法 JSON）→ 一律 `BundleFormatError` 安装失败，不崩溃、不静默成功 → Task 1 单测边界组
5. **缓存被回收后的自愈重装** → `bootstrapRedirect` 从 `RuntimeMeta` 重建 fragment 必须带 `kid`/`key`，加密包重装成功 → Task 6 meta 落盘/重建 + Task 8 e2e（self-heal）

---

### Task 1: 共享测试向量 + `sw/crypto.ts` 纯函数

**Files:**
- Create: `src/runtime/sw/__fixtures__/bundle-vector.json`（从后端仓库复制的数据文件）
- Create: `src/runtime/sw/crypto.ts`
- Test: `src/runtime/sw/crypto.test.ts`

**Interfaces:**
- Consumes: 无（纯函数，仅依赖全局 `crypto.subtle`/`atob`）
- Produces: `BundleFormatError`、`BundleHeader {alg:number; kid:string; iv:Uint8Array; headerBytes:Uint8Array}`、`parseBundleHeader(file: Uint8Array): BundleHeader`、`BundleKeyMaterial {alg:string; kid:string; key:Uint8Array}`、`parseKeyResponse(text: string): BundleKeyMaterial`、`decryptBundle(file: Uint8Array, cekRaw: Uint8Array): Promise<Uint8Array>`、常量 `KEY_ALG = 'AES-256-GCM'`（Task 5/6 使用）

- [ ] **Step 1: 复制共享测试向量（数据文件，注明来源）**

```bash
cd /Users/xingfend/Documents/MyDocs/project/repos/crearte/src
mkdir -p runtime/sw/__fixtures__
cp ../../crearte-server/src/internal/bundle/testdata/bundle-vector.json runtime/sw/__fixtures__/bundle-vector.json
```

在复制后的文件**外层无法加注释（JSON）**，改为在 `crypto.ts` 文件头注释中写明：「向量源自 crearte-server `src/internal/bundle/testdata/bundle-vector.json`，后端格式变更时需人工同步（加密 spec §9.2）」。

- [ ] **Step 2: 写失败测试 `src/runtime/sw/crypto.test.ts`**

```ts
import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { BundleFormatError, decryptBundle, KEY_ALG, parseBundleHeader, parseKeyResponse } from './crypto'

// 共享向量：crearte-server src/internal/bundle/testdata/bundle-vector.json（Go 加密 ↔ WebCrypto 解密互通锁定）
const vector = JSON.parse(
  readFileSync(new URL('./__fixtures__/bundle-vector.json', import.meta.url), 'utf8')
) as Record<string, string>

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

const file = hexToBytes(vector.file_hex)
const cek = hexToBytes(vector.cek_hex)
const plaintext = hexToBytes(vector.plaintext_hex)

test('向量解密还原明文（跨语言互通）', async () => {
  expect(await decryptBundle(file, cek)).toEqual(plaintext)
})

test('头部解析：kid/alg/iv/头部字节', () => {
  const header = parseBundleHeader(file)
  expect(header.kid).toBe(vector.kid)
  expect(header.alg).toBe(1)
  expect(header.iv).toEqual(hexToBytes(vector.iv_hex))
  expect(header.headerBytes).toEqual(file.slice(0, 42))
})

test('AAD 篡改（IV 字节）必失败', async () => {
  const tampered = file.slice()
  tampered[35] ^= 0xff
  await expect(decryptBundle(tampered, cek)).rejects.toThrow(BundleFormatError)
})

test('密文篡改（GCM tag）必失败', async () => {
  const tampered = file.slice()
  tampered[tampered.length - 1] ^= 0xff
  await expect(decryptBundle(tampered, cek)).rejects.toThrow(BundleFormatError)
})

test('错 key 必失败', async () => {
  await expect(decryptBundle(file, new Uint8Array(32).fill(7))).rejects.toThrow(BundleFormatError)
})

test('header 边界：短文件/错 magic/hdr_len 越界/错 alg/错 kid_len', () => {
  expect(() => parseBundleHeader(new Uint8Array(10))).toThrow(BundleFormatError)
  const badMagic = file.slice(); badMagic[0] = 'X'.charCodeAt(0)
  expect(() => parseBundleHeader(badMagic)).toThrow(BundleFormatError)
  const badHdrLen = file.slice(); badHdrLen[4] = 0xff
  expect(() => parseBundleHeader(badHdrLen)).toThrow(BundleFormatError)
  const badAlg = file.slice(); badAlg[6] = 0x02
  expect(() => parseBundleHeader(badAlg)).toThrow(BundleFormatError)
  const badKidLen = file.slice(); badKidLen[7] = 21
  expect(() => parseBundleHeader(badKidLen)).toThrow(BundleFormatError)
})

test('parseKeyResponse：合法响应', () => {
  const material = parseKeyResponse(JSON.stringify({ alg: KEY_ALG, kid: vector.kid, key: 'k'.repeat(43) }))
  expect(material.kid).toBe(vector.kid)
  expect(material.key.length).toBe(32)
})

test('parseKeyResponse：alg 不符/非法 JSON/key 非 32B/非法 base64url 全部抛错', () => {
  expect(() => parseKeyResponse('not json')).toThrow(BundleFormatError)
  expect(() => parseKeyResponse(JSON.stringify({ alg: 'AES-128-GCM', kid: 'k'.repeat(22), key: 'k'.repeat(43) }))).toThrow(BundleFormatError)
  expect(() => parseKeyResponse(JSON.stringify({ alg: KEY_ALG, kid: 'k'.repeat(22), key: 'c2hvcnQ' }))).toThrow(BundleFormatError)
  expect(() => parseKeyResponse(JSON.stringify({ alg: KEY_ALG, kid: 'k'.repeat(22), key: '!!not-base64!!' }))).toThrow(BundleFormatError)
})
```

注意：`'k'.repeat(43)` 是 43 字符 base64url（补 1 个 `=` 后 11 个量子组 → 恰好解码 32 字节），与 Task 5 的 `KEY_JSON` 用同一常量。

- [ ] **Step 3: 运行测试确认失败**

Run: `cd src && npx vitest run runtime/sw/crypto.test.ts`
Expected: FAIL（`crypto.ts` 不存在，模块解析错误）

- [ ] **Step 4: 实现 `src/runtime/sw/crypto.ts`**

```ts
// CRB1 加密 bundle 的格式解析与 AES-256-GCM 解密（纯函数，无 DOM/网络依赖）。
// 格式由后端 crearte-server internal/bundle/format.go 冻结：
//   0..4   magic "CRB1"
//   4..6   hdr_len (u16 大端，当前恒为 42)
//   6      alg (0x01 = AES-256-GCM)
//   7      kid_len (恒为 22)
//   8..30  kid (ASCII, base64url(sha256(gameID+"\0"+version)[:16]))
//   30..42 IV (12B)
//   42..   密文，尾部 16B 为 GCM tag；AAD = file[:hdr_len]
// 跨语言互通由 __fixtures__/bundle-vector.json 锁定（源自后端 testdata，
// 后端格式变更时需人工同步，见加密 spec §9.2）。

export const MAGIC = 'CRB1'
export const HEADER_SIZE = 42
export const KID_SIZE = 22
export const ALG_AES_256_GCM = 0x01
export const CEK_SIZE = 32
export const KEY_ALG = 'AES-256-GCM'

export class BundleFormatError extends Error {}

export interface BundleHeader {
  alg: number
  kid: string
  iv: Uint8Array
  headerBytes: Uint8Array
}

export interface BundleKeyMaterial {
  alg: string
  kid: string
  key: Uint8Array
}

export function base64UrlToBytes(input: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(input)) throw new BundleFormatError('非法 base64url 字符')
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (input.length % 4)) % 4)
  let binary: string
  try {
    binary = atob(padded)
  } catch {
    throw new BundleFormatError('base64url 解码失败')
  }
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

export function parseBundleHeader(file: Uint8Array): BundleHeader {
  if (file.length < HEADER_SIZE) throw new BundleFormatError(`文件短于 ${HEADER_SIZE} 字节`)
  const magic = String.fromCharCode(file[0], file[1], file[2], file[3])
  if (magic !== MAGIC) throw new BundleFormatError(`magic ${JSON.stringify(magic)}`)
  const hdrLen = (file[4] << 8) | file[5]
  if (hdrLen < HEADER_SIZE || hdrLen > file.length) throw new BundleFormatError(`hdr_len ${hdrLen}`)
  if (file[6] !== ALG_AES_256_GCM) throw new BundleFormatError(`alg 0x${file[6].toString(16)}`)
  if (file[7] !== KID_SIZE) throw new BundleFormatError(`kid_len ${file[7]}`)
  const kid = String.fromCharCode(...file.subarray(8, 8 + KID_SIZE))
  if (base64UrlToBytes(kid).length !== 16) throw new BundleFormatError('kid 编码非法')
  return { alg: file[6], kid, iv: file.slice(30, 42), headerBytes: file.slice(0, hdrLen) }
}

export function parseKeyResponse(text: string): BundleKeyMaterial {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new BundleFormatError('bundle-key 响应非合法 JSON')
  }
  if (typeof data !== 'object' || data === null) throw new BundleFormatError('bundle-key 响应非对象')
  const rec = data as Record<string, unknown>
  if (rec.alg !== KEY_ALG) throw new BundleFormatError(`bundle-key alg ${String(rec.alg)}`)
  if (typeof rec.kid !== 'string') throw new BundleFormatError('bundle-key 缺少 kid')
  if (typeof rec.key !== 'string') throw new BundleFormatError('bundle-key 缺少 key')
  const key = base64UrlToBytes(rec.key)
  if (key.length !== CEK_SIZE) throw new BundleFormatError(`bundle-key 长度 ${key.length}，应为 ${CEK_SIZE}`)
  return { alg: KEY_ALG, kid: rec.kid, key }
}

export async function decryptBundle(file: Uint8Array, cekRaw: Uint8Array): Promise<Uint8Array> {
  if (cekRaw.length !== CEK_SIZE) throw new BundleFormatError(`cek 长度 ${cekRaw.length}`)
  const header = parseBundleHeader(file)
  const key = await crypto.subtle.importKey('raw', cekRaw, { name: 'AES-GCM' }, false, ['decrypt'])
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: header.iv, additionalData: header.headerBytes },
      key,
      file.subarray(header.headerBytes.length)
    )
    return new Uint8Array(plain)
  } catch {
    throw new BundleFormatError('解密失败（密钥不匹配或数据被篡改）')
  }
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `cd src && npx vitest run runtime/sw/crypto.test.ts`
Expected: PASS（9 个测试全绿）

- [ ] **Step 6: Commit**

```bash
git branch --show-current   # 必须是 feat/sw-bundle-decryption
git add src/runtime/sw/crypto.ts src/runtime/sw/crypto.test.ts src/runtime/sw/__fixtures__/bundle-vector.json
git commit -m "feat(sw): CRB1 bundle 格式解析与 AES-256-GCM 解密纯函数（共享向量锁定互通）"
```

---

### Task 2: 数据类型与 JSON schema（`bundle.enc`）

**Files:**
- Modify: `src/app/data/types.ts`（`GameBundle` 增加可选 `enc`）
- Modify: `src/schema/game.schema.json`（`bundle.properties` 增加 `enc`）
- Test: `src/scripts/build-data.test.ts`（追加校验用例）

**Interfaces:**
- Consumes: 无
- Produces: `BundleEnc { v: number; alg: string; kid: string }`、`GameBundle.enc?: BundleEnc`（Task 4 adapters 使用）；schema 允许 `enc`（Task 7 夹具 JSON 依赖，否则 build-data 校验拒绝）

- [ ] **Step 1: 写失败测试（追加到 `src/scripts/build-data.test.ts` 的 `describe('loadGames via generate')` 内）**

```ts
  it('bundle.enc 合法时接受、kid 非法时拒绝', async () => {
    const enc = { v: 1, alg: 'AES-256-GCM', kid: 'k'.repeat(22) }
    const bundle = { url: '/data/bundles/2048.bin', bytes: 10, sha256: 'a'.repeat(64), enc }
    const okRoot = await fixture({
      'games/2048.json': { ...validGame, runtime: 'virtual', version: 'v1', bundle },
      'docs/about.json': { slug: 'about', title: '关于', order: 1, content: '正文' }
    })
    const ok = await generate({ srcRoot: okRoot, check: true })
    expect(ok.ok, JSON.stringify(ok.errors)).toBe(true)

    const badRoot = await fixture({
      'games/2048.json': { ...validGame, runtime: 'virtual', version: 'v1', bundle: { ...bundle, enc: { ...enc, kid: 'short' } } },
      'docs/about.json': { slug: 'about', title: '关于', order: 1, content: '正文' }
    })
    const bad = await generate({ srcRoot: badRoot, check: true })
    expect(bad.ok).toBe(false)
  })
```

注意：与同文件既有用例保持相同的 `fixture()`/`generate()` 调用方式；`bundle.url` 的 `/data/bundles/` 前缀须满足 schema 既有 pattern `^(https://[^\s]+|/data/bundles/)`。

- [ ] **Step 2: 运行确认失败**

Run: `cd src && npx vitest run scripts/build-data.test.ts`
Expected: FAIL（`enc` 被 `additionalProperties: false` 拒绝，第一个断言 `ok.ok` 为 false）

- [ ] **Step 3: 实现 schema 与类型**

`src/schema/game.schema.json` 的 `bundle.properties` 内追加（与 `url`/`bytes`/`sha256` 平级，`required` 不变）：

```json
"enc": {
  "type": "object",
  "additionalProperties": false,
  "required": ["v", "alg", "kid"],
  "properties": {
    "v": { "const": 1 },
    "alg": { "const": "AES-256-GCM" },
    "kid": { "type": "string", "pattern": "^[A-Za-z0-9_-]{22}$" }
  }
}
```

`src/app/data/types.ts`：

```ts
export interface BundleEnc {
  v: number
  alg: string
  kid: string
}

export interface GameBundle {
  url: string
  bytes: number
  sha256: string
  /** 存在即信封加密（CRB1 密文）；缺失按明文（dev/legacy 兼容，加密 spec §7.3） */
  enc?: BundleEnc
}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd src && npx vitest run scripts/build-data.test.ts && npx vitest run app/data/`
Expected: PASS（含 staticRepo 既有测试——`enc` 为可选字段，运行时断言不受影响）

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add src/app/data/types.ts src/schema/game.schema.json src/scripts/build-data.test.ts
git commit -m "feat(data): bundle.enc {v,alg,kid} 进入类型与 JSON schema（schema v2）"
```

---

### Task 3: bridge 协议扩展（`runtime:install` 的 `kid`/`key`）

**Files:**
- Modify: `src/runtime/bridge/protocol.ts`（`ShellMessage` install 变体 + `isShellMessage` 守卫）
- Test: `src/runtime/bridge/protocol.test.ts`

**Interfaces:**
- Consumes: 无
- Produces: install 消息可选字段 `kid?: string; key?: string`（key 为 bundle-key 端点绝对 URL；Task 4 bootstrap 发出、Task 6 SW 消费）

- [ ] **Step 1: 写失败测试（追加到 `protocol.test.ts` 的 `describe('protocol guards')` 内）**

```ts
  test('install 的可选 kid/key 校验', () => {
    const install = { type: 'runtime:install', id: 'a', version: 'v', entry: 'index.html', bundleUrl: 'https://x/b.bin', sha256: 'a'.repeat(64), hostOrigin: 'https://h' }
    expect(isShellMessage({ ...install, kid: 'k'.repeat(22), key: 'https://api.example/api/games/a/bundle-key?version=v' })).toBe(true)
    expect(isShellMessage({ ...install, kid: 42 })).toBe(false)
    expect(isShellMessage({ ...install, key: null })).toBe(false)
    expect(isShellMessage({ ...install, kid: 'k'.repeat(22) })).toBe(true) // 允许半套，编排层按明文处理并告警
  })
```

- [ ] **Step 2: 运行确认失败**

Run: `cd src && npx vitest run runtime/bridge/protocol.test.ts`
Expected: FAIL（`kid: 42` 当前被守卫接受，返回 true）

- [ ] **Step 3: 实现**

`protocol.ts` 中 `ShellMessage` 的 install 变体改为：

```ts
  | { type: 'runtime:install'; id: string; version: string; entry: string; bundleUrl: string; sha256: string; token?: string; hostOrigin: string; features?: Partial<FeatureFlags>; kid?: string; key?: string }
```

`isShellMessage` 的 `case 'runtime:install':` 返回条件末尾追加：

```ts
        (value.kid === undefined || typeof value.kid === 'string') &&
        (value.key === undefined || typeof value.key === 'string')
```

- [ ] **Step 4: 运行确认通过**

Run: `cd src && npx vitest run runtime/bridge/protocol.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add src/runtime/bridge/protocol.ts src/runtime/bridge/protocol.test.ts
git commit -m "feat(bridge): runtime:install 增加可选 kid/key 加密参数与守卫校验"
```

---

### Task 4: host→bootstrap 传参通路（config / adapters / bootstrap main）

**Files:**
- Modify: `src/runtime/host/config.ts`（`apiBase` 语义改为 `VITE_API_BASE_URL`，当前为无消费方的死字段）
- Modify: `src/runtime/host/adapters.ts`（`resolveRuntimeTargets` 注入 `kid`/`key` fragment 参数）
- Modify: `src/bootstrap/main.ts`（解析 fragment `kid`/`key` → install 消息；半套告警）
- Test: `src/runtime/host/adapters.test.ts`

**Interfaces:**
- Consumes: Task 2 的 `GameBundle.enc`；Task 3 的 install 消息字段
- Produces: fragment 参数 `kid`、`key`（bootstrap 页 URL hash）；`RuntimeConfig.apiBase = VITE_API_BASE_URL ?? ''`（Task 7 的 e2e 构建 env 依赖此语义）

- [ ] **Step 1: 写失败测试（追加到 `adapters.test.ts`）**

```ts
test('virtual + bundle.enc 注入 kid 与绝对 key URL', () => {
  const game: Game = {
    ...base, runtime: 'virtual', version: 'v1',
    bundle: {
      url: '/data/bundles/demo.bin', bytes: 10, sha256: 'a'.repeat(64),
      enc: { v: 1, alg: 'AES-256-GCM', kid: 'k'.repeat(22) }
    }
  }
  const [primary] = resolveRuntimeTargets(game, {
    ...opts,
    config: { baseDomain: 'games.example.com', hostOrigin: 'https://games.example.com', apiBase: 'https://api.example' }
  })
  const params = new URLSearchParams(new URL(primary.url).hash.replace(/^#/, ''))
  expect(params.get('kid')).toBe('k'.repeat(22))
  expect(params.get('key')).toBe('https://api.example/api/games/demo/bundle-key?version=v1')
})

test('无 enc 不注入加密参数（明文路径不变）', () => {
  const game: Game = {
    ...base, runtime: 'virtual', version: 'v1',
    bundle: { url: '/data/bundles/demo.zip', bytes: 10, sha256: 'a'.repeat(64) }
  }
  const [primary] = resolveRuntimeTargets(game, {
    ...opts,
    config: { baseDomain: 'games.example.com', hostOrigin: 'https://games.example.com', apiBase: 'https://api.example' }
  })
  const params = new URLSearchParams(new URL(primary.url).hash.replace(/^#/, ''))
  expect(params.get('kid')).toBeNull()
  expect(params.get('key')).toBeNull()
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd src && npx vitest run runtime/host/adapters.test.ts`
Expected: FAIL（`params.get('kid')` 为 null）

- [ ] **Step 3: 实现**

`config.ts`：

```ts
export function runtimeConfig(): RuntimeConfig {
  return {
    baseDomain: import.meta.env.VITE_GAMES_BASE_DOMAIN ?? 'games.example.com',
    hostOrigin: import.meta.env.VITE_HOST_ORIGIN ?? 'https://games.example.com',
    // API 基址（与 app/auth 同一 env）：空 = 同源。用于拼 bundle-key 绝对 URL
    apiBase: import.meta.env.VITE_API_BASE_URL ?? ''
  }
}
```

`adapters.ts` 的 `resolveRuntimeTargets` 中，virtual 分支 `if (game.features ...)` 之前插入：

```ts
    if (game.bundle.enc) {
      const keyBase = config.apiBase || (typeof location !== 'undefined' ? location.origin : '')
      if (keyBase) {
        const keyUrl = new URL(`/api/games/${encodeURIComponent(game.id)}/bundle-key`, keyBase)
        keyUrl.searchParams.set('version', game.version)
        fragment.kid = game.bundle.enc.kid
        fragment.key = keyUrl.href
      }
    }
```

`bootstrap/main.ts`：`main()` 内 `rawFeatures` 解析之后加：

```ts
  const kid = params.get('kid') ?? ''
  const keyUrl = params.get('key') ?? ''
  if (Boolean(kid) !== Boolean(keyUrl)) {
    console.warn('[bootstrap] 加密参数不完整（kid/key 须同时存在），按明文 bundle 安装')
  }
```

`target.postMessage({...})` 的对象里，`...(features ? { features } : {})` 之后加：

```ts
      ...(kid && keyUrl ? { kid, key: keyUrl } : {}),
```

- [ ] **Step 4: 运行确认通过 + 全量类型检查**

Run: `cd src && npx vitest run runtime/host/ && npm run typecheck`
Expected: PASS（adapters/config/useGameFrame 既有测试全绿；vue-tsc 无错）

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add src/runtime/host/config.ts src/runtime/host/adapters.ts src/bootstrap/main.ts src/runtime/host/adapters.test.ts
git commit -m "feat(host): bundle.enc 时经 fragment 传 kid/keyUrl，bootstrap 半套参数告警并按明文安装"
```

---

### Task 5: `sw/keyfetch.ts` 取钥与退避重试

**Files:**
- Create: `src/runtime/sw/keyfetch.ts`
- Test: `src/runtime/sw/keyfetch.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `parseKeyResponse`、`BundleKeyMaterial`、`BundleFormatError`
- Produces: `fetchBundleKey(url: string, opts: { token?: string; maxRetries?: number; sleep?: (ms: number) => Promise<void> }): Promise<BundleKeyMaterial>`（Task 6 使用；`sleep` 仅为测试注入，生产默认 `setTimeout` promise）

- [ ] **Step 1: 写失败测试 `src/runtime/sw/keyfetch.test.ts`**

```ts
import { expect, test, vi } from 'vitest'
import { BundleFormatError } from './crypto'
import { fetchBundleKey } from './keyfetch'

const KEY_JSON = JSON.stringify({ alg: 'AES-256-GCM', kid: 'k'.repeat(22), key: 'k'.repeat(43) })

function mockFetch(responses: Array<{ status: number; headers?: Record<string, string>; body?: string } | Error>) {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    const next = responses[Math.min(calls.length - 1, responses.length - 1)]
    if (next instanceof Error) throw next
    return new Response(next.body ?? '', { status: next.status, headers: next.headers })
  })
  vi.stubGlobal('fetch', fn)
  return calls
}

function noSleep() {
  const slept: number[] = []
  return { sleep: async (ms: number) => { slept.push(ms) }, slept }
}

test('200：解析 key 材料，token 透传 Authorization', async () => {
  const calls = mockFetch([{ status: 200, body: KEY_JSON }])
  const material = await fetchBundleKey('https://api/k', { token: 't0k', sleep: async () => {} })
  expect(material.key.length).toBe(32)
  expect(calls[0].init?.headers).toMatchObject({ Authorization: 'Bearer t0k' })
})

test('429：Retry-After 优先，退避序列 1s/2s/4s，第 4 次成功', async () => {
  mockFetch([
    { status: 429, headers: { 'Retry-After': '3' } },
    { status: 429 },
    { status: 429 },
    { status: 200, body: KEY_JSON }
  ])
  const { sleep, slept } = noSleep()
  const material = await fetchBundleKey('https://api/k', { sleep })
  expect(material.kid).toBe('k'.repeat(22))
  expect(slept).toEqual([3000, 1000, 2000])
})

test('429 超过 3 次重试后失败', async () => {
  mockFetch([{ status: 429 }])
  const { sleep } = noSleep()
  await expect(fetchBundleKey('https://api/k', { sleep })).rejects.toThrow(/HTTP 429/)
})

test('410/404/401/403 立即失败不重试', async () => {
  for (const status of [401, 403, 404, 410]) {
    const calls = mockFetch([{ status }])
    const { sleep } = noSleep()
    await expect(fetchBundleKey('https://api/k', { sleep })).rejects.toThrow(`bundle-key 获取失败: HTTP ${status}`)
    expect(calls.length).toBe(1)
  }
})

test('5xx 与网络错误不重试（与 bundle 下载失败同等处理）', async () => {
  const calls = mockFetch([{ status: 503 }])
  await expect(fetchBundleKey('https://api/k', { sleep: async () => {} })).rejects.toThrow(/HTTP 503/)
  expect(calls.length).toBe(1)

  mockFetch([new Error('network down')])
  await expect(fetchBundleKey('https://api/k', { sleep: async () => {} })).rejects.toThrow('bundle-key 网络错误')
})

test('响应体畸形 → BundleFormatError', async () => {
  mockFetch([{ status: 200, body: '{oops' }])
  await expect(fetchBundleKey('https://api/k', { sleep: async () => {} })).rejects.toThrow(BundleFormatError)
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd src && npx vitest run runtime/sw/keyfetch.test.ts`
Expected: FAIL（`keyfetch.ts` 不存在）

- [ ] **Step 3: 实现 `src/runtime/sw/keyfetch.ts`**

```ts
// bundle-key 端点取钥：429 退避重试（Retry-After 优先），其余非 2xx 立即失败。
// 错误消息只含状态码，绝不含 key 材料。
import { parseKeyResponse, type BundleKeyMaterial } from './crypto'

export interface FetchKeyOptions {
  token?: string
  /** 429 时最多重试次数（不含首次请求） */
  maxRetries?: number
  /** 仅供测试注入；生产为 setTimeout promise */
  sleep?: (ms: number) => Promise<void>
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export async function fetchBundleKey(url: string, opts: FetchKeyOptions = {}): Promise<BundleKeyMaterial> {
  const maxRetries = opts.maxRetries ?? 3
  const sleep = opts.sleep ?? defaultSleep
  const headers: Record<string, string> = { 'Cache-Control': 'no-cache' }
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`
  for (let attempt = 0; ; attempt++) {
    let response: Response
    try {
      response = await fetch(url, { headers, cache: 'no-store' })
    } catch {
      throw new Error('bundle-key 网络错误')
    }
    if (response.ok) return parseKeyResponse(await response.text())
    if (response.status === 429 && attempt < maxRetries) {
      const retryAfter = Number(response.headers.get('Retry-After'))
      const delay = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.round(retryAfter * 1000)
        : 1000 * 2 ** attempt
      await sleep(delay)
      continue
    }
    throw new Error(`bundle-key 获取失败: HTTP ${response.status}`)
  }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd src && npx vitest run runtime/sw/keyfetch.test.ts`
Expected: PASS（6 个测试全绿）

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add src/runtime/sw/keyfetch.ts src/runtime/sw/keyfetch.test.ts
git commit -m "feat(sw): bundle-key 取钥模块（429 退避重试、状态分类、零 key 泄漏）"
```

---

### Task 6: SW 安装编排 + RuntimeMeta 自愈参数

**Files:**
- Modify: `src/runtime/sw/meta.ts`（`RuntimeMeta` 增加可选 `kid?`/`keyUrl?`）
- Modify: `src/runtime/sw/index.ts`（`installBundle` 加密模式；`bootstrapRedirect` 重建加密参数）

**Interfaces:**
- Consumes: Task 1 `parseBundleHeader`/`decryptBundle`/`BundleFormatError`；Task 3 install 消息 `kid`/`key`；Task 5 `fetchBundleKey`
- Produces: 加密安装能力（Task 7/8 的 e2e 依赖）；`RuntimeMeta.kid/keyUrl` 持久化

本任务无独立单测设施（`sw/index.ts` 依赖 SW 全局环境，仓内惯例由 e2e 覆盖）；验证 = 全量 vitest 不回归 + `npm run build`（vue-tsc 类型门禁）+ Task 8 e2e。

- [ ] **Step 1: `meta.ts` 类型扩展**

```ts
export interface RuntimeMeta {
  id: string
  version: string
  entry: string
  hostOrigin: string
  bundleUrl: string
  sha256: string
  installedAt: number
  features?: Partial<FeatureFlags>
  /** 加密 bundle 自愈重装参数：bootstrapRedirect 重建 fragment 时输出 */
  kid?: string
  keyUrl?: string
}
```

- [ ] **Step 2: `index.ts` 顶部 import**

```ts
import { BundleFormatError, decryptBundle, parseBundleHeader } from './crypto'
import { fetchBundleKey } from './keyfetch'
```

- [ ] **Step 3: `installBundle` 改造**

函数开头（`writePendingInstall` 之后、构造 `headers` 处）改为并行启动取钥：

```ts
    const headers: Record<string, string> = {}
    if (message.token) headers.Authorization = `Bearer ${message.token}`
    const encrypted = Boolean(message.kid && message.key)
    if (message.kid && !encrypted) console.warn('[sw] 加密参数不完整（kid/key 须同时存在），按明文安装')
    // 取钥与 bundle 下载并行；失败在安装尾部统一 await 抛出
    const keyPromise = encrypted
      ? fetchBundleKey(message.key!, message.token ? { token: message.token } : {})
      : null
    if (keyPromise) keyPromise.catch(() => {})
```

sha256 校验之后、`extractZip` 之前插入解密段（原 `const entries = await extractZip(bundle)` 替换为）：

```ts
    let zipBytes = bundle
    if (keyPromise) {
      const keyMaterial = await keyPromise
      const header = parseBundleHeader(bundle)
      if (header.kid !== keyMaterial.kid || header.kid !== message.kid) {
        throw new BundleFormatError('kid 三方校验不一致（目录/key 响应/文件头）')
      }
      zipBytes = await decryptBundle(bundle, keyMaterial.key)
    }

    const entries = await extractZip(zipBytes)
```

`const meta: RuntimeMeta = {...}` 对象在 `features: message.features` 之后追加：

```ts
      ...(encrypted ? { kid: message.kid!, keyUrl: message.key! } : {})
```

- [ ] **Step 4: `bootstrapRedirect` 自愈参数**

`if (meta.features ...)` 行之后追加：

```ts
    if (meta.kid && meta.keyUrl) {
      hash.set('kid', meta.kid)
      hash.set('key', meta.keyUrl)
    }
```

- [ ] **Step 5: 验证（类型门禁 + 全量单测不回归 + 构建产物含解密逻辑）**

Run: `cd src && npx vitest run && npm run build && grep -c "CRB1" dist/sw.js`
Expected: vitest 全绿；build 成功；grep 输出 ≥1

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add src/runtime/sw/meta.ts src/runtime/sw/index.ts
git commit -m "feat(sw): 安装链路加密模式（并行取钥、kid 三方校验、GCM 解密）与自愈重装参数"
```

---

### Task 7: 夹具加密化 + serve-runtime mock key 端点 + e2e 基建切换

**Files:**
- Modify: `src/scripts/build-fixtures.mjs`（CRB1 加密、keys 输出、`_plaintext` 旗标）
- Modify: `src/scripts/serve-runtime.mjs`（bundle-key mock + 故障注入）
- Modify: `src/package.json`（`build:e2e` 的 `VITE_API_BASE_URL` → `http://localhost:4173`，共 2 处）
- Modify: `src/e2e/auth.spec.ts`（`const API` → `http://localhost:4173`）
- Create: `src/fixtures/catalog/revoked.json`、`revoke-update.json`、`ratelimit.json`、`plain-legacy.json`
- Create: `src/fixtures/games/revoked/index.html`、`revoke-update/index.html`、`ratelimit/index.html`、`plain-legacy/index.html`

**Interfaces:**
- Consumes: Task 2 schema（夹具 JSON 的 `enc` 须过校验）；Task 4 keyUrl 语义（apiBase 或同源）；Task 6 SW 加密安装
- Produces: 加密夹具（全部既有 virtual 夹具 + 4 个新夹具）；`GET /api/games/:id/bundle-key` mock（故障注入约定：`revoked`→恒 410、`revoke-update` v2→410、`ratelimit`→前 2 次 429）；`fixtures/generated/keys/<id>__<version>.json`（Task 8 e2e 依赖）

**背景（执行者必读）**：改完本任务后，**所有既有 e2e 的 virtual 夹具都走真实解密路径**（spec §8.6「测试覆盖不退化」）。e2e 构建的 API 基址从 `:8080`（auth.spec 用 page.route mock 的假地址）切到 `:4173`（serve-runtime 真实提供 key 端点）；auth mock 改在 4173 上由 page.route 拦截，行为不变。SW 发出的 bundle-key 请求不经过 page.route（跨 origin 且来自 SW），必须由 serve-runtime 真实应答，并带 `Access-Control-Allow-Origin: *`（SW 从 `<id>.localhost:4173` 跨域拉取）。

**对 spec §7.2/§8.8 的落地偏差（记录）**：夹具 id 具体化为 `revoked`（恒 410，首装降级）、`revoke-update`（v1 可装、v2 410，验证 priorVersion 保留——覆盖 spec §6 表「旧版本缓存仍可玩」行）、`ratelimit`（前 2 次 429 后成功，正向验证退避重试；spec §8.8 的「退避后失败降级」路径由 Task 5 单测覆盖，e2e 不重复）；spec 提到的 `flakey-game`（500）不设 e2e 夹具——5xx 不重试、按下载失败降级已由 Task 5 单测锁定。

- [ ] **Step 1: `build-fixtures.mjs` 加密改造**

顶部 import 增加：

```js
import { createCipheriv, randomBytes } from 'node:crypto'
```

`pack()` 函数之后新增（与后端 `bundle.Kid()`/`format.go` 同式；仅夹具生成用）：

```js
function deriveKid(gameId, version) {
  return createHash('sha256').update(`${gameId}\0${version}`).digest().subarray(0, 16).toString('base64url')
}

// CRB1 v1：42B 头 + AES-256-GCM(明文, CEK, IV, AAD=头)，tag 附密文尾（与 Go Seal / WebCrypto 兼容）
function crb1Encrypt(plaintext, kid) {
  const cek = randomBytes(32)
  const iv = randomBytes(12)
  const header = Buffer.alloc(42)
  header.write('CRB1', 0, 'ascii')
  header.writeUInt16BE(42, 4)
  header[6] = 0x01
  header[7] = 22
  header.write(kid, 8, 'ascii')
  iv.copy(header, 30)
  const cipher = createCipheriv('aes-256-gcm', cek, iv)
  cipher.setAAD(header)
  const sealed = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()])
  return { file: Buffer.concat([header, sealed]), cek }
}
```

`await mkdir(path.join(outDir, 'games-alt'), ...)` 之后加：

```js
await mkdir(path.join(outDir, 'keys'), { recursive: true })
```

主循环内：`const { _corruptSha, _corruptV2Sha, ...game } = catalog` 改为：

```js
  const { _corruptSha, _corruptV2Sha, _plaintext, ...game } = catalog
```

virtual 分支中「打包→sha→写文件」段（原 `const zipV1 = pack(...)` 到两个 `writeFile(...games-alt...)`）替换为：

```js
  const zipV1 = pack(render(files, version))
  const zipV2 = pack(render(files, version2))

  // 每版本产出：磁盘对象（密文 .bin / 明文 .zip）、game JSON 的 bundle 对象、key JSON（仅加密时）
  const emitVersion = async (ver, zip, corruptFlag, suffix) => {
    const kid = deriveKid(game.id, ver)
    let bytes = zip
    let enc
    if (!_plaintext) {
      const out = crb1Encrypt(zip, kid)
      bytes = out.file
      enc = { v: 1, alg: 'AES-256-GCM', kid }
      await writeFile(
        path.join(outDir, 'keys', `${game.id}__${ver}.json`),
        JSON.stringify({ alg: 'AES-256-GCM', kid, key: out.cek.toString('base64url') }, null, 2) + '\n'
      )
    }
    const sha = createHash('sha256').update(bytes).digest('hex')
    const declaredSha = corruptFlag ? sha.replace(/^./, (c) => (c === '0' ? '1' : '0')) : sha
    const filename = `${game.id}${suffix}.${_plaintext ? 'zip' : 'bin'}`
    await writeFile(path.join(outDir, 'bundles', filename), bytes)
    return { url: `/data/bundles/${filename}`, bytes: bytes.length, sha256: declaredSha, ...(enc ? { enc } : {}) }
  }

  const bundleV1 = await emitVersion(version, zipV1, _corruptSha, '')
  const bundleV2 = await emitVersion(version2, zipV2, _corruptV2Sha, '-v2')
  await writeFile(path.join(outDir, 'games', `${game.id}.json`), JSON.stringify({
    ...game,
    runtime: 'virtual',
    version,
    entry: game.entry ?? 'index.html',
    bundle: bundleV1
  }, null, 2) + '\n')
  await writeFile(path.join(outDir, 'games-alt', `${game.id}.json`), JSON.stringify({
    version: version2,
    bundle: bundleV2
  }, null, 2) + '\n')
  console.log(`[fixtures] ${game.id}: ${Object.keys(files).length} files, v1=${version} v2=${version2} (${_plaintext ? '明文' : '加密'} ${bundleV1.bytes} bytes)`)
```

- [ ] **Step 2: 新夹具（4 个 catalog + 4 个游戏目录）**

`src/fixtures/catalog/revoked.json`（首装即 410 → 降级 hosted，模式同 corrupt）：

```json
{
  "id": "revoked",
  "name": "吊销夹具",
  "url": "https://example.com/revoked",
  "author": { "name": "test" },
  "description": "fixture",
  "durationMinutes": { "min": 1, "max": 1 },
  "type": "other",
  "tags": ["fixture"],
  "addedAt": "2026-09-17",
  "entry": "index.html",
  "fallback": "hosted",
  "hostedUrl": "http://revoked.localhost:4173/",
  "features": { "inlineScript": true }
}
```

`src/fixtures/games/revoked/index.html`（hosted 降级页，模式同 corrupt）：

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <title>revoked fixture</title>
  </head>
  <body>
    <script>
      document.body.dataset.ok = 'hosted'
      document.body.dataset.ready = '1'
    </script>
  </body>
</html>
```

`src/fixtures/catalog/revoke-update.json`（v1 可装，bump 后 v2 吊销 → priorVersion 保留，模式同 update-fail）：

```json
{
  "id": "revoke-update",
  "name": "更新吊销夹具",
  "url": "https://example.com/revoke-update",
  "author": { "name": "test" },
  "description": "fixture",
  "durationMinutes": { "min": 1, "max": 1 },
  "type": "other",
  "tags": ["fixture"],
  "addedAt": "2026-09-17",
  "entry": "index.html",
  "fallback": "hosted",
  "hostedUrl": "http://revoke-update.localhost:4173/",
  "features": { "inlineScript": true }
}
```

`src/fixtures/games/revoke-update/index.html`：

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <title>revoke-update fixture</title>
  </head>
  <body>
    <script>
      document.body.dataset.ok = 'virtual'
      document.body.dataset.version = '__FIXTURE_VERSION__'
      document.body.dataset.ready = '1'
    </script>
  </body>
</html>
```

`src/fixtures/catalog/ratelimit.json`（前 2 次取钥 429 → 退避后成功；id 约定见 serve-runtime）：

```json
{
  "id": "ratelimit",
  "name": "限流退避夹具",
  "url": "https://example.com/ratelimit",
  "author": { "name": "test" },
  "description": "fixture",
  "durationMinutes": { "min": 1, "max": 1 },
  "type": "other",
  "tags": ["fixture"],
  "addedAt": "2026-09-17",
  "entry": "index.html",
  "features": { "inlineScript": true }
}
```

`src/fixtures/games/ratelimit/index.html`：

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <title>ratelimit fixture</title>
  </head>
  <body>
    <script>
      document.body.dataset.ok = 'virtual'
      document.body.dataset.ready = '1'
    </script>
  </body>
</html>
```

`src/fixtures/catalog/plain-legacy.json`（`_plaintext` 旗标 → 不加密、无 enc，双模回归）：

```json
{
  "id": "plain-legacy",
  "name": "明文遗留夹具",
  "url": "https://example.com/plain-legacy",
  "author": { "name": "test" },
  "description": "fixture",
  "durationMinutes": { "min": 1, "max": 1 },
  "type": "other",
  "tags": ["fixture"],
  "addedAt": "2026-09-17",
  "entry": "index.html",
  "_plaintext": true,
  "features": { "inlineScript": true }
}
```

`src/fixtures/games/plain-legacy/index.html`：

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <title>plain-legacy fixture</title>
  </head>
  <body>
    <script>
      document.body.dataset.ok = 'legacy'
      document.body.dataset.ready = '1'
    </script>
  </body>
</html>
```

- [ ] **Step 3: `serve-runtime.mjs` 增加 bundle-key mock**

`const versionOverrides = new Map()` 之后新增：

```js
// bundle-key mock：应答 fixtures/generated/keys/<id>__<version>.json；按夹具 id 注入故障。
// 必须带 ACAO:*——SW 从 <id>.localhost 跨域取钥。响应永不落磁盘日志（key 材料）。
const rateLimitHits = new Map()

async function bundleKeyMock(res, url) {
  const match = url.pathname.match(/^\/api\/games\/([a-z0-9-]+)\/bundle-key$/)
  if (!match) return false
  const id = match[1]
  const version = url.searchParams.get('version') ?? ''
  const send = (status, body, extra = {}) => {
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
      ...extra
    })
    res.end(typeof body === 'string' ? body : JSON.stringify(body))
  }
  const revoked = { error: { code: 'key_revoked', message: 'version revoked' } }
  if (id === 'revoked' || (id === 'revoke-update' && version === 'v2')) { send(410, revoked); return true }
  if (id === 'ratelimit') {
    const hits = (rateLimitHits.get(id) ?? 0) + 1
    rateLimitHits.set(id, hits)
    if (hits <= 2) { send(429, { error: { code: 'rate_limited', message: 'slow down' } }, { 'Retry-After': '1' }); return true }
  }
  try {
    const body = await readFile(path.join(fixtures, 'generated', 'keys', `${id}__${version}.json`), 'utf8')
    send(200, body)
  } catch {
    send(404, { error: { code: 'not_found', message: 'unknown game or version' } })
  }
  return true
}
```

请求分发处：`if (url.pathname === '/__test/bump-version') {...}` 块之后、`if (isGameHost) {` 之前插入：

```js
    if (await bundleKeyMock(res, url)) return
```

- [ ] **Step 4: e2e 构建 env 与 auth.spec 切换**

`src/package.json` 的 `build:e2e` 脚本中两处 `VITE_API_BASE_URL=http://localhost:8080` 均改为 `VITE_API_BASE_URL=http://localhost:4173`（vite build 与 build-runtime 各一处）。`build:e2e:noauth` 保持 `VITE_API_BASE_URL=`（空 → keyUrl 落同源 4174，serve-runtime 同样应答）。

`src/e2e/auth.spec.ts` 第 3 行：

```ts
const API = 'http://localhost:4173'
```

（auth mock 仍由 page.route 在页面上下文拦截 fulfill，请求不会到达 serve-runtime，行为不变。）

- [ ] **Step 5: 验证——夹具生成 + 全量既有 e2e（真实解密路径）**

```bash
cd src
npm run build:fixtures
ls fixtures/generated/keys/ | head          # 应含 abs-paths__v1.json 等；plain-legacy 无 keys
python3 -c "import json;d=json.load(open('fixtures/generated/games/abs-paths.json'));print(d['bundle']['enc'])"   # {'v':1,'alg':'AES-256-GCM','kid':...}
python3 -c "import json;d=json.load(open('fixtures/generated/games/plain-legacy.json'));print('enc' in d['bundle'])"  # False
npm run e2e
```

Expected: 既有 e2e 全绿（core/crash/degrade/lifecycle/save/update/outbound/hosted/auth/landing）——其中所有 virtual 夹具已经走 CRB1 解密。若 `update.spec` 的 bump-version 失败，检查 games-alt JSON 是否带 v2 的 `enc`（serve-runtime 的 override 逻辑整体替换 `json.bundle`，enc 随之带入）。

再跑 noauth 套件：`npm run e2e:noauth`，Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add src/scripts/build-fixtures.mjs src/scripts/serve-runtime.mjs src/package.json src/e2e/auth.spec.ts src/fixtures/
git commit -m "feat(e2e): 夹具 bundle 全面 CRB1 加密 + serve-runtime mock bundle-key（410/429 注入）"
```

---

### Task 8: 解密专项 e2e（降级 / 退避 / 双模 / 自愈）

**Files:**
- Create: `src/e2e/decrypt.spec.ts`

**Interfaces:**
- Consumes: Task 7 的夹具与 mock 端点；既有 `helpers.ts` 的 `openGame`/`frameDataset`
- Produces: spec §8.7-8.9 的验收覆盖

- [ ] **Step 1: 写 `src/e2e/decrypt.spec.ts`**

```ts
import { expect, test } from '@playwright/test'
import { frameDataset, openGame } from './helpers'

test('取钥 410：首装失败降级到 hosted', async ({ page }) => {
  await page.goto('http://localhost:4173/games/revoked')
  const frame = page.frameLocator('iframe')
  await expect(frame.locator('body')).toHaveAttribute('data-ready', '1', { timeout: 30_000 })
  expect(await frameDataset(page, 'ok')).toBe('hosted')
})

test('新版本取钥 410：保留旧版本且不注销 SW', async ({ page, request }) => {
  await openGame(page, 'revoke-update')
  expect(await frameDataset(page, 'version')).toBe('v1')
  await request.get('http://localhost:4173/__test/bump-version?id=revoke-update')
  await page.reload()
  await expect(page.frameLocator('iframe').locator('body')).toHaveAttribute('data-version', 'v1', { timeout: 30_000 })
})

test('取钥 429：退避重试后安装成功', async ({ page }) => {
  await openGame(page, 'ratelimit')
  expect(await frameDataset(page, 'ok')).toBe('virtual')
})

test('明文 legacy 夹具（无 enc）仍可安装运行（双模回归）', async ({ page }) => {
  await openGame(page, 'plain-legacy')
  expect(await frameDataset(page, 'ok')).toBe('legacy')
})

test('缓存回收后自愈重装：重建的安装参数含 kid/key 且成功', async ({ page }) => {
  await openGame(page, 'abs-paths')
  const frame = page.frames().find((f) => f.url().startsWith('http://abs-paths.localhost:4173'))
  expect(frame, 'game frame 应存在').toBeTruthy()
  await frame!.evaluate(async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith('bundle-')) await caches.delete(name)
    }
  })
  await page.goto('http://abs-paths.localhost:4173/')
  await expect(page.locator('body')).toHaveAttribute('data-ready', '1', { timeout: 30_000 })
  expect(await page.locator('body').getAttribute('data-ok')).toBe('abs')
})
```

- [ ] **Step 2: 运行确认通过**

Run: `cd src && npx playwright test e2e/decrypt.spec.ts`
Expected: 5 个测试全绿（webServer 由 playwright 配置自动构建启动）。若「自愈重装」失败，优先检查 Task 6 Step 4 的 `bootstrapRedirect` 是否输出了 `kid`/`key`。

- [ ] **Step 3: Commit**

```bash
git branch --show-current
git add src/e2e/decrypt.spec.ts
git commit -m "test(e2e): 解密专项——410 降级/旧版保留、429 退避、明文双模、自愈重装"
```

---

### Task 9: 文档与终验门禁

**Files:**
- Modify: `docs/CHANGELOG.md`（新版本 0.8.0 置顶）
- Modify: `docs/README.md`（运行时章节补一句解密说明）

**Interfaces:**
- Consumes: 全部前序任务的既成事实
- Produces: 可合并的完整分支

- [ ] **Step 1: CHANGELOG 增加 0.8.0（置于 `## [0.7.6]` 之上）**

```markdown
## [0.8.0] - 2026-09-27

### Added / 新增

- The SW runtime now installs envelope-encrypted CRB1 bundles: parallel bundle-key fetch with 429 backoff, three-way kid cross-check (catalog `bundle.enc.kid` ↔ key response ↔ file header), AES-256-GCM decryption via WebCrypto before the existing unzip/cache chain; plaintext bundles (no `enc`) keep the legacy path. Self-heal reinstalls rebuild encryption params from persisted runtime meta; e2e fixtures are encrypted with fault-injected key endpoints (410/429).
- SW 运行时支持安装信封加密的 CRB1 bundle：并行取钥（429 退避重试）、kid 三方交叉校验（目录 `bundle.enc.kid` ↔ key 响应 ↔ 文件头）、WebCrypto AES-256-GCM 解密后衔接现有解包/缓存链路；无 `enc` 的明文 bundle 保持旧路径。自愈重装从持久化 meta 重建加密参数；e2e 夹具全面加密并注入取钥故障（410/429）。
```

- [ ] **Step 2: README 运行时说明**

在 `docs/README.md` 「运行时三件套」条目（第 74 行附近，描述 `dist/sw.js` 的列表项）末尾追加一句：

```
virtual 作品的 bundle 为 CRB1 信封加密密文时（目录数据带 `bundle.enc`），SW 安装期并行请求 `{VITE_API_BASE_URL}/api/games/{id}/bundle-key` 取钥解密（设计见 `docs/superpowers/specs/2026-09-27-sw-bundle-decryption-design.md`）；对象存储需为游戏子域配置 CORS GET/HEAD。
```

- [ ] **Step 3: 终验门禁（三连全绿）**

```bash
cd src
npm run check        # vitest 全量 + vue-tsc + vite build + build-runtime
npm run e2e          # 含 decrypt.spec 的完整套件
npm run e2e:noauth
```

Expected: 三者全部通过，无跳过无失败。

- [ ] **Step 4: Commit**

```bash
git branch --show-current
git add docs/CHANGELOG.md docs/README.md
git commit -m "docs: 0.8.0 CHANGELOG 与 README 运行时解密说明"
```
