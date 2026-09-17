# 游戏内嵌运行时（Game Runtime）设计文档

2026-09-17 · 状态：待评审

## 1. 背景与目标

现状：本站是纯静态游戏目录，游戏只有 `url` 字段，点击后新标签外链跳转。

目标：后端下发游戏资产（zip 包），前端在站内用**虚拟运行环境**隔离运行这些游戏，满足：

- 游戏是**不可信第三方上传**的代码，必须与宿主前端、其他游戏完全隔离
- 游戏只保证包内有入口 HTML，路径写法（相对/绝对/`../`/query）与 MIME 不可预期，运行时必须兜底
- 游戏有状态（localStorage/IndexedDB 存档），要求本地自动持久，架构预留云同步
- 支持两种资产投递方式，且可逐游戏选择、A 失败自动降级 C：
  - **A 虚拟源（virtual）**：zip 下发 → 浏览器内解包进 Cache API → Service Worker 虚拟成一个源
  - **C 后端托管（hosted）**：后端把游戏当静态站点部署在独立子域，前端只负责隔离运行
- 本期只做**前端运行时 + 后端 API 契约**，后端实现另开 spec；本地 mock 可跑通全流程

## 2. 非目标（本期不做）

- 后端的上传、存储、审核、发布实现（只定契约）
- 云端存档同步（本地先行，接口与时序预留）
- 账号、评分、评论、联机服务端能力
- 游戏代码审计、反作弊、行为分析
- 支持游戏自带 Service Worker（A 明确剥夺，C 建议剥夺）
- 变更宿主站的信息架构与视觉（仅新增播放器区域与相关状态）

## 3. 设计决策摘要

| 决策 | 结论 | 原因 |
|---|---|---|
| 游戏来源 | 不可信第三方 | 按恶意代码威胁模型设计 |
| 源隔离 | 每游戏一个子域 `<id>.games.example.com` | 独立 localStorage/IndexedDB/cookie/CSP/配额；绝对路径天然落回游戏根 |
| 投递 | A 虚拟源 + C 后端托管共存，`runtime` 字段选择，A 可降级 | 前端虚拟化不依赖后端托管能力；后端就绪后可平滑迁移 |
| 证书 | acme.sh `dns_ali`（阿里云 DNS-01）签 `*.games.example.com` | Let's Encrypt 通配符免费、自动续期；DNS 已可通配解析 |
| cookie | 宿主不使用 cookie 鉴权（token 走内存 + Authorization） | 同注册域下游戏可向父域投毒 cookie |
| CSP | 安全优先：默认禁 eval/inline script，由 manifest `features` 逐游戏开启 | 不可信代码；兼容性靠上架扫描建议标志位 |
| COOP/COEP | 按需（`features.coop`） | 只有 WASM 多线程/SharedArrayBuffer 类游戏需要 |
| 存档 | 本地天然持久；`SaveProvider` 抽象预留云同步 | 本期不引入后端依赖 |

## 4. 总体架构

```
games.example.com（宿主 Vue SPA）
  HomeView（目录，新增"站内可玩"标记）
  GameView（详情 + 内嵌播放器）
    └─ GameHost.vue ── MessagePort（握手后私有通道）──┐
         │ sandbox iframe（跨源）                      │
         ▼                                             ▼
 <id>.games.example.com（每游戏独立源）          Agent（注入游戏页，首个脚本）
 ┌────────────────────────────────────────────┐
 │ A: /__bootstrap shell → /sw.js → Cache API │
 │ C: 后端直接服务解包后的静态文件             │
 │ 共同: sandbox / CSP / 独立存储 / 版本        │
 └────────────────────────────────────────────┘
         │ GET /api/games/:id/bundle（CORS，见 §9）
         ▼
 后端（本期仅契约；本地用 /data mock）
```

三种 `runtime` 模式：

| 模式 | 行为 |
|---|---|
| `external`（默认） | 现状：新标签打开 `url`，不进 iframe |
| `virtual` | A：打包下发 + SW 虚拟源 |
| `hosted` | C：iframe 直接加载 `playOrigin`，后端已托管文件 |

