# SW bundle 解密链路设计文档

2026-09-27 · 状态：待评审 · 关联：后端 spec `crearte-server` → `docs/superpowers/specs/2026-09-19-bundle-encryption-design.md`（§7 API 契约、§8 前端解密链路、§9.2 共享向量）、`2026-09-26-content-pipeline-design.md`；本仓 `2026-09-17-game-runtime-design.md`、`2026-09-19-frontend-auth-integration-design.md`

## 1. 背景与目标

后端 bundle 信封加密的**读侧早已上线**（`GET /api/games/:id/bundle-key` 发钥、对象存储里的 bundle 均为 CRB1 格式密文），内容管线（提交→审核→发布）也已打通并会给 virtual 作品签发密钥。但本仓运行时从未实现解密：SW 假设 bundle 是明文 zip，只做 sha256 校验后直接解包。后果：**任何加密 bundle 的作品都无法游玩**——内容管线闭环断在最后一环。

后端加密 spec §8 已完整设计过前端解密链路（SW 内 WebCrypto、缓存存解密后条目、共享测试向量），本 spec 是其实施版，并按内容管线落地后的现实做勘误适配（§3）。

目标：

- SW 安装链路支持 CRB1 密文 bundle：拉包与取钥并行 → 密文 sha256 校验 → 头部解析与 kid 三方交叉校验 → AES-256-GCM 解密 → 现有解包/缓存链路无缝衔接
- 跨语言互通有硬保障：与后端共享固定测试向量，Go 加密 ↔ WebCrypto 解密单测锁定
- 夹具体系加密化：e2e/单测全部走真实解密路径（保留 1 个明文 legacy 夹具覆盖双模）
- 失败场景并入现有降级链（`useGameFrame` 状态机），不新造机制

## 2. 非目标（本期不做）

- 内容管线 UI：`ApiContentRepository` 数据层、`/submit` 提交页、`/admin` 管理页（计划 B，另立 spec）
- 私有游戏短时 token 的完整闭环（安装消息已支持 `token` 透传，取钥请求顺带携带，但本期无私有游戏用例）
- 分块/流式解密（GCM 整包解密是后端 spec 冻结的契约；包体上限 100MB 由后端 `BUNDLE_MAX_BYTES` 约束）
- key 的本地持久化缓存（`Cache-Control: no-store` 契约；缓存里存的是解密后条目，无需二次取钥）
- DRM/防逆向承诺（密钥必然到达浏览器，价值 = at-rest 保密 + 提高扒包成本，后端 spec §2 原文）

## 3. 设计决策摘要

| 决策 | 结论 | 原因 |
|---|---|---|
| 解密位置 | SW 内，安装时一次解密，缓存存**解密后条目** | 后端 spec §4 已裁定：无逐请求 CPU 开销；浏览器本地存储不在威胁模型 |
| 双模共存 | 安装消息带 `kid`+`key` → 加密路径；缺失 → 现有明文路径 | 存量 fixture/legacy 明文包兼容（后端 spec §7.3「enc 缺失按明文」） |
| kid 交叉校验 | **三方**：CRB1 文件头 ↔ bundle-key 响应 ↔ 目录数据 `bundle.enc.kid` | 防目录被篡改/错配；后端已补 `enc` 字段（crearte-server `9b0dd6a`） |
| key 获取通路 | host 拼好绝对 `keyUrl` 经 fragment→安装消息传给 SW；SW 不持配置 | SW 零环境依赖，与现有 `bundleUrl`/`sha` 传参同构 |
| 自愈重装 | `RuntimeMeta` 持久化 `kid`/`keyUrl`，`bootstrapRedirect` 重建 fragment 时带上 | 缓存被回收后的自愈链路（sw/index.ts `bootstrapRedirect`）不能丢加密参数 |

### 3.1 对后端加密 spec §8 的勘误（现实变化）

