# 内容管线前端接入（双源数据层 / 提交页 / 管理页）设计文档

2026-09-27 · 状态：待评审 · 关联：后端 spec `crearte-server` → `docs/superpowers/specs/2026-09-26-content-pipeline-design.md`（§8 前端改造为本 spec 上游）；本仓 `2026-09-27-sw-bundle-decryption-design.md`（计划 A，分支 `feat/sw-bundle-decryption`，合并前该文件不在 master）、`2026-09-19-frontend-auth-integration-design.md`、`2026-09-17-game-runtime-design.md`

## 1. 背景与目标

后端内容管线（Phase ①②）已完成并推送（crearte-server 分支 `feat/content-pipeline`）：公开读 API（`GET /api/games`、`GET /api/games/:id`，ETag 条件请求）、登录上传（`POST /api/uploads`，bundle 服务端加密）、提交生命周期（`/api/submissions*`，draft→pending→approved/rejected）、管理审核（`/api/admin/*`：队列/通过/拒绝/下架/恢复/版本 revoke-恢复）。前端目前完全未接入：目录数据仍只来自构建期静态 JSON（`src/games/*.json` → `/data/*.json`），提交作品靠给仓库提 PR。

目标：

- **数据层双源合并**：静态 JSON（PR 贡献通道）与后端 API（审核发布通道）在**同一次部署中同时生效**，目录取并集，同 id 时 API 胜出，作品带 `source` 标注
- **`/submit` 提交页**：登录用户走完整提交生命周期——新建（三种 kind）、存草稿、上传 bundle/封面（带进度）、提交审核、撤回、rejected 重提
- **`/admin` 管理页**：admin 角色审核队列 + 审核详情（通过/拒绝必填意见）+ 作品管理（下架/恢复上架、版本 revoke/恢复）
- **e2e 分层**：mock 层覆盖交互流；真栈 smoke 覆盖「注册→提权→上传→提交→过审→目录可见→可玩→revoke→降级」全链路（可玩环节依赖计划 A 解密链，**执行顺序 A→B**）

## 2. 非目标（本期不做）

- **静态源收尾/删除**：已裁决**永久取消**——静态 JSON 通道长期保留，与 API 通道并行（上游 spec §8.6 作废，见 §3.2）
- 审核前试玩 bundle 作品：密文在审批通过前位于 `pending/` 私有前缀且密钥未签发，**技术上不可行**；详情页只展示元数据+封面+外链
- 版本清单端点消费：后端无「列出某作品全部版本」API，作品管理的版本操作仅覆盖 当前版本（来自 `/api/games/:id`）与 approved 提交历史中出现的版本（后续可补后端端点）
- 私信/通知（审核结果靠列表页状态与 review_note 呈现）、提交历史 diff 视图、批量审核
- 云存档、评分、评论等互动功能（子项目 2 范围）
- docs 内容 API 化：`listDocs/getDoc` 继续走静态 `/data/docs.json`（上游 spec §8.1 已定）

## 3. 设计决策摘要

| 决策 | 结论 | 原因 |
|---|---|---|
| 双源语义 | 单次部署两源同时生效：并集合并、同 id API 胜出、`source` 字段标注 | 用户裁决「静态源长期保留，和后端下发并行」 |
| 开关 | **不新增 env**：`VITE_API_BASE_URL` 为空 → 纯静态（noauth 模式）；非空 → 双源合并 | 复用既有「空基址=无后端」语义，零新配置 |
| 下架复活防护 | 运营约定：静态作品被 import 进后端后**从 `src/games/` 删除**；存量 4 作品本期删除 | 否则后端下架后静态副本会在目录复活 |
| API 故障降级 | `listGames` API 失败 → console.warn + 纯静态结果（目录可用优先）；`getGame` API 5xx/网络错 → **抛错**（错误态+重试），仅 404 回落静态 | 列表降级安全（import 后删静态保证不复活）；详情静默降级会把故障伪装成 NotFound |
| 上传进度 | `XMLHttpRequest`（fetch 不支持上传进度事件） | 100MB bundle 必须有真实进度 |
| 提交表单形态 | 列表为主：`/submit`（我的提交）+ `/submit/new`、`/submit/:id`（分区表单视图） | 状态追踪与 rejected 重提体验优先 |
| 管理页结构 | `/admin` 两 tab（审核队列/作品管理）+ 详情独立路由 `/admin/submissions/:id` | URL 可分享可回退，信息层次清晰 |
| republish 入口 | 已下架作品不在公开列表 → 从 `GET /api/admin/submissions?status=approved` 历史进 | 后端无 admin works 列表端点，approved 提交历史是唯一可见来源 |