宿主只实现一套 `GameHost`，投递差异封装在适配器里；桥协议、安全策略、存档抽象完全共用。

## 5. 源与域名模型

### 5.1 子域规则

- 游戏地址：`https://<id>.<gamesBaseDomain>`，`gamesBaseDomain` 由 `VITE_GAMES_BASE_DOMAIN` 配置（生产 `games.example.com`，开发/测试 `localhost:<port>`）
- `id` 即 DNS label，**发布后不可变**（改 id = 换源 = 丢本地存档）；schema 收紧为 `^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$`
- 保留字（禁止用作 id）：`www`、`api`、`cdn`、`assets`、`static`、`admin`、`status`、`play`，以及 `__` 前缀（避免与运行时保留路径冲突）
- `playOrigin` 字段可选，仅用于开发/mock 时覆盖推导结果；生产不填

### 5.2 存储隔离

- localStorage / IndexedDB / Cache API / cookie 均按子域天然隔离，每个游戏独立，且有独立配额
- 浏览器可能回收 Cache Storage（见 §10.6）；localStorage 在 Safari 下长期不访问会被 ITP 清理，列为已知限制

### 5.3 cookie 投毒与对策（约束）

游戏在 `x.games.example.com` 上可以写 `Domain=games.example.com` 的 cookie，从而影响宿主。约束：

1. **宿主一律不用 cookie 做鉴权/会话**，token 放内存 + `Authorization` 头
2. 若未来必须用 cookie，只能用 `__Host-` 前缀（子域无法伪造），并在 spec 层面重新评审
3. 宿主与游戏中都不得设置 `document.domain`

若未来需要彻底隔离（比如接入高风险游戏），可把游戏迁到独立注册域（如 `*.play.example.net`）：本设计的源模型、DNS、证书流程全部平移，仅多一份配置。

## 6. 隔离与安全策略

### 6.1 iframe 属性

```html
<iframe
  sandbox="allow-scripts allow-same-origin allow-pointer-lock"
  allow="fullscreen; autoplay; gamepad"
  referrerpolicy="no-referrer"
  loading="eager"
></iframe>
```

- `allow-same-origin` 是 localStorage/IndexedDB 可用的前提；因父子**跨源**，游戏无法访问父 DOM、无法移除自己的 sandbox，经典警告不适用
- 不给 `allow-top-navigation`（防钓鱼跳转）、`allow-popups`、`allow-modals`、`allow-forms`、`allow-downloads`
- `allow` 中的 `fullscreen`/`autoplay` 常开，`gamepad` 由 `features.gamepad` 控制；旧浏览器可加 `allowfullscreen` 属性兜底
- 焦点：跨源 iframe 需先点击才收键盘事件，宿主在"开始游戏"按钮点击后 `iframe.focus()`

### 6.2 响应安全头（A 由 SW 下发，C 由服务端下发）

