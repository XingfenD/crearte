# 前端账号系统接入（注册 / 登录）设计文档

2026-09-19 · 状态：待评审 · 关联：后端 spec `crearte-server` → `docs/superpowers/specs/2026-09-19-auth-jwt-design.md`；本仓 `2026-09-17-game-runtime-design.md`、`2026-09-17-webgame-collection-design.md`

## 1. 背景与目标

后端已完成账号系统（无状态 JWT：注册 / 登录 / 当前用户 / 改密 / 登出全部设备），契约冻结在 `crearte-server` 的 auth spec §7。本仓目前是纯静态站点：内容走 `ContentRepository`（`/data/*.json`），没有任何 API 客户端、凭证管理或账号界面。

目标：

- 接上后端五个 auth 接口，形成**完整账号闭环**：注册 → 登录 → 查看身份 → 改密 → 登出全部
- 会话凭证前端自管（`Authorization: Bearer` ***，适配后端的 `token_version` 语义：改密 / 改角色后旧 token **立即失效**，前端必须能优雅降级
- 界面落点独立：`/login`、`/register`、`/account` 三个路由页 + header 三态入口
- 与既有内容层解耦：`ContentRepository` 不动，auth 独立成模块，后续"上传 / 审核 / 私有游戏 token"复用同一套凭证与 401 语义

## 2. 非目标（本期不做）

- 上传、审核、私有游戏可见性、管理员后台（后端下一个 milestone）
- 游戏运行时的私有游戏短时 token、bundle-key 取密钥链路（另开 spec，见 game-runtime spec §9.2）
- 目录数据改由后端 API 提供（目录仍走静态 `/data`）
- 邮箱验证、找回密码、验证码、2FA、会话列表 / 单设备强制下线
- 云存档、评分、评论等任何带后端依赖的玩法
- 页面视觉改版：本次只加 auth 页面与 header 三态，沿用现有平面海报令牌

## 3. 设计决策摘要

| 决策 | 结论 | 原因 |
|---|---|---|
| 凭证形态 | 无 cookie，`Authorization: Bearer <jwt>` | 遵守 game-runtime spec §5.3 硬约束（子域游戏可向父域投毒 cookie），后端契约也是无 cookie |
| 本地存储 | `localStorage` + 自存 `expiresAt`（记忆期对齐后端 TTL） | 要"记住一段时间"；`localStorage` 无内建过期，必须自己校验；cookie 路线被约束排除 |
| 启动恢复 | 缓存 `user` 乐观渲染 + 后台 `GET /me` 复核 | 后端改密 / 改角色会 +1 `token_version`，本地时间没过期也可能已失效，必须复核 |
| 401 语义 | client 层统一捕获 → 幂等清态 → 通知路由 | 避免每个视图各写一遍；并发 401 只清一次 |
| 界面落点 | 独立路由页 `/login`、`/register`、`/account` | 可直链、刷新安全、回跳逻辑简单，与现有 `views/*.vue` 模式一致 |
| 浏览门禁 | 不引入任何门禁 | 本期登录只影响 header 与 `/account`，目录 / 文档 / 游戏页体验不变 |
| API 走法 | 跨域子域直连（`https://api.crearte.yoresee.cc`） | xf 定：前端 `crearte.yoresee.cc` 直连 API 子域，不走同域反代 |
| 后端 CORS | 新增 `CORS_ALLOWED_ORIGINS` 精确白名单，叠加现有规则 | host 域不在 games 域下，必须显式放行；精确列表比"放宽到 `yoresee.cc`"安全 |
| 表单校验 | 本地同规则预校验 + 服务端错误为准 | 减少无谓请求，但不做邮箱存在性预判（避免给枚举提供便利） |
| 测试 | vitest 单测 + Playwright e2e（`page.route` 拦 API） | e2e 不依赖 PG 与真后端，快且稳；契约字段由 client 单测兜住 |

## 4. 总体架构与模块结构