### 3.1 提交 kind 三态（后端 `checkSubmissionRules` 冻结）

| kind | 前提 | bundle | 表单行为 |
|---|---|---|---|
| `new_work` | work_id **未被占用**（占用 → 409 conflict） | virtual 必填，external 禁止 | 全量表单 |
| `new_version` | work_id 存在且为 virtual 作品；version 匹配 `^[a-z0-9][a-z0-9._-]{0,63}$` 且未存在 | 必填 | 选定 work_id 后 `GET /api/games/:id` **预填**现有元数据，改 version + 传新包 |
| `metadata_change` | work_id 存在 | **禁止**（带 bundle_upload_id → 400） | 同 new_version 预填，只改元数据；封面可选 |

三种 kind 的 payload 均为完整作品元数据（服务端逐字段校验，`payload.id` 必须等于 `work_id`）。

### 3.2 对上游 spec §8 的勘误

1. **§8.1 双源开关作废**：`VITE_CONTENT_SOURCE=api|static` 不实现；改为「无开关、并集合并」（§3）。`ApiContentRepository` 不单独装配，由 `MergeContentRepository` 组合
2. **§8.6 收尾永久取消**：不删 `games/*.json` 通道、不删静态数据层；仅删**已 import 的存量 4 作品文件**（运营约定的一次性执行）
3. **§8.3 保持原文**（版本 revoke/恢复）：后端 `RevokeRequest{revoked:bool}` 已支持双向，管理页做 revoke/恢复开关（设计过程中曾误判为单向，已核实撤销）
4. **§8.5 e2e 细化**：真栈全链路保留为 smoke 层（可 skip），另加 mock 层承载交互流覆盖（§9）

## 4. 数据层：双源合并

### 4.1 模块与装配

- `src/app/data/apiRepo.ts` 新增 `ApiContentRepository implements ContentRepository`：
  - `listGames()` → `GET {apiBase}/api/games`；`getGame(id)` → `GET {apiBase}/api/games/{id}`
  - ETag 条件请求：模块内 `Map<url, {etag, body}>` 缓存，命中带 `If-None-Match`，304 复用缓存 body；`Cache-Control: no-store` 响应不缓存 etag（沿用 staticRepo 模式）
  - promise 缓存：并发同 URL 请求去重（in-flight promise 复用，结算后清除）
  - 401 不可能（公开端点）；网络错误/5xx 抛错，404 抛 `NotFoundError`
  - `listDocs()/getDoc()` 委托构造入参传入的静态实例
- `src/app/data/mergeRepo.ts` 新增 `MergeContentRepository implements ContentRepository`：
  - `listGames()`：`Promise.allSettled([api.listGames(), static.listGames()])` → API 成功则并集（`Map` by id，API 项覆盖静态项），API 失败则 `console.warn('[data] API 目录不可用，降级静态源', reason)` 返回纯静态；两侧都失败抛 API 侧错误。合并时给每项打 `source: 'api' | 'static'`
  - `getGame(id)`：先 `api.getGame(id)`；捕获 `NotFoundError` → `static.getGame(id)`（仍 404 则抛 NotFoundError）；**其他错误（网络/5xx）直接上抛**。成功结果打 `source`
  - `listDocs/getDoc` 直通静态
- `src/app/data/index.ts` 单例：`VITE_API_BASE_URL` 为空 → `StaticContentRepository`（现行为）；非空 → `new MergeContentRepository(new ApiContentRepository(apiBase), staticRepo)`
- 类型：`GameSummary` 增加 `source?: 'api' | 'static'`（前端合并标注，两仓储自身返回值不含；noauth 纯静态模式为 undefined，UI 不渲染徽标）

### 4.2 UI 标注

目录卡片（`GameCard.vue`）对 `source === 'static'` 显示小徽标「社区投稿」（平面海报风格 token，位置随现有 tag 行）；API 源不显示。作品详情页不显示。

### 4.3 存量清理

删除 `src/games/2048.json`、`a-dark-room.json`、`arclight-nightcast.json`、`case-files.json`（与后端已 import 数据一致，后端为唯一真源）。`build-data.mjs`、schema、`validate:data`、贡献文档流程全部保留（未来 PR 贡献 → 静态源展示 → 运营 import 后删文件）。README 贡献章节补一段「入库后删除静态文件」的运营约定。

## 5. 路由与守卫

新增路由（`src/app/router/index.ts`）：