| 头 | 值 |
|---|---|
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `no-referrer` |
| `Content-Security-Policy` | 见 §6.3 生成规则，并追加 `frame-ancestors https://<hostAppOrigin>`（同一条头，只有宿主能内嵌，防钓鱼/白嫖） |
| `Cross-Origin-Opener-Policy` | `same-origin`（仅 `features.coop`） |
| `Cross-Origin-Embedder-Policy` | `require-corp`（仅 `features.coop`） |
| `Cross-Origin-Resource-Policy` | `same-origin`（仅 `features.coop`） |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), usb=(), serial=(), hid=()` |

### 6.3 CSP 生成规则（安全优先）

基础值（下表标志按默认值应用后即为实际生效值，默认生效值含 `'wasm-unsafe-eval'` 与 `style-src 'unsafe-inline'`）：

```
default-src 'none';
script-src 'self';
style-src 'self';
img-src 'self' data: blob:;
media-src 'self' data: blob:;
font-src 'self' data:;
connect-src 'self';
worker-src 'self' blob:;
frame-src 'none';
object-src 'none';
base-uri 'self';
form-action 'none';
manifest-src 'none'
```

`features` 逐项放宽：

| 标志 | 默认 | 效果 |
|---|---|---|
| `eval` | false | `script-src` 追加 `'unsafe-eval'`（`new Function`/旧引擎） |
| `inlineScript` | false | `script-src` 追加 `'unsafe-inline'`（内联 `<script>`、`on*=` 属性） |
| `inlineStyle` | **true** | `style-src` 追加 `'unsafe-inline'`。样式无代码执行能力且绝大多数游戏依赖，单独放开；可按游戏关闭 |
| `wasm` | true | `script-src` 追加 `'wasm-unsafe-eval'`（允许 WASM，不允许 JS eval） |
| `coop` | false | 下发 COOP/COEP/CORP（WASM 线程、SharedArrayBuffer） |
| `fullscreen` | true | iframe `allow` 加 `fullscreen` |
| `gamepad` | false | iframe `allow` 加 `gamepad` |

- 标志由发布/上架流程确定（静态扫描 + 人工确认），前端只负责应用；本 spec 只定义语义
- 内联 `<style>` 与 `style=` 属性在 `inlineStyle=false` 时会被拦（CSSOM 赋值不受影响）

### 6.4 网络与能力剥夺

- **未命中资产的请求一律 404，绝不回源**（防探测、防外传）；外联被 `connect-src 'self'` 与 `default-src 'none'` 阻断
- Agent 剥夺：`navigator.serviceWorker.register/unregister/getRegistrations`（A 必须，避免与运行时 SW 抢占；C 保持一致行为）、`document.domain` setter
- 游戏对自己源的 Cache Storage/IndexedDB 有完全访问权（可自毁缓存/注册）——属于自伤，不在威胁模型内，仅记录
- 宿主不向游戏发送任何敏感数据；桥消息只含生命周期与存档摘要

## 7. 宿主 ↔ 游戏桥协议

### 7.1 握手时序

1. Agent 作为游戏文档的**首个脚本**执行，向 `window.parent` 发 `agent:boot`（`targetOrigin` 取自注入 query，见 §10.3 / §11.3）
2. 宿主校验 `event.origin === gameOrigin && event.source === iframe.contentWindow` 后，回 `host:hello` 并 transfer 一个 `MessagePort`（含协议版本 `v=1`、locale、能力位）
3. Agent 收到后在 port 上回 `agent:hello-ack`；此后所有通信只走该 port
4. 协议版本不一致 → Agent 发 `agent:unsupported`，宿主显示明确错误并降级
5. 宿主超时（默认 10s）未收到 `hello-ack` → 判失败，走重试/降级

### 7.2 消息

宿主 → Agent（命令）：

| 消息 | 载荷 | 说明 |
|---|---|---|
| `host:hello` | `{v, port, locale, capabilities}` | 握手 |
| `host:pause` / `host:resume` | — | 宿主切后台/切标签页时由 `visibilitychange` 触发 |
| `host:snapshot-request` | `{id}` | 请求存档快照（云同步预留） |
| `host:clear-save` | — | 清除该游戏本地存档 |
| `host:update-available` | `{version}` | 有新版本，由宿主决定何时切换 |
| `host:exit-ack` | — | 响应退出请求 |

Agent → 宿主（事件）：

| 消息 | 载荷 | 说明 |
|---|---|---|
| `agent:boot` / `agent:hello-ack` | `{v}` | 握手 |
| `game:ready` | `{ms}` | 文档 load 或游戏主动上报 |
| `game:error` | `{message, source?}` | 未捕获错误/资源加载失败/崩溃兜底 |
| `game:score` | `{score, meta?}` | 可选，游戏接入 `__GAME_HOST__.reportScore` 才有 |
| `game:exit-request` | — | 游戏请求返回目录 |
| `game:storage-changed` | `{keys, bytes}` | 存档变更（debounce，200ms） |
| `game:snapshot` | `{id, data}` | 存档快照响应（有大小上限，超限截断并拒绝） |
| `game:unsupported` | `{reason}` | 协议版本不符等 |

### 7.3 对游戏暴露的可选 API

```ts
window.__GAME_HOST__ = {
  reportScore(score: number, meta?: unknown): void
  requestExit(): void
  getMeta(): { id: string; version: string; locale: string }
}
```

不接入也能运行：Agent 自动在 `load` 时发 `game:ready`，在 `error`/`unhandledrejection` 时发 `game:error`。宿主对 `game:score` 做类型校验与频率限制。

## 8. 状态与存档

- 本地层零代码：独立源下游戏自己的 localStorage/IndexedDB 天然隔离且持久
- Agent 内 `SaveProvider` 接口，本期只实现 `LocalSaveProvider`：

```ts
interface SaveProvider {
  snapshot(): Promise<{ bytes: number; keys: number; data: string }>
  restore(snap: string): Promise<void>
  clear(): Promise<void>
  subscribe(cb: (info: { keys: number; bytes: number }) => void): () => void
}
```

- `LocalSaveProvider`：包装 `Storage.prototype.setItem/removeItem/clear` 得到变更事件；`snapshot` 序列化该源 localStorage（默认上限 512 KiB，超限报错）；`restore` 逐键写回
- 宿主 UI：显示"有存档/大小"、清除存档；不展示游戏内细节
- **云同步预留（本期不实现）**：
  - 恢复必须早于游戏脚本执行。A 模式链路：宿主经握手拿到快照 → 写入 shell 的保留键 → `location.replace('/')` → Agent 作为首个同步脚本读取保留键并 `restore()` → 清除保留键
  - C 模式没有 shell 中转，恢复只能异步（可能晚于游戏初始化）。因此**云同步只承诺 A 模式**，C 模式需游戏主动配合或降级为"下次进入生效"，写入本 spec 以免未来误用
  - 快照上传由宿主侧 `CloudSaveProvider` 接后端，Agent 只提供数据与事件

## 9. 数据模型与 API 契约

### 9.1 schema v2 新增字段（`src/schema/game.schema.json`）

| 字段 | 必填 | 规则 |
|---|---|---|
| `runtime` | 否 | `external`（默认）\| `virtual` \| `hosted` |
| `version` | `virtual` 必填 | `^[a-z0-9][a-z0-9._-]{0,63}$`，发布后单调变化；作为缓存键与更新判断依据 |
| `entry` | 否 | 默认 `index.html`，相对包根路径，必须 `^[a-zA-Z0-9._/-]+$` 且不含 `..` |
| `bundle` | `virtual` 必填 | `{ url, bytes, sha256 }`；`sha256` 为 `^[0-9a-f]{64}$`，完整性校验用 |
| `playOrigin` | 否 | `https://...` 或开发用 `http://<label>.localhost(:\d+)?`，覆盖推导地址 |
| `hostedUrl` | `hosted` 必填 | `https://<id>.<gamesBaseDomain>/`（或 playOrigin 推导） |
| `fallback` | 否 | `external`（默认）\| `hosted` \| `none`，virtual 运行失败时的降级链 |
| `features` | 否 | 见 §6.3，`additionalProperties: false`，缺省项用默认值 |
| `display` | 否 | `{ aspect?: "16:9" \| "4:3" \| "fill" }`，默认 `16:9` |