| 旧 spec 假设 | 现状 | 适配 |
|---|---|---|
| bundle 从 `/api/games/:id/bundle` 端点拉取 | 密文直接放 S3 兼容对象存储，目录里是公开绝对 URL | SW 跨域 fetch 密文；桶 CORS 为部署前置项（§9） |
| 响应带 `X-Bundle-Enc` 头参与校验 | S3 直服无此头 | 三方校验取代（见上表），不依赖任何响应头 |
| `bundle.enc` 属 schema v2 但后端未输出 | 后端 `GameBundleView` 已补 `enc:{v,alg,kid}`（2026-09-27） | 本仓 `types.ts` 与 `game.schema.json` 同步（§4） |
| 内容管线 spec §8.4 称「host/sw 零改动」 | 解密必然改 sw/host/bridge | 该句作废；agent 仍零改动 |

## 4. 数据形态与契约

### 4.1 CRB1 文件格式（后端 `internal/bundle/format.go` 冻结，前端只读）

```
偏移  长度  内容
0     4     magic "CRB1"
4     2     hdr_len, u16 大端，当前恒为 42
6     1     alg，0x01 = AES-256-GCM
7     1     kid_len，恒为 22
8     22    kid，ASCII：base64url(sha256(gameID + "\0" + version)[:16])
30    12    IV
42    ...   AES-256-GCM 密文，尾部 16B 为 tag
```

AAD = `file[:hdr_len]`（头部字节本身）。Go `gcm.Seal` 把 tag 附在密文尾——与 WebCrypto `AES-GCM`（ciphertext||tag）字节级兼容。

### 4.2 bundle-key API（后端已上线，契约见加密 spec §7.1）

`GET {apiBase}/api/games/{id}/bundle-key?version={v}` → `200 {"alg":"AES-256-GCM","kid":"<22字符>","key":"<base64url 32B>"}`；`Cache-Control: no-store`；限流 60/min。状态码：400（version 非法）、404（未知 game/version 或无 key 行）、410（已吊销）、429、5xx。公开作品无需 Authorization；`message.token` 存在时透传（私有游戏前向兼容）。

### 4.3 本仓类型与 schema 变更

- `src/app/data/types.ts`：`Game['bundle']` 增加 `enc?: { v: number; alg: string; kid: string }`
- `src/schema/game.schema.json`：`bundle` 增加同款可选 `enc` 对象（`v` 恒 1、`alg` 枚举 `"AES-256-GCM"`、`kid` 22 字符）；缺失合法（明文包）
- `src/runtime/bridge/protocol.ts`：`runtime:install` 消息增加可选 `kid?: string; key?: string`（key 为 bundle-key 端点绝对 URL）；`isShellMessage` 守卫同步校验（存在时必须为 string）
- `src/runtime/sw/meta.ts`：`RuntimeMeta` 增加可选 `kid?: string; keyUrl?: string`
- `src/runtime/host/config.ts`：`runtimeConfig()` 增加 `apiBase`（`VITE_API_BASE_URL`，默认 `''` = 同源 `/api`，与 auth 模块同一 env）
- `src/runtime/host/adapters.ts`：`resolveRuntimeTargets` 中当 `game.bundle.enc` 存在时，fragment 追加 `kid=<enc.kid>`、`key=<apiBase>/api/games/<id>/bundle-key?version=<v>`（apiBase 经 `opts.config` 传入）
- `src/bootstrap/main.ts`：解析 fragment `kid`/`key`，两字段**必须同时存在**才置入安装消息（半套参数按明文处理并 console.warn）

### 4.4 SW 安装消息（最终形态）

```ts
{ type: 'runtime:install'; id; version; entry; bundleUrl; sha256;
  token?; hostOrigin; features?; kid?; key? }
```

`kid`+`key` 均在 → 加密模式；否则明文模式（现行为不变）。

## 5. SW 解密流程

### 5.1 新模块 `src/runtime/sw/crypto.ts`（纯函数，零 DOM/网络依赖）

```ts
export interface BundleHeader { alg: number; kid: string; iv: Uint8Array; headerBytes: Uint8Array }
export class BundleFormatError extends Error {}
export function parseBundleHeader(file: Uint8Array): BundleHeader   // 失败抛 BundleFormatError
export function parseKeyResponse(text: string): { alg: string; kid: string; key: Uint8Array }
    // JSON 解析 + alg=="AES-256-GCM" + key base64url 解码为 32B，失败抛 BundleFormatError
export async function decryptBundle(file: Uint8Array, cekRaw: Uint8Array): Promise<Uint8Array>
```