```
src/app/
├── auth/
│   ├── client.ts        # 薄 fetch 客户端：拼 baseUrl、JSON、错误 → AuthApiError{status, code, message}、401 钩子
│   ├── session.ts       # 会话状态（reactive ref）+ 持久化 + login/register/logout/logoutAll/changePassword/restore
│   ├── storage.ts       # localStorage 读写与过期判定（注入 storage + now，纯函数便于单测）
│   ├── validation.ts    # email / password / display_name 本地校验（规则与后端一致）
│   ├── types.ts         # AuthUser / Session / AuthErrorCode
│   └── *.test.ts        # 与实现同目录的单测
├── views/
│   ├── LoginView.vue
│   ├── RegisterView.vue
│   └── AccountView.vue
├── router/index.ts      # + /login、/register、/account（/account 带需登录守卫）
└── components/AppHeader.vue   # 右侧改三态：未登录「登录」/ 已登录「昵称 ▾」下拉（我的账号、登出）
```

边界约束：

- `auth/` **不依赖** `data/`（`ContentRepository` 完全不动）；`views` 只依赖 `session` 暴露的状态与方法，不直接 `fetch`
- `client.ts` 不感知 Vue（无 ref / 无 router 依赖），只做 HTTP 与错误映射；401 通过回调通知，由 `session` 注入
- `storage.ts` 纯函数 + 注入 `StorageLike` 与 `now()`，便于覆盖过期 / 损坏 / 版本不符等分支

## 5. 会话与凭证

### 5.1 持久化格式

- key：`crearte.auth.session.v1`（带版本号，未来结构变更直接换 key，不做迁移）
- value：`{ "token": string, "expiresAt": string, "user": { id, email, display_name, role } }`

### 5.2 生命周期

| 场景 | 行为 |
|---|---|
| 应用启动 | 读 `localStorage`：解析失败 / 字段缺失 / key 版本不符 / `expiresAt <= now` → 清除并视为未登录 |
| 启动且未过期 | 先用缓存 `user` 乐观渲染 header，再异步 `GET /me` 复核 |
| 复核成功 | 用服务端返回的 `user` 覆盖缓存（昵称 / 角色可能已变） |
| 复核 401 | 清态 → 未登录（不弹错，静默降级） |
| 复核网络失败 | 保留乐观状态（离线可用），不误清；下次进入或操作时再试 |
| 登录 / 注册成功 | 写入 `token` + `expires_at` + `user` |
| 改密成功 | **用响应里的新 token 覆盖**（后端已 +1 `token_version`，不覆盖必然立刻 401），同时更新 `user` |
| 登出（单设备） | 仅清本地状态；后端无单设备端点，这是无状态系统的正确语义 |
| 登出全部设备 | 先调 `POST /api/auth/logout-all`，成功（204）后清本地；401 也清本地 |
| 任意请求 401 | `client` 钩子 → 幂等清态 → 通知路由守卫（并发 401 只清一次） |
| 任意请求 429 | 不清态，交给调用方展示倒计时 |

### 5.3 安全约束

- token 只出现在 `Authorization` 头；**绝不**进 URL、query、错误上报、console
- 不在 `localStorage` 存任何口令；改密表单值只留在组件内，提交后立即清空
- `expiresAt` 仅作为"省一次请求"的本地优化，**不作为可信依据**：服务端 401 一律以服务端为准
- 已知边界：同源脚本（含未来引入的第三方脚本）可读 `localStorage`，属 XSS 面；本期不引入第三方脚本，CSP 收紧留待后续

## 6. API 契约与错误映射

### 6.1 端点（与后端 auth spec §7 一一对应）

| 方法 | 路径 | 请求 | 成功 | 主要失败 |
|---|---|---|---|---|
| POST | `/api/auth/register` | `{email, password, display_name}` | `201` AuthResponse | 400 `invalid_request` / `invalid_email` / `weak_password` / `invalid_display_name`；409 `email_taken`；429；500 |
| POST | `/api/auth/login` | `{email, password}` | `200` AuthResponse | 400 `invalid_request`；401 `invalid_credentials`；429；500 |
| GET | `/api/auth/me` | Bearer | `200` `{user}` | 401 `unauthorized` |
| POST | `/api/auth/change-password` | Bearer + `{current_password, new_password}` | `200` AuthResponse（新 token） | 400 `invalid_request` / `weak_password`；401 `unauthorized` / `invalid_credentials`；500 |
| POST | `/api/auth/logout-all` | Bearer | `204` 无响应体 | 401 `unauthorized` |