### 9.2 API 契约（后端实现不在本期）

| 端点 | 说明 |
|---|---|
| `GET /api/games` | 目录列表（未来替换静态 `index.json`，字段形状不变） |
| `GET /api/games/:id` | 详情（含 §9.1 字段） |
| `GET /api/games/:id/bundle?version=` | 返回 zip 字节；`Content-Type: application/zip`；支持 `ETag` / `If-None-Match` / `Content-Length` / `Range`；响应头 `X-Bundle-Sha256`；可选短时签名 URL |

- base URL：`VITE_API_BASE_URL`，默认 `/api`；本地 mock 用 `/data/bundles/<id>.zip`
- CORS：允许 `https://*.<gamesBaseDomain>`；`Authorization` 头允许；不使用 cookie
- 私有游戏：宿主把短时 token 放进 iframe URL 的 `#fragment`（不进 Referer/服务端日志），shell/Agent 取出后交给 SW 使用；公共游戏不需要 token
- 统一错误体：`{ error: { code, message } }`；`404` 表示游戏或版本不存在

## 10. 方案 A：SW 虚拟源

### 10.1 启动时序

1. 宿主创建 iframe → `https://<id>.<gamesBaseDomain>/__bootstrap#v=<version>&t=<token?>`
2. 该 host 的真实服务器只服务 `/__bootstrap`（bootstrap 页面）与 `/sw.js`，其余一律 404
3. shell 渲染加载动画，注册 `/sw.js`；`ready` 后把 `{version, token?, sha256}` 发给 SW（`registration.active.postMessage`）
4. SW 拉 bundle（Authorization + 版本）→ sha256 校验 → 解压校验（§10.4）→ 每个条目存为 `Response` 进 `caches.open('bundle-<version>')` → 版本指针写 IndexedDB → `clients.claim()`，过程中向 client `postMessage` 上报进度
5. shell 收到 `controllerchange` → `location.replace('/')`
6. SW 对 `/`：就绪版本存在 → 返回 `entry` 的 HTML（注入 Agent，§10.3）；否则 302 回 `/__bootstrap`
7. 之后该源下所有请求（含绝对路径 `/style.css`）都由 SW 按 §10.2 路由