`parseBundleHeader` 校验：长度 ≥42、magic、hdr_len ∈ [42, file.length]、alg==0x01、kid_len==22、kid 为合法 base64url（解码后 16B）。`decryptBundle`：`importKey("raw", cekRaw, "AES-GCM")` → `decrypt({name:"AES-GCM", iv, additionalData: headerBytes}, key, file[hdr_len:])`，内部先调 `parseBundleHeader`。

### 5.2 `installBundle` 编排改动（`src/runtime/sw/index.ts`）

加密模式下，在现有「流式下载 + 限额 + sha256 校验」**之后**、`extractZip` 之前插入：

1. 与 bundle 下载**并行**发起 `fetch(message.key, {headers: token?, cache:'no-store'})`（在函数起始处启动 promise，下载完成后 await，实现并行）
2. 下载字节 sha256 校验不变（**对象就是密文**，语义天然一致）
3. key 响应非 2xx → 按 §6 分类处理；2xx → `parseKeyResponse(text)`（§5.1）
4. `parseBundleHeader(bundle)` → 三方校验：`header.kid === keyJson.kid === message.kid`，任一不符抛错
5. `decryptBundle(bundle, cek)` → 明文 zip 交给现有 `extractZip`（路径穿越/炸弹校验全保留）→ 缓存写入解密后条目
6. `RuntimeMeta` 落盘时带上 `kid`/`keyUrl`；`bootstrapRedirect` 重建 fragment 时输出 `kid`/`key`

明文模式：`kid`/`key` 缺失，走现有路径，**零行为变化**。

内存峰值注记：加密模式在解密瞬间同时持有密文+明文（≤2×100MB 上限、典型 <2×20MB），SW 生命周期内可接受；不做流式（§2 非目标）。

## 6. 失败处理与降级

全部并入现有 `runtime:error` + `priorVersion` 回退与 shell 降级信号，不新增协议消息：