- `AuthResponse = { token, expires_at(RFC3339), user: { id, email, display_name, role } }`
- 错误体统一 `{ error: { code, message } }`；auth 响应均 `Cache-Control: no-store`；401 带 `WWW-Authenticate: Bearer`
- 字段规则（前端本地校验与之一致）：email trim + lowercase、≤254、`^[^@\s]+@[^@\s]+\.[^@\s]+$`；password 10–128 字符（按 rune 计）；display_name trim 后 1–60 字符且不含控制字符

### 6.2 错误码 → 界面文案

| code | 文案 |
|---|---|
| `invalid_request` | 请求格式不正确，请重试 |
| `invalid_email` | 邮箱格式不正确 |
| `weak_password` | 密码需 10–128 个字符 |
| `invalid_display_name` | 昵称需 1–60 个字符，且不能含控制字符 |
| `email_taken` | 该邮箱已注册，可直接登录 |
| `invalid_credentials` | 邮箱或密码不正确 |
| `unauthorized` | 登录已过期，请重新登录 |
| `rate_limited` | 操作太频繁，请 N 秒后重试（读 `Retry-After`，缺省 60） |
| 其他 4xx/5xx | 服务暂时不可用，请稍后重试 |
| 网络异常 / 超时 | 网络连接失败，请检查网络后重试 |

- 表单先做本地同规则校验，但**展示一律以服务端返回为准**（本地只挡明显错误，不做邮箱存在性预判）
- 429 不做自动重试（后端为固定窗口限流）：按钮置灰 + 倒计时
- 未知 `code` 走兜底文案，不泄露服务端细节

## 7. 界面与交互

- `/login`：email + password；提交中禁用按钮与输入；成功跳 `next` query 指定路径，缺省首页；401 在表单内提示；底部「没有账号？注册」
- `/register`：email + 昵称 + 密码；成功即登录态（后端返回 token）并跳首页；409 提示已注册并给「去登录」链接；**不做**确认密码字段、不做密码强度条
- `/account`：展示 email / 昵称 / 角色（`user` → 普通用户、`admin` → 管理员）；改密表单（当前密码 + 新密码）；「登出全部设备」（二次确认 → 成功提示 → 跳登录页）；「登出」
- `/account` 守卫：未登录访问 → 重定向 `/login?next=/account`；登录后回跳
- `next` 只接受**站内相对路径**（以单个 `/` 开头、不以 `//` 开头，不含协议与主机），非法或缺失一律回首页 —— 防开放重定向
- header 三态：未登录显示「登录」；已登录显示「昵称 ▾」，下拉含「我的账号」「登出」；移动端下拉与现有响应式断点一致
- 加载与错误沿用现有 `StatePanel` 模式；视觉令牌沿用 `.lift` / `.btn-ink`（零渐变、全直角）
- 无障碍：`label for` 绑定、错误文案 `aria-live="polite"`、无效字段 `aria-invalid`、提交按钮有明确禁用态

## 8. 环境配置与部署前置

| 变量 | 用途 | 值 |
|---|---|---|
| `VITE_API_BASE_URL` | 后端 API 基地址 | 生产 `https://api.crearte.yoresee.cc`；dev `.env.development` 指 `http://localhost:8080` |
| `VITE_HOST_ORIGIN` | 宿主站 origin（运行时用） | `https://crearte.yoresee.cc` |
| `VITE_GAMES_BASE_DOMAIN` | 游戏子域基域 | `crearte-games.yoresee.cc` |

- 跨域直连依赖后端 CORS 白名单正确配置（见 §9）；后端预检已返回 `204` 且允许 `Authorization, Content-Type`，前端不需要自定义请求头
- **后端需 `Access-Control-Expose-Headers: Retry-After`**：429 的 `Retry-After` 属于需显式 expose 的响应头，后端未 expose 时前端跨域读不到，限流提示会退化为缺省 60 秒
- **生产构建需注入 `VITE_API_BASE_URL`**（`.env.development` 只管 dev；`build:e2e` 自带注入；生产走 `VITE_API_BASE_URL=https://api.crearte.yoresee.cc` 或部署侧注入，空值退化为同源 `/api`）
- 运维前置（不在本仓实现，仅记录）：`api.crearte.yoresee.cc` 的 DNS 与证书指向后端；后端环境变量 `CORS_ALLOWED_ORIGINS` 填宿主域
- dev 联调：后端本地跑在 `:8080`（`deploy/docker-compose.dev.yml` 起 PG），前端 `npm run dev` 直连