| 路径 | 视图 | meta |
|---|---|---|
| `/submit` | `SubmitListView` | `requiresAuth` |
| `/submit/new` | `SubmitFormView` | `requiresAuth` |
| `/submit/:id` | `SubmitFormView`（编辑/查看模式） | `requiresAuth` |
| `/admin` | `AdminView`（两 tab） | `requiresAuth, requiresAdmin` |
| `/admin/submissions/:id` | `AdminSubmissionView` | `requiresAuth, requiresAdmin` |

`guards.ts` `resolveNavigation`：`requiresAdmin` 且 `session.user.role !== 'admin'` → 重定向 `/`（与 requiresAuth 同风格；角色来自既有 session）。未启用账号（apiBase 空）时 `/submit*`、`/admin*` 一律重定向 `/`。

Header（`AppHeader.vue`）：登录态显示「提交作品」（→ `/submit`）；`role === 'admin'` 追加「审核」（→ `/admin`）。

## 6. API 客户端与 /submit 提交页

### 6.1 content 客户端 `src/app/content/client.ts`

与 `auth/client.ts` 同构（fetch 包装、Bearer 注入、401 hook 触发会话失效、`Retry-After` 解析、错误体 `{error:{code,message}}` 解析为 `ContentApiError{status, code, message}`）。覆盖端点：

- `POST /api/uploads`（**XHR 实现**，multipart：`kind`、`work_id`、`version`（bundle 时）、`file`；`onUploadProgress` 回调；kind=bundle 限 zip ≤ `BUNDLE_MAX_BYTES`（前端按 100MB 预检）、kind=cover 限 png/jpeg/webp（MIME+扩展名预检））
- `POST /api/submissions`（CreateSubmissionRequest）、`GET /api/submissions/mine`、`GET/PUT/DELETE /api/submissions/:id`
- `GET /api/admin/submissions?status=&limit=&offset=`（响应 `{submissions, total}`）、`POST /api/admin/submissions/:id/approve|reject`（reject body `{note}` 必填）、`POST /api/admin/works/:id/unpublish|republish`（body `{}`）、`POST /api/admin/works/:id/versions/:version/revoke`（body `{revoked:bool}`）
- 上传响应 `{upload_id, sha256, bytes, kid?}`；提交视图 `SubmissionView {id, kind, status, work_id, payload, bundle_upload_id?, cover_upload_id?, review_note?, created_at, updated_at}`

### 6.2 `/submit` 列表视图

`GET /api/submissions/mine` → 卡片列表（倒序 updated_at）：名称（payload.name，缺失显示 work_id）、kind 徽标（新作品/新版本/元数据）、状态 chip（草稿/待审中/已通过/已拒绝，配色沿用平面海报 token）、`review_note`（rejected 时突出显示）、更新时间。操作按钮按状态机映射：

| 状态 | 操作 |
|---|---|
| draft | 编辑（→ `/submit/:id`）、提交（PUT `submit:true`）、删除（DELETE，确认） |
| pending | 撤回（DELETE，确认文案说明暂存文件将被清理） |
| approved | 无（展示「已发布」+ 指向 `/games/:work_id` 链接） |
| rejected | 编辑并重提（→ `/submit/:id`）、删除 |

空态：插画位 +「提交第一个作品」按钮（→ `/submit/new`）。

### 6.3 `/submit/new` 与 `/submit/:id` 表单视图

分区单页表单（沿用 auth 页表单模式与 `validation.ts` 风格的前端校验；后端为最终权威）：

1. **提交类型**（仅 new 时选择；编辑时只读显示）：新作品 / 新版本 / 元数据更新
2. **基本信息**：work_id（slug，new_work 时从名称自动生成可改，其余 kind 为已有作品 id；**编辑已存在提交时只读**——kid AAD 绑定 work_id/version）、名称、作品上游 url、作者 name/url、描述、时长 min/max、类型下拉（GAME_TYPES）、标签（逗号分隔）、intro（textarea）
3. **运行方式**（payload.runtime）：external（仅上游 url）/ virtual（version 输入 + entry，默认 index.html + **bundle 上传区**：XHR 进度条、已传状态（bytes/sha256 摘要展示）、重传替换）——new_version/metadata_change 选定 work_id 后 `GET /api/games/:id` 预填元数据（apiRepo 直连，不走 merge）
4. **封面**（可选）：png/jpeg/webp 上传（同 XHR 进度），已传缩略预览
5. **预览确认区**：渲染 payload 摘要卡片；底部「存草稿」（submit:false）/「提交审核」（submit:true，确认对话框）