### 10.2 SW 路由规则

| 请求 | 行为 |
|---|---|
| `/__bootstrap`、`/__bootstrap/*` | 直接放行走网络（永远不拦截，保证自救能力） |
| `/sw.js` | 直接放行走网络（SW 脚本请求本身不经过 SW，仍显式放行） |
| `/robots.txt` | 合成响应 `User-agent: *\nDisallow: /` |
| `/agent.js` | 从版本缓存取（离线可用，安装时作为合成条目写入） |
| `/`（导航） | 就绪版本 → `entry`；无版本 → 302 `/__bootstrap` |
| `/`（非导航，无版本） | 404 |
| 其他路径 | 归一化后查版本缓存：命中 → 响应（补 MIME/安全头/长度）；未命中 → 404，绝不回源 |

- 归一化：URL 解码 → 去掉 query/hash → 拒绝含 `..` 越出根 → 目录或空路径补 `entry` → 大小写敏感
- 额外支持：`HEAD`、`If-None-Match`（`ETag: "<version>:<path>"`）、`Range`（单区间 `206`，Safari 音视频 seek 必需）、`Accept-Ranges: bytes`
- worker 脚本请求与 `importScripts` 同样被拦截；极老浏览器中嵌套 worker 可能绕过 SW，列为已知限制

### 10.3 Agent 注入

- SW 在返回 HTML 时，把 `<script src="/agent.js?host=<encodeURIComponent(hostOrigin)>"></script>` 插到 `<head>` 之后（无 head 则插到文档最前），保证早于游戏任何脚本
- Agent 为经典脚本（IIFE，非 module），同步执行；同源脚本，符合严格 CSP（不需要 inline）
- `agent.js` 由构建产物固定命名，随版本缓存入库，离线可用

### 10.4 解包与校验（防压缩炸弹/路径攻击）

| 限制 | 值 |
|---|---|
| 单包大小 | ≤ 200 MiB |
| 解压后总量 | ≤ 500 MiB |
| 条目数 | ≤ 5000 |
| 单条目大小 | ≤ 100 MiB |
| 压缩比 | ≤ 200:1 |
| 路径 | 拒绝绝对路径、`..`、符号链接、非普通文件、加密条目；长度 ≤ 255 |
| 完整性 | 解压前校验 `X-Bundle-Sha256`/manifest `sha256` |