## 9. 后端配套改动（`crearte-server`）

- 现状：`internal/api/cors.go` 只放行 `GAMES_BASE_DOMAIN` 及其子域 + `http://*.localhost`，host 域（`crearte.yoresee.cc`）不在其中 → auth 请求会被 CORS 拦掉
- 改动：新增 `CORS_ALLOWED_ORIGINS`（逗号分隔，精确 origin 匹配，如 `https://crearte.yoresee.cc`），叠加在现有通配规则之上；`GAMES_BASE_DOMAIN` 通配保留（bundle-key 仍由游戏源跨域调用）
- 测试：白名单命中 / 未命中、预检仍 `204`、未配置时不放行
- 落点：直接加在已推送的 `feat/auth-jwt` 分支，单独一笔 commit

## 10. 测试策略与验收

### 10.1 单测（vitest）

- `storage.ts`：正常读写往返、过期清除、JSON 损坏、字段缺失、版本不符 key 不被读取
- `validation.ts`：email 边界（254 / 无 `@` / 空白）、password 边界（9 / 10 / 128 / 129、多字节 rune 计数）、display_name 边界（0 / 60 / 61、控制字符）、`next` 参数净化（`//evil.com`、`https://evil.com`、`/a/b` 放行）
- `client.ts`（mock fetch）：成功解析、错误码映射、未知 code 兜底、401 触发钩子、`Retry-After` 解析与缺省、网络异常
- `session.ts`：登录写入、restore 乐观 + 复核成功覆盖、复核 401 清态、复核网络失败保留、改密换 token、并发 401 只清一次、登出全部失败也清本地

### 10.2 e2e（Playwright，复用 `src/e2e/` 基建）

- 用 `page.route` 拦截 `/api/auth/*` 返回夹具，不依赖真后端与 PG
- 主流程：注册 → header 显示昵称 → 进 `/account` 改密（此后本地凭证被新 token 替换）→ 登出全部 → 回未登录态
- 错误路径：409 邮箱已注册（给去登录链接）、401 密码错误提示、429 倒计时与按钮置灰
- 守卫路径：未登录直开 `/account` → 跳 `/login?next=/account` → 登录后回跳

### 10.3 验收命令

- `npm run check`（vitest + `vue-tsc` + `vite build`）
- `npm run e2e`
- 手工冒烟（可选）：起真后端 + PG，走一遍注册 / 登录 / 改密 / 登出全部

## 11. 错误处理汇总

| 场景 | 表现 |
|---|---|
| 网络失败 / 超时 | 表单内提示「网络连接失败」，保留已填内容，可重试 |
| 401（会话失效） | 静默清态 → 若在 `/account` 则跳登录页；其他页面仅 header 变「登录」 |
| 429 | 提示 + 按钮倒计时（`Retry-After`），到期自动恢复可点 |
| 5xx | 提示「服务暂时不可用」，不清态 |
| 撞到后端校验 | 原样展示服务端 `message` 对应的文案表条目，聚焦到出错字段 |

## 12. 风险与已知限制

- `localStorage` 凭证可被同源脚本读取（XSS 面）；缓解：不引入第三方脚本，CSP 收紧后续做
- 无 refresh token：TTL（默认 168h）到期必须重新登录；本地 `expiresAt` 与后端一致，避免"看起来登录着实际全 401"
- 限流按 IP 固定窗口：同一出口 NAT 下多用户共享配额（login 10/分、register 5/时）
- 跨域直连强依赖后端 `CORS_ALLOWED_ORIGINS` 配置正确，否则表现为所有 auth 请求被浏览器拦截
- 注册接口 409 会暴露"邮箱已存在"（后端 spec 已接受的行业常规）
- 改密 / 提权导致旧 token 立刻失效，用户可能"突然被登出"——这是设计意图（即时生效），UI 用「登录已过期」文案解释

## 13. 后续（不在本期）

1. 上传 / 审核流程 UI 与 `RequireAdmin` 前端守卫
2. 私有游戏短时 token 接入运行时（game-runtime spec §9.2）
3. 目录数据改由后端提供（`ApiContentRepository` 替换 `StaticContentRepository`）
4. 云存档、CSP 收紧、第三方脚本审计