编辑模式：`GET /api/submissions/:id` 回填（payload 展开进表单；bundle_upload_id/cover_upload_id 保留显示「已关联上传」，重传则替换 id）；rejected 提交编辑后「提交审核」即重提。**仅 draft/rejected 可编辑**（后端状态机约束 `Update` 只接受这两态）；pending/approved 的提交表单视图为只读展示，无保存入口。

上传时序约束（后端冻结）：bundle 上传必须先有 work_id+version（AAD 绑定）——表单顺序保证先填 id/version 再启用文件选择器；改 work_id/version 后已传 bundle 失效（前端清空 upload_id 并提示重传）。

## 7. /admin 管理页

### 7.1 Tab 1：审核队列

`GET /api/admin/submissions?status=pending&limit=20&offset` → 分页表（total 驱动页码）：work_id、名称（payload.name）、提交者（payload 不含提交者昵称时显示 submission.id 前 8 位——SubmissionView 无 owner 字段，**本期展示 id**，后端补充 owner 信息为后续项）、kind、bundle bytes（有 bundle_upload_id 时）、updated_at、操作「审核」→ `/admin/submissions/:id`。status 筛选下拉（pending 默认，可选 approved/rejected 查历史）。

### 7.2 审核详情 `/admin/submissions/:id`

`GET /api/submissions/:id`（admin 可看任意提交，后端已支持）→ payload 全量定义列表（含 intro 渲染预览）、封面（有 cover_upload_id 时——封面预览 URL 本期不可得（pending 对象非公开），显示「审批通过后可见」占位）、bundle 元信息（upload_id/sha256 摘要）、external 作品显示上游 url 跳转。操作栏（仅 pending 状态显示）：

- **通过**：确认对话框（文案说明发布投影：对象转正、目录可见、密钥签发，不可静默撤销但可下架）→ `POST .../approve`
- **拒绝**：对话框内 note textarea **必填**（前端校验非空）→ `POST .../reject`
- 成功后回队列列表并刷新

### 7.3 Tab 2：作品管理

- **已发布**：`GET /api/games`（apiRepo 直连）列表：id、名称、runtime、当前 version（virtual）、操作：
  - 下架（`POST .../unpublish` body `{}`，确认对话框）
  - virtual 作品当前版本：revoke（`POST .../versions/:v/revoke` body `{revoked:true}`，强确认：玩家立即 410 降级）/ 恢复（`{revoked:false}`）
- **历史（approved 提交）**：`GET /api/admin/submissions?status=approved&limit=20&offset` 分页表：work_id、payload.name、payload.version、时间、操作：
  - republish（已下架作品的恢复上架入口，`POST .../republish` body `{}`）
  - 该版本的 revoke/恢复（同上端点，覆盖历史版本——补「无版本清单端点」的缺口）

## 8. 错误处理

`ContentApiError{status, code, message}` → UI 文案映射（`src/app/content/errors.ts`，与 auth/errors.ts 同模式）：

| code（status） | 文案方向 |
|---|---|
| `invalid_request`（400） | message 为字段级详情（`work_id: ...; version: ...`），按字段拆分显示到对应表单项 |
| `conflict`（409） | 「作品 id 已被占用 / 版本号已存在 / 状态冲突，请刷新后重试」 |
| `not_found`（404） | 「提交或作品不存在，可能已被删除」 |
| `payload_too_large`（413） | 「文件超过上限（bundle 100MB / 封面 5MB）」 |
| `unsupported_media_type`（415） | 「文件类型不支持（bundle 需 zip；封面需 png/jpeg/webp）」 |
| `rate_limited`（429） | 「操作过于频繁」+ `Retry-After` 秒数倒计时后自动恢复按钮 |
| `unauthorized`（401） | 会话失效 → 复用 auth 401 hook（清会话跳登录，带 redirect 回跳） |
| `forbidden`（403） | 「需要管理员权限」 |
| `revoked`（410） | 仅 bundle-key 场景（计划 A 消费），本页不出现 |
| `internal`（500） | 「服务暂时不可用，请稍后重试」 |

所有写操作按钮防重复提交（in-flight 禁用）。上传失败可重试（重新选择文件或重试按钮）。

## 9. e2e 分层

### 9.1 mock 层（现有 playwright 主配置，page.route 模式沿用 auth.spec）