- 解压用 `fflate`（约 8KB，SW 内不可用 Node API）；解析 `zip` 中央目录逐个写入 Cache API
- 失败：标记该版本不可用，向 shell 报错；保留旧版本继续可玩

### 10.5 版本、更新与离线

- 版本键：`bundle-<version>`；保留最近 2 个版本（当前 + 上一版，便于回滚），其余删除
- 更新检查：宿主进入详情页时比较 API 的 `version` 与本地指针；不同 → 先预下载（`host:update-available`），用户同意或下次进入时切换
- SW 自身更新：脚本变更由浏览器触发新 SW 安装；**有游戏会话活跃时不 `skipWaiting`**，由宿主在空闲时通知
- 离线：安装完成的版本可离线进入与游玩；更新检查失败静默跳过

### 10.6 存储配额

- shell 调 `navigator.storage.persist()`（可能被忽略）与 `estimate()`，宿主可展示占用
- Cache API 可能被浏览器按压力回收；SW 发现版本条目缺失时标记失效，回到 bootstrap 重新下载（UI 显示"重新加载"）

## 11. 方案 C：后端静态托管

- 发布（后端 spec 内容，此处仅契约）：zip → 解包 → 对象存储（每游戏一个 prefix）→ 生成 manifest（content-type/大小/哈希）→ 更新 host→version 映射
- 服务：通配 ingress → 托管服务；Range/HEAD/压缩/缓存原生支持；HTML `no-cache`，其余资产按版本长缓存
- 版本：`?v=` 仅用于缓存穿透；回滚 = 后端把 host 指回旧版本（不做 `/v/<hash>/` 路径前缀，否则绝对路径必破）
- 安全头：§6.2 由服务端统一模板下发；CSP 按 `features` 生成（同一套生成器逻辑，服务端实现或构建期生成）
- Agent 注入：服务端在返回 HTML 时插入 `<script src="/agent.js?host=...">`（如 nginx `sub_filter`）并托管 `agent.js`
- 无 SW、无解包、无首载 reload；但没有离线、没有客户端侧版本回滚
- 游戏自带 SW 建议由 Agent 一并剥夺，保持与 A 一致的行为

## 12. 降级与共存

- 按游戏选择 `runtime`；`fallback` 定义 virtual 失败链：
  1. SW 不可用/安装失败/解压失败 → 尝试 `hosted`（若配置且可用）
  2. `hosted` 也失败或未配置 → `external`（新标签打开 `url`）
  3. `none` → 显示错误面板
- 降级对用户可见：提示"已切换为外部打开"或"站内运行不可用"
- 宿主 `GameHost` 状态机统一：`idle → booting → downloading → ready → running → paused → degraded → error`

## 13. 代码组织与构建

```
src/runtime/
├─ bridge/            # 协议类型、版本常量、消息校验（宿主/agent/shell 共用）
├─ agent/index.ts     # 注入脚本，构建为固定名 agent.js（IIFE，无 module）
├─ sw/
│  ├─ index.ts        # Service Worker 入口，构建为固定名 sw.js（IIFE）
│  ├─ router.ts       # 路径归一化与路由（纯函数，可单测）
│  ├─ mime.ts         # 扩展名 → Content-Type
│  ├─ unzip.ts        # 解包 + 安全校验
│  └─ csp.ts          # features → CSP 指令
├─ shell/
│  ├─ index.html      # bootstrap 页面（独立 HTML 入口）
│  └─ main.ts         # 注册 SW、进度 UI、握手、location.replace
└─ host/
   ├─ GameHost.vue    # 播放器组件（状态机、控制条、错误兜底）
   ├─ useGameFrame.ts # iframe 生命周期 + 桥客户端
   └─ adapters.ts     # virtual / hosted 适配器
```

构建（Vite 多入口，产物固定名，不受 hash 影响）：