| 场景 | SW 行为 | 用户可见结果 |
|---|---|---|
| key 端点 401/403/404/**410** | 安装失败，错误信息带状态码；不写缓存 | host 走 `fallback` 降级链（hosted/external） |
| key 端点 429 | 读 `Retry-After`（无则 1s/2s/4s 指数退避），最多 3 次后失败 | 同上 |
| key 端点 5xx/网络错误 | 与 bundle 下载失败同等处理（不重试，直接失败） | 同上 |
| key 响应体畸形（alg 不符/key 非 32B/JSON 解析失败） | 安装失败 | 同上 |
| GCM tag 校验失败 / kid 三方不一致 / header 解析失败 | 安装失败，**不写缓存** | 旧版本缓存仍可玩（`priorVersion` 机制） |
| sha256(密文) 不符 | 现有逻辑不变 | 同上 |

错误信息一律不含 key 材料（kid/状态码可以出现，`key` 字段值绝不进日志与消息）。

## 7. 夹具加密化与共享向量

### 7.1 `scripts/build-fixtures.mjs`

- 夹具链**不需要 KEK**：脚本直接生成随机 CEK 并输出明文 key JSON（前端没有 unwrap 消费方；wrap 格式的跨语言校验由共享向量 `wrapped_cek_hex` 覆盖）。与后端加密 spec §8.3「固定 dev KEK」的偏差在此记录：省去 KEK 不损失任何覆盖
- 每个 virtual 夹具 bundle：Node `crypto` 生成 CEK(32B)/IV(12B) → 按 §4.1 拼 CRB1 头 → `createCipheriv('aes-256-gcm')` + AAD=头部 → 密文文件
- `kid = sha256(gameId + "\0" + version)[:16].toString('base64url')`（与后端 `bundle.Kid()` 同式）
- 夹具 game JSON：`bundle.sha256` = 密文哈希；`bundle.enc = {v:1, alg:"AES-256-GCM", kid}`
- 产出每版本 key JSON（`{alg, kid, key: base64url(cek)}`）到夹具数据目录
- **保留 1 个明文 legacy 夹具**（无 `enc`），覆盖双模旧路径

### 7.2 `scripts/serve-runtime.mjs`

新增 mock 端点 `GET /api/games/:id/bundle-key?version=`：按 key JSON 应答 200；对特定夹具 id 注入故障（约定：`revoked-game` → 410、`ratelimit-game` → 429+Retry-After、`flakey-game` → 500），供降级 e2e 使用。e2e 构建 `VITE_API_BASE_URL` 指向夹具服务器。**计划 A 的测试全程不需要真后端/MinIO**；真后端全链路属计划 B e2e。

### 7.3 共享测试向量

后端 `crearte-server/src/internal/bundle/testdata/bundle-vector.json`（字段：`kek_hex/game_id/version/kid/cek_hex/iv_hex/plaintext_hex/file_hex/wrapped_cek_hex`）复制为 `src/runtime/sw/__fixtures__/bundle-vector.json`。这是**数据文件**且为两仓库 spec（加密 spec §9.2）明文要求的双落地，不违反「两仓禁复制代码」约定。后端向量更新时人工同步（文件头注释注明源路径与同步要求）。

## 8. 测试与验收

单测（vitest，`sw/crypto.test.ts`）：

1. 向量解密：`file_hex` + `cek_hex` → 还原 `plaintext_hex`（跨语言互通锁定）
2. AAD 篡改：改头部任一字节 → 解密必失败
3. 错 key：随机 CEK → 必失败
4. header 解析边界：短文件、错 magic、hdr_len 越界、alg≠0x01、kid_len≠22、kid 非法 base64url
5. key 响应校验：`parseKeyResponse` 对 alg 不符 / key 非 32B / 非法 JSON / 非法 base64url 全部抛错

e2e（playwright，两套配置均需绿）：

6. 现有 virtual/hosted/degrade 套件在加密夹具下全过（= 真实解密路径覆盖，旧 spec §9.3「测试覆盖不退化」）
7. 明文 legacy 夹具仍可安装运行（双模回归）
8. 新增降级用例：`revoked-game`（410）触发 fallback 链；`ratelimit-game` 退避后失败降级
9. 自愈重装：清缓存后经 `bootstrapRedirect` 重建的安装仍带 `kid`/`key` 并成功

验收门禁：`npm run check` + `npm run e2e` + `npm run e2e:noauth` 全绿。

## 9. 部署前置项（记录，不阻塞本期）

- **对象存储桶 CORS**：允许 `https://*.<VITE_GAMES_BASE_DOMAIN>` 的 GET/HEAD（SW 跨域读密文必需；MinIO 用 bucket cors 配置，生产 OSS/S3 同理）——落 `crearte-deploy`
- **API CORS**：后端 baseDomain 通配已支持子域来源（`cors.go` 已验证），部署时确保 `GAMES_BASE_DOMAIN`/`CORS_ALLOWED_ORIGINS` 配置正确即可，无代码改动
- 生产 API 基址由 `VITE_API_BASE_URL` 提供（现为 `https://api.crearte.yoresee.cc`，同源 nginx 反代 `/api` 亦在），keyUrl 拼接直接可用，无新增部署配置

## 10. 边界与风险

- **密钥到达浏览器**：设计即如此（at-rest 保护，非 DRM）；错误信息与日志永不携带 key 值（§6）
- **向量文件漂移**：后端格式变更（CRB2 等）需同步向量与 `crypto.ts`；向量测试是漂移的报警器
- **410 与缓存**：吊销只挡新装；已缓存的解密条目按威胁模型不追缴（后端 spec §2 边界）
- **`enc` 缺失但包实际加密**（目录数据错配）：明文路径解包必然失败（zip magic 不符）→ 安装失败降级，不会静默错乱

## 11. 实施顺序建议（供 writing-plans 参考）

1. 类型/schema/协议字段（§4.3）+ 守卫与单测
2. `crypto.ts` + 向量/边界单测（§7.3、§8.1-5）
3. SW 编排（§5.2）+ meta/bootstrapRedirect 自愈参数
4. host adapters/config + bootstrap 解析
5. 夹具加密化 + serve-runtime mock key 端点（§7）
6. e2e：双模回归、降级用例、自愈用例（§8.6-9）
7. 文档：CHANGELOG、README（运行时章节补解密说明）