- `submit-flow.spec.ts`：登录（mock auth）→ /submit/new 选 new_work → 填表 → bundle 上传（route mock `/api/uploads` 返回 upload_id）→ 存草稿 → 列表出现 draft → 提交 → pending → 撤回 → 消失；rejected 分支：mock mine 返回 rejected+note → 编辑重提
- `admin-flow.spec.ts`：admin 登录 → 队列（mock pending 2 条）→ 详情 → 拒绝（note 空被前端拦、填 note 成功）→ 通过（approve 调用断言）→ 作品管理 tab：下架/revoke/恢复/republish 调用断言
- `merge-repo.spec.ts`：mock `/api/games` 与静态 `/data/index.json` 并集（同 id API 胜出、source 标注、static 徽标渲染）；API 500 → 目录仍出静态列表；`getGame` API 404 → 回落静态详情；API 5xx → 错误态

### 9.2 真栈 smoke（独立 `playwright.stack.config.ts`，端口 4175）

- `scripts/e2e-stack.sh`：检测 docker + 兄弟仓 `../crearte-server` → 起 postgres（复用 crearte-deploy db-debug 或独立容器）+ `pgsty/minio`（建桶+匿名 download+CORS）→ 后端 `go build` + serve（临时 KEK/token secret，`PORT=8091`）→ 前端 `build:e2e:stack`（新脚本：`VITE_API_BASE_URL=http://localhost:8091`）+ serve-runtime 4175 → 就绪探测；trap 清理
- `full-loop.spec.ts`：注册 → `go run ./cmd user set-role` 提权（脚本内预置）→ 登录 → /submit/new 全表单 + fixture bundle 上传（真实加密）→ 提交 → /admin 审核通过 → 目录页出现（source=api）→ 打开作品**可玩**（SW 解密链，依赖计划 A）→ admin revoke 该版本 → 全新上下文重进：安装失败（bundle-key 410）走降级链，不再可玩
- **skip 守卫**：无 docker / 无兄弟仓 / 栈启动失败 → `test.skip`（console 提示），不 fail 不阻塞
- noauth 套件（4174）不受影响：apiBase 空 → 纯静态路径，merge 代码不激活

## 10. 部署与跨仓前置

- 前端无新增 env（`VITE_API_BASE_URL` 既有）；生产 API 同源反代拓扑不变
- 后端侧前置（记 crearte-deploy/运维文档，不阻塞本期开发）：`PUBLIC_BASE_URL` 必须浏览器可达（bundle/封面公开 URL 的基址）；S3 桶 CORS 允许游戏子域 GET/HEAD（与计划 A §9 同一条目）
- 执行顺序：**计划 A（解密链）先行合并**，本计划真栈 smoke 的「可玩」断言依赖之；mock 层不依赖 A

## 11. 边界与风险

- **两源内容漂移**：并集语义下同一作品只应存在于一个源（import 后删静态的运营约定）；若违反约定，同 id API 胜出保证目录唯一，但静态副本会在 API 故障降级窗口短暂出现旧数据——可接受（降级窗口短、内容仅可能陈旧不会越权）
- **payload 与服务端校验双实现**：TS 前端校验是体验层，后端 `checkSubmissionRules`/schema 复刻是权威；两侧规则漂移时以后端 400 字段详情为准展示（§8 invalid_request 行）
- **上传大文件**：100MB XHR 上传中断无断点续传（后端单请求语义）——失败即重传，UI 明示；限流 10/min 防滥用
- **admin 历史分页规模**：approved 提交随时间增长，20/页分页可用；无全量导出需求（YAGNI）
- **SubmissionView 无提交者信息**：队列显示 submission id 前缀，运营体验妥协项，后端补 owner 字段为后续项（记录，不阻塞）

## 12. 实施顺序建议（供 writing-plans 参考）

1. `apiRepo.ts` + ETag/promise 缓存 + 单测
2. `mergeRepo.ts`（并集/source/降级/回落）+ 单测；`data/index.ts` 装配；`GameSummary.source` 类型 + GameCard 徽标
3. 存量 4 静态 JSON 删除 + build-data/e2e 静态夹具回归
4. `content/client.ts`（fetch 包装 + XHR 上传）+ `errors.ts` 映射 + 单测
5. 路由/守卫/Header 入口（requiresAdmin）+ 单测
6. `/submit` 列表视图 + 状态机操作
7. `/submit/new`、`/submit/:id` 表单视图（校验、三 kind、预填、上传区、草稿/提交）
8. `/admin` 两 tab + `/admin/submissions/:id` 详情与审核操作
9. mock 层 e2e 三 spec
10. 真栈 smoke（e2e-stack.sh + playwright.stack.config.ts + full-loop.spec）
11. 文档（CHANGELOG、README 贡献约定补「import 后删静态」、部署注记）+ 终验门禁