| 产物 | 路径 | nginx 映射 |
|---|---|---|
| SPA | `dist/index.html` + `dist/assets/*` | 主站 |
| bootstrap | `dist/bootstrap/index.html` | `*.games.example.com/__bootstrap` |
| SW | `dist/sw.js` | `*.games.example.com/sw.js` |
| Agent | `dist/agent.js` | `*.games.example.com/agent.js` |

- 宿主集成：`GameView` 增加内嵌播放区（`display.aspect` 控制比例，默认 16:9）、控制条（全屏/重开/退出/存档状态）、`runtime=external` 时保持现有外链行为
- 构建脚本：runtime 产物用独立 Vite 配置（IIFE、无 code-splitting）由 `prebuild` 串联，确保 `sw.js`/`agent.js` 路径稳定

## 14. 部署变更

- DNS：`*.games.example.com` → 现有边缘/ingress（通配解析已具备）
- 证书：acme.sh + `dns_ali`（阿里云 AK/SK）签 `*.games.example.com`，cron 自动续期，证书热加载；或 cert-manager + alidns webhook
- k8s ingress：新增通配 host 规则指向同一 service；TLS 用通配证书 secret
- nginx：新增 `server_name *.games.example.com` 的 server block，仅服务 `/__bootstrap`、`/sw.js`、`/agent.js`，其余 404（主站 server block 不变）
- 宿主站 CSP（若未来引入）：`frame-src https://*.games.example.com`
- CI：`validate.yml` 增加 Playwright e2e 任务（安装浏览器依赖）

## 15. 本地开发与测试

### 15.1 本地 mock（不依赖后端）

- `src/fixtures/games/<id>/`：小型夹具游戏，随仓库提交，仅测试用（不进入目录数据）
- `scripts/build-fixtures.mjs`：打包夹具为 `public/data/bundles/<id>.zip` 并计算 sha256/version，生成 mock 详情 JSON
- 开发与 e2e 均用 `*.localhost`：`localhost` 是安全上下文，`*.localhost` 在主流系统解析到回环，无需证书与 DNS 配置

### 15.2 单测（Vitest）

- `router.ts` 路径归一化与安全（`..`、编码、绝对路径、query/hash、目录、大小写）
- `unzip.ts` 各项限制（穿越、炸弹、条目数、符号链接）
- `mime.ts` 扩展名映射与兜底
- `csp.ts` features → 指令生成（默认安全优先）
- `bridge` 消息校验、版本不匹配
- schema v2 校验（Ajv，含新字段与条件必填）

### 15.3 e2e（Playwright，新增）

夹具覆盖：

| 夹具 | 断言 |
|---|---|
| `abs-paths` | 绝对路径 `/js/game.js`、`/style.css` 正常加载 |
| `rel-paths` | 相对路径、`../`、query 正常 |
| `worker` | `new Worker` + `importScripts` 正常；嵌套 worker 记录兼容性 |
| `storage-a` / `storage-b` | 两游戏 localStorage 互不可见、各自持久 |
| `exfil` | `fetch('https://example.com')`、外链图片被 CSP 拦 |
| `nested-sw` | 游戏调 `serviceWorker.register` 被拒且不影响运行时 SW |
| `crash` | 抛错 → 宿主错误面板与重试 |
| `media-range` | 音频 seek 触发 206 |
| `corrupt` | 篡改 zip → 校验失败 → 降级链生效 |

### 15.4 CI

- `validate.yml`：`npm run check`（新增单测）+ e2e 任务
- 本地验收同样跑 `npm run check` + e2e

## 16. 错误处理汇总

| 场景 | 检测 | 表现 |
|---|---|---|
| SW 不支持/注册失败 | shell try/catch + 超时 | 降级链（§12） |
| bundle 下载失败 | fetch 非 2xx/网络错误 | shell 错误页 + 重试（指数退避） |
| sha256 不符/解压失败 | SW 校验 | 标记版本失效，保留旧版，提示重新加载 |
| Cache 被回收 | SW 查表未命中且元数据存在 | 标记失效，回 bootstrap 重下 |
| 游戏崩溃 | Agent `error`/`unhandledrejection` | `game:error` → 宿主错误面板 |
| 游戏无响应（死循环） | 无可靠检测 | 浏览器级无响应对话框；文档明确为限制 |
| 桥握手超时 | 10s 无 ack | 判失败，降级/重试 |
| 存档超限 | Agent snapshot 超上限 | 拒绝并报错，不影响游戏本身 |

## 17. 验收标准

- [ ] schema v2 校验通过：`runtime=virtual` 缺 `version`/`bundle` 报错，`features` 未知键报错，`id` 非 DNS label 报错
- [ ] `runtime=external` 的游戏行为与现状完全一致
- [ ] A 模式夹具游戏站内可玩：绝对路径、相对路径、worker、音频 seek 全部正常
- [ ] 两游戏 localStorage/IndexedDB 互相隔离且刷新后持久
- [ ] CSP 拦截夹具游戏的外联请求；`features.eval=false` 时 `eval` 抛错，置 true 后可用
- [ ] 游戏调 `serviceWorker.register` 被拒，运行时 SW 不受影响
- [ ] 篡改 bundle 触发校验失败，按 `fallback` 正确降级
- [ ] 离线（断网刷新）已安装的游戏仍可玩；未安装的给出可理解错误
- [ ] 桥握手、`game:ready`/`game:error`/`game:score` 在夹具中均有 e2e 覆盖
- [ ] `npm run check` 与 Playwright 全绿；CI 在 PR 上执行
- [ ] 生产镜像包含 bootstrap/sw/agent 固定路径产物，nginx 通配 server block 只暴露这三个路径

## 18. 风险与已知限制

| 风险 | 说明 | 缓解 |
|---|---|---|
| sandbox 内注册 SW | 极少数浏览器可能在 sandbox iframe 中拒绝 SW | 已按 allow-same-origin 设计；若实测被拒，退化为"先无 sandbox 注册成功后由宿主加上 sandbox 并重载"两段式；e2e 覆盖 |
| 首载有 reload | SW 接管后需重载一次才进游戏 | bootstrap 阶段预下载 + 进度 UI；C 模式无此问题 |
| CPU 死循环 | sandbox 不影响 CPU | 文档明确；必要时后续加"长时间未 ready 提示" |
| autoplay 手势 | 宿主点击不传递 user activation 到游戏文档 | 游戏内首次点击恢复音频（行业惯例）；`allow=autoplay` 已给 |
| Safari 存储清理 | ITP 可能清理长期不访问的 localStorage | 云同步是最终解；本地 `persist()` 尝试申请 |
| 嵌套 worker | 旧浏览器可能绕过 SW 拦截 | 已知限制记录；现代浏览器正常 |
| 游戏自毁自身缓存/注册 | 同源游戏可操作自己的 Cache/SW | 自伤，不在威胁模型；Agent 已剥夺注册 API 降低误伤 |
| 游戏 id 变更 | 换源导致存档丢失 | 发布后不可变，写入 schema 与上架流程约束 |
| 同注册域 cookie 投毒 | 游戏可写父域 cookie | 宿主不用 cookie（硬约束）；必要时迁独立注册域 |

## 19. 需要一次性配置的项

1. 阿里云 DNS AK/SK（acme.sh `dns_ali` 用），以及 `*.games.example.com` 通配解析
2. 通配证书的存放/热加载位置（边缘 nginx 或 k8s secret）
3. k8s ingress 通配 host 规则
4. `VITE_GAMES_BASE_DOMAIN`、`VITE_API_BASE_URL` 的构建/运行时配置
5. CI 中 Playwright 浏览器缓存策略

## 20. 后续 spec（不在本期）

1. 后端：上传/存储/审核/发布/签名 URL/bundle 分发实现（落实 §9.2 契约）
2. 上架静态扫描器：自动建议 `features` 标志位、计算 version/sha256、检测体积超限
3. 云存档同步：`CloudSaveProvider` + 后端接口（复用 §8 预留时序）
4. 游戏元数据扩展：评分/成就（基于 `game:score` 桥事件）
