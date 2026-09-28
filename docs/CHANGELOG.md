# Changelog / 更新日志

All notable changes to this template should be documented in this file.
本模板的重要变更建议统一记录在此文件中。

The format loosely follows Keep a Changelog and can be adapted to the team's habits.
本文档参考了 Keep a Changelog 的思路，也可以根据团队习惯调整。

## [0.11.1] - 2026-09-29

### Fixed / 修复

- Static-site works that navigate with forms now run: the embedded play frame's sandbox includes `allow-forms` (a `<form action="query.html" method="get">` search page no longer gets blocked), and the runtime CSP's `form-action` is relaxed from `'none'` to `'self'` so same-origin submissions go through while cross-origin form targets stay blocked. The sandbox already granted `allow-scripts`, so neither relaxation adds a new cross-origin send capability. Unit tests pin the full sandbox flag set and the `form-action` directive.
- 以表单导航的静态站作品现在可以运行了：内嵌游玩 iframe 的 sandbox 补上 `allow-forms`（`<form action="query.html" method="get">` 检索页不再被浏览器阻止），运行时 CSP 的 `form-action` 由 `'none'` 放宽为 `'self'`——放行同源提交、继续阻断跨域表单目标。sandbox 本就授予 `allow-scripts`（等价跨域发送能力已存在），两处放宽均不扩大威胁面。单测分别钉住完整 sandbox 旗标集合与 `form-action` 指令。

## [0.11.0] - 2026-09-28

### Added / 新增

- Registration now collects a 用户名 (`username`): required, validated client-side as 1–39 characters of lowercase letters/digits/hyphens with no leading or trailing hyphen, with separate copy for a malformed name and a taken one (`username_taken`); the account page shows it read-only marked 「不可修改」.
- 注册页新增「用户名」：必填，前端按 1–39 个字符的小写字母/数字/连字符（首尾非连字符）校验，格式不符与已被占用（`username_taken`）分别给文案；账户页只读展示并标注「不可修改」。

- Game links became two-segment `/games/{user}/{slug}` (route `/games/:user/:slug`): content types carry `user` / `slug` / `playSubdomain` alongside the composite id, `resolveUserSlug()` reads the pair from either the explicit fields or the id, and cards and detail views build their links with it.
- 作品链接改为两段式 `/games/{user}/{slug}`（路由 `/games/:user/:slug`）：内容层类型在复合 id 之外携带 `user`/`slug`/`playSubdomain`，`resolveUserSlug()` 可从显式字段或 id 拆出二者，卡片与详情页据此生成链接。

### Changed / 变更

- The submit form gained namespace semantics: the 名称 field is now a slug that only has to be unique inside your own namespace, its live hint shows the resulting `/games/<你的用户名>/<名称>` link, and payloads carry the composite `id` `<username>/<slug>` assembled from the signed-in session (slug cap 63 characters, bundle uploads and detail prefill resolve `<username>/<slug>`).
- 提交表单改为命名空间语义：「名称」只要求在自己的命名空间内唯一，字段下实时提示最终链接 `/games/<你的用户名>/<名称>`，提交载荷用登录会话拼成复合 `id` `<用户名>/<slug>`（slug 上限 63 字符，bundle 上传与详情预填均按 `<用户名>/<slug>` 解析）。

- Play origins are taken from the backend instead of derived from the work id: the host builds them from the issued `playSubdomain` hash label (`<label>.<base>`), `derivePlayOrigin` now accepts only 16 hex characters, and the bootstrap page's `location.hostname`-derived id fallback is removed — a missing `id` parameter fails startup outright.
- 游玩源址改由后端下发而非由作品 id 推导：宿主使用下发的 `playSubdomain` 哈希 label 拼出 `<label>.<base>`，`derivePlayOrigin` 仅接受 16 位十六进制，bootstrap 页基于 `location.hostname` 推导 id 的兜底已移除——缺 `id` 参数直接判定启动参数不完整。

- Schema, fixtures and e2e follow the composite ids: `game.schema.json` accepts `user/slug` ids (the owner prefix stays optional, so bare slugs still validate) with optional `user`/`slug`/`playSubdomain` fields, static fixture and generated-bundle file names map `/` to `__`, and the runtime fixture server plus e2e assertions read the issued `playSubdomain` instead of deriving subdomains from ids.
- schema、夹具与 e2e 跟进复合 id：`game.schema.json` 接受 `user/slug` 形态的 id（所有者前缀可选，纯 slug 仍可通过）并新增可选 `user`/`slug`/`playSubdomain` 字段；静态夹具与生成 bundle 的文件名把 `/` 映射为 `__`；运行时夹具服务与 e2e 断言改为读取下发的 `playSubdomain`，不再自行由 id 推导子域。

## [0.10.5] - 2026-09-28

### Changed / 变更

- BaseSelect is now a custom listbox instead of a native `<select>`: the closed trigger keeps the paper-ink frame with a self-drawn caret, and the opened option panel is now site-styled (ink border, hard shadow, highlighted selected row with a check mark) rather than the OS-rendered popup that could not be themed. Includes keyboard navigation (↑↓ / Enter / Esc), click-outside close, focus return, and `listbox`/`option` ARIA semantics. The API changed from slotted `<option>` elements to an `options` prop (matching BaseTabs), and both submit-form selects (提交类型 / 类型) are migrated with the disabled state passed explicitly.
- BaseSelect 由原生 `<select>` 改为自定义 listbox：收起态保持纸墨边框 + 自绘 caret，展开后的选项面板改为站点风格（墨色边框、硬阴影、选中项高亮带勾），不再是无法套用主题的操作系统原生弹层。支持键盘导航（↑↓ / Enter / Esc）、点击外部收起、焦点归还，以及 `listbox`/`option` 无障碍语义。API 由 `<option>` 插槽改为 `options` prop（与 BaseTabs 同构），提交表单的两个下拉（提交类型 / 类型）已迁移并显式传入 disabled 态。

## [0.10.4] - 2026-09-28

### Changed / 变更

- Reworked the submission form's identity fields for plain-language clarity: the technical 「作品 id（slug，收录后不可改）」 is now labeled 「名称（小写字母、数字或连字符，用于作品链接，收录后不可改）」 with a live helper line showing the resulting `/games/<名称>` URL, and the old 「名称」 title field is now 「展示名称（站内展示的标题）」 and moves above it. Auto-slug generation, validation rules, payloads and test hooks are unchanged; related error/notice copy in `validation.ts`, `client.ts` and the form (bundle-invalidated hints) now says 名称/展示名称 accordingly.
- 提交表单的身份字段改为普通用户能看懂的文案：技术味的「作品 id（slug，收录后不可改）」改标为「名称（小写字母、数字或连字符，用于作品链接，收录后不可改）」，字段下实时显示最终链接 `/games/<名称>`；原「名称」标题字段改为「展示名称（站内展示的标题）」并上移到其之前。slug 自动联动、校验规则、提交载荷与测试钩子均不变；`validation.ts`、`client.ts` 与表单内的相关错误/提示文案（bundle 作废提示等）同步改用 名称/展示名称 口径。

## [0.10.3] - 2026-09-28

### Changed / 变更

- Extracted a reusable base-UI component layer under `src/app/components/ui/` (BaseButton, BaseInput, BaseTextarea, BaseSelect, BaseCheckbox, FileInput, BaseTabs, BasePagination) and migrated the repeated button / input / select / textarea / checkbox / file-upload / tab / pagination markup out of the views and shared components into it. `main.css` gains a compact `.btn-sm` size and a built-in disabled opacity for `.btn-ink` / `.btn-surface`; bespoke one-off controls (catalog search box, sort select with caret, icon buttons, sidebar filter rows) intentionally stay native. Appearance, aria semantics and e2e selectors (roles, text, data-testid) are unchanged; adds 32 component unit tests.
- 抽出可复用的基础 UI 组件层 `src/app/components/ui/`（BaseButton、BaseInput、BaseTextarea、BaseSelect、BaseCheckbox、FileInput、BaseTabs、BasePagination），把散落在各视图与公共组件里的重复按钮/输入框/下拉/多行文本/复选框/文件上传/页签/分页标记全部迁移进去。`main.css` 新增紧凑尺寸 `.btn-sm` 并为 `.btn-ink`/`.btn-surface` 内置禁用态透明度；一次性定制控件（目录搜索框、带箭头的排序下拉、图标按钮、侧栏筛选行）有意保持原生。外观、aria 语义与 e2e 选择器（role、文案、data-testid）均不变；新增 32 个组件单元测试。

## [0.10.2] - 2026-09-27

### Added / 新增

- Fullscreen support for the embedded play area: a 全屏/退出全屏 button in the control bar puts the whole cabinet (title bar, stage, and controls) into fullscreen, with the stage expanding from its fixed aspect ratio to fill the viewport; state tracks `fullscreenchange` so Esc and external exits restore the layout correctly.
- 内嵌游玩区支持全屏：控制条新增「全屏/退出全屏」按钮，整个展柜（标题栏、播放区、控制按钮）进入全屏，播放区由固定纵横比改为撑满视口；状态跟随 `fullscreenchange` 事件，Esc 或外部退出都能正确还原布局。

### Fixed / 修复

- The play iframe's sandbox now includes `allow-fullscreen`: works' own fullscreen requests (the `allowfullscreen` attribute and Permissions Policy were already in place) were blocked by the sandbox flag, so in-work fullscreen buttons never worked.
- 播放 iframe 的 sandbox 补上 `allow-fullscreen`：此前作品自身的全屏请求被 sandbox 旗标拦截（`allowfullscreen` 属性与 Permissions Policy 均已就位也没用），作品内的全屏按钮不可用。

- The bootstrap page now falls back to `document.referrer`'s origin when `VITE_HOST_ORIGIN` is missing or misconfigured: previously it would post every signal to a hardcoded default origin, the browser would silently reject them all, and the host would only surface an opaque 60s bootstrap timeout. Parent-side origin validation is unchanged, so this does not weaken the security model.
- bootstrap 页在 `VITE_HOST_ORIGIN` 缺失或配错时回退使用 `document.referrer` 的 origin：此前所有信号都发往硬编码默认 origin 并被浏览器静默拒绝，父级只能看到一句莫名的 60s 超时。父侧 origin 校验不变，不削弱安全模型。

## [0.10.1] - 2026-09-27

### Added / 新增

- Loading a work now shows a real determinate progress bar: the bootstrap page forwards the service worker's `runtime:progress` (received/total bytes) to the host, `useGameFrame` records it in the pre-existing (previously unused) `progress` state, and the cabinet overlay renders an ink-framed bar with percentage. The in-iframe bootstrap page's own progress UI is restyled to the same paper-ink language, so download, decrypt, install and startup read as one continuous themed flow.
- 作品加载现在显示真实确定态进度条：bootstrap 页将 SW 的 `runtime:progress`（已接收/总字节）转报父级，`useGameFrame` 记入早已预留但从未使用的 `progress` 状态，展柜遮罩渲染墨框进度条与百分比。iframe 内 bootstrap 页自身进度 UI 同步改为纸墨主题，下载/解密/安装/启动全程观感一致。

## [0.10.0] - 2026-09-27

### Added / 新增

- Submission form now collects runtime permission flags for virtual works (`eval` / `inlineScript`, default off with inline guidance): previously the form never sent `features`, so works needing `unsafe-eval` (e.g. Alpine.js) or `unsafe-inline` were blocked by the service worker's default CSP with no way to declare otherwise. Both the draft-edit and prefill paths round-trip the flags.
- 提交表单现为站内作品收集运行权限开关（`eval` / `inlineScript`，默认关闭并附适用场景说明）：此前表单不提交 `features`，需要 `unsafe-eval`（如 Alpine.js）或 `unsafe-inline` 的作品会被 SW 默认 CSP 拦截且无从声明。草稿编辑与预填两条回填路径同步回填勾选态。

- Admin console works tab can revise a published work's permission flags in place (saves via `PUT /api/admin/works/:id/features`; takes effect immediately through the detail API → host → SW chain), and the review detail page shows the flags a submission requested (read-only).
- 管理台「作品管理」可就地修订已发布作品的权限开关（经 `PUT /api/admin/works/:id/features` 保存，经详情 API→宿主→SW 链立即生效）；审核详情页只读展示提交者申请的开关。

- Embedded play area now renders as a themed "cabinet": 2px ink frame with hard shadow, a title bar with the work name, runtime badge (站内运行 / 托管运行 / 已降级外链) and status dot, and the loading/error/degrade overlays restyled to the paper-ink design language.
- 内嵌游玩区改为「展柜式」呈现：2px 墨框 + 硬阴影，标题栏含作品名、运行时徽标（站内运行/托管运行/已降级外链）与状态点，加载/失败/降级遮罩同步改为纸墨设计语言。

## [0.9.0] - 2026-09-27

### Added / 新增

- Dual-source content layer: catalog and game details now merge the backend API with static JSON (union by id, API wins, `source` badge for static-only community contributions); API outages degrade the catalog to static-only, while detail pages surface errors instead of masking them as not-found.
- 双源内容层：目录与作品详情合并后端 API 与静态 JSON（按 id 并集、API 胜出、静态源作品带「社区投稿」徽标）；API 故障时目录降级纯静态，详情页则显式报错而非伪装成不存在。

- Submission portal at /submit: full lifecycle (new work / new version / metadata change), slug auto-generation, prefill from existing works, XHR bundle & cover uploads with progress, drafts, submit/withdraw/resubmit after rejection with review notes.
- /submit 提交入口：完整生命周期（新作品/新版本/元数据更新）、slug 自动生成、已收录作品预填、XHR bundle 与封面上传（带进度）、草稿、提交/撤回/被拒后重提（含审核意见展示）。

- Admin console at /admin (admin role only): pending review queue with pagination, submission detail with approve/reject (note required), works management (unpublish, bundle-key revoke/restore, republish via approved-submission history).
- /admin 管理台（仅 admin 角色）：待审队列（分页）、审核详情（通过/拒绝，意见必填）、作品管理（下架、密钥吊销/恢复、经已通过提交历史恢复上架）。

### Changed / 变更

- The 4 legacy catalog entries (2048 / a-dark-room / arclight-nightcast / case-files) moved out of `src/games/` into e2e fixtures: in production the backend is now their single source of truth. **The shipped static catalog is therefore empty** (`build-data.mjs` without `--with-fixtures` reads `src/games/`, which holds only `.gitkeep`), so a production deploy shows the API-sourced catalog only — the static pipeline stays for future PR contributions until each is imported and its JSON removed. See the deploy ordering constraint in README.
- 存量 4 作品（2048 / a-dark-room / arclight-nightcast / case-files）从 `src/games/` 迁入 e2e 夹具：生产中它们以后端为唯一真源。**因此随包发布的静态目录为空**（`build-data.mjs` 不带 `--with-fixtures` 时读 `src/games/`，其中只剩 `.gitkeep`）→ 生产部署只展示 API 源目录；静态通道保留给后续 PR 贡献（被 import 后同样删除对应静态文件）。部署顺序约束见 README。

- `docs/superpowers/` (superpowers design specs/plans/handoffs) is no longer tracked by git and is now gitignored; the design docs added on this branch were also stripped from its commit history. Local copies stay on disk.
- `docs/superpowers/`（superpowers 设计文档/计划/交接）不再被 git 追踪并加入 gitignore；本分支提交历史中新增的设计文档也已一并抹除。本地副本保留在磁盘上。

### Fixed / 修复

- Cross-origin bundle-key fetch: removed the redundant author-level `Cache-Control: no-cache` request header in the SW key fetch. It is not a CORS-safelisted header, so on any cross-origin deploy it forced a preflight that the backend's narrow `Access-Control-Allow-Headers` rejected, blocking the key GET and leaving virtual works unplayable. `cache: 'no-store'` already prevents caching (and is stricter), so the header was pure liability.
- 跨源取钥：移除 SW 取钥中冗余的作者级 `Cache-Control: no-cache` 请求头。它不是 CORS 安全列表头，跨源部署下会强制触发预检，而后端较窄的 `Access-Control-Allow-Headers` 会拒绝该预检 → 取钥 GET 被拦 → virtual 作品不可玩。防缓存已由 `cache: 'no-store'`（更严）保证，故该头纯属累赘。

- Submit form: the bundle-upload disabled hint now names exactly which field is missing (work id and/or version) instead of always showing both. This fixes the confusion where the version placeholder `v1` looks like an entered value while the file input stays unclickable.
- 提交表单：bundle 上传禁用提示现在精确指出缺失字段（作品 id 与/或版本号），不再固定同时显示两者；解决了版本号占位符 `v1` 看似已填写、文件选择却始终点不了的困惑。

- Submit form: the bundle and cover file inputs were left unstyled (raw browser-default "选择文件" text), clashing with the neo-brutalist form. They now match the design system: outer box aligned with other inputs, inner button rendered as a `btn-ink`-style black button.
- 提交表单：bundle 与封面的文件选择框此前无任何样式（浏览器默认的裸「选择文件」文本），与表单的新粗野主义风格脱节；现对齐设计系统——外框与其他输入框一致，内部按钮渲染为 btn-ink 风格的黑底按钮。

## [0.8.0] - 2026-09-27

### Added / 新增

- The SW runtime now installs envelope-encrypted CRB1 bundles: parallel bundle-key fetch with 429 backoff, three-way kid cross-check (catalog `bundle.enc.kid` ↔ key response ↔ file header), AES-256-GCM decryption via WebCrypto before the existing unzip/cache chain; plaintext bundles (no `enc`) keep the legacy path. Self-heal reinstalls rebuild encryption params from persisted runtime meta; e2e fixtures are encrypted with fault-injected key endpoints (410/429).
- SW 运行时支持安装信封加密的 CRB1 bundle：并行取钥（429 退避重试）、kid 三方交叉校验（目录 `bundle.enc.kid` ↔ key 响应 ↔ 文件头）、WebCrypto AES-256-GCM 解密后衔接现有解包/缓存链路；无 `enc` 的明文 bundle 保持旧路径。自愈重装从持久化 meta 重建加密参数；e2e 夹具全面加密并注入取钥故障（410/429）。

## [0.7.6] - 2026-09-20

### Removed / 移除

- Removed the in-repo compose files (`deploy/docker-compose.dev.yml`, `docker-compose.prod.yml`, `docker-compose.mock.yml`); local orchestration now lives in the `crearte-deploy` repository, and the Dockerfiles plus nginx config stay as its build inputs.
- 移除仓库内的 compose 文件（`deploy/docker-compose.dev.yml`、`docker-compose.prod.yml`、`docker-compose.mock.yml`）：本地编排统一由 `crearte-deploy` 仓库负责，`Dockerfile` 与 nginx 配置保留作为其构建输入。

## [0.7.5] - 2026-09-20

### Added / 新增

- Added same-origin `/api` proxying for the Docker stacks: the Vite dev server proxies `/api` when `VITE_API_PROXY_TARGET` is set, and the production nginx config reverse-proxies `/api/` to the `api` service, so the browser no longer needs an exposed API port.
- 为 Docker 部署新增同源 `/api` 代理：设置 `VITE_API_PROXY_TARGET` 时 Vite dev server 会代理 `/api`，生产 nginx 把 `/api/` 反代到 `api` 服务，浏览器不再需要暴露的 API 端口。

## [0.7.4] - 2026-09-20

### Fixed / 修复

- Pointed the dev container's `VITE_API_BASE_URL` at the local backend port (`http://localhost:8081`, matching `crearte-server/deploy/docker-compose.local.yml`) instead of `http://localhost:8080`; the browser previously posted `/api/auth/*` back to the frontend itself and got 404.
- 修正 dev 容器的 `VITE_API_BASE_URL` 指向本地后端端口（`http://localhost:8081`，与 `crearte-server/deploy/docker-compose.local.yml` 对齐）：此前浏览器把 `/api/auth/*` 发回 8080 的前端自身，返回 404。

## [0.7.3] - 2026-09-20

### Fixed / 修复

- Stopped the data build from deleting and recreating `public/data`: it now empties the directories in place, so the dev container keeps serving `games/*.json` and `bundles/*.zip` after a host-side rebuild (macOS bind mounts kept a stale view of the recreated directories, and JSON requests fell through to the SPA fallback).
- 数据构建不再删除重建 `public/data`：改为清空内容、保留目录本身，宿主侧重构建后 dev 容器仍能正确提供 `games/*.json` 与 `bundles/*.zip`（此前 macOS 绑定挂载对重建目录的视图陈旧，JSON 请求会落到 SPA 回退）。

## [0.7.2] - 2026-09-20

### Changed / 变更

- Dropped game-only wording from the site copy: catalog, detail, outbound and runtime messages now say 作品, and the docs (built-in pages and repo README) scope collections to static web works beyond games (assessments, small tools).
- 站内文案去除「游戏」语义：目录、详情、外链中间页与运行时提示统一改为「作品」，内置文档与仓库 README 把收录范围扩展到游戏之外的静态网页作品（测评、小工具等）。

## [0.7.1] - 2026-09-20

### Changed / 变更

- Replaced the slogan with `HOST YOUR CREATIONS` and the hero Chinese line with 「托管你的创意」, synced across the landing hero, header sticker and footer.
- 更换标语为 `HOST YOUR CREATIONS`，hero 中文定位语改为「托管你的创意」，落地页、页头贴纸与页脚同步。

- Styled the landing wordmark: the `art` in `crearte` is set in accent red on a slightly tilted yellow label with a hard shadow.
- 落地页字标艺术化：`crearte` 中的 `art` 用 accent 红字，做成带硬阴影的斜贴黄标签。

- Added a scroll-driven assembly to the landing wordmark: the page holds its own scroll until the wheel / touch / keyboard input has turned `create` into `crearte` (reversible while held; scrolling back to the top rewinds it and scrolling down replays; reduced motion shows the assembled state without the hold).
- 落地页字标新增滚动拼装：拼装完成前页面锁住实际滚动，由滚轮 / 触摸 / 键盘输入把 `create` 拼成 `crearte`（锁定期间可逆；回到顶部自动回退、再次下滑重播；reduced motion 不锁滚动、直接显示完成态）。

## [0.7.0] - 2026-09-19

### Added / 新增

- Added the account system UI: register, login, account page with password change and logout-all, plus a three-state header entry backed by a local-JWT-aware session store.
- 新增账号系统界面：注册、登录、账号页（改密与登出全部设备），以及基于本地凭证会话的 header 三态入口。

### Changed / 变更

- The account entry is now optional: without `VITE_API_BASE_URL` the login entry is hidden, auth routes redirect home and no auth requests are sent; added an `e2e:noauth` suite covering the disabled build.
- 账号入口改为可选：未配置 `VITE_API_BASE_URL` 时隐藏登录入口、auth 路由重定向首页且不发起 auth 请求；新增 `e2e:noauth` 套件覆盖关闭态构建。

## [0.6.0] - 2026-09-19

### Changed / 变更

- Scoped the open-source promise: this repository is the official frontend; the static catalog stays self-hostable, while account, upload and moderation features depend on the private backend.
- 明确开源边界：本仓为官方前端，静态目录仍可自建，账号 / 上传 / 审核等能力依赖私有后端。

### Added / 新增

- Added the contributor license agreement (CLA) for code and data contributions, and documented the `VITE_API_BASE_URL` / `VITE_GAMES_BASE_DOMAIN` / `VITE_HOST_ORIGIN` build args in the deploy flow.
- 新增贡献者许可协议（CLA，代码与数据均适用），并在部署流程中记录 `VITE_API_BASE_URL` / `VITE_GAMES_BASE_DOMAIN` / `VITE_HOST_ORIGIN` 构建参数。

## [0.5.1] - 2026-09-19

### Added / 新增

- Added the Chinese brand name 创艺 alongside crearte: a badge above the landing hero title, the page title, the header brand, the catalog heading, and the about page opener.
- 新增中文品牌名「创艺」，与 crearte 并列：落地页标题上方伴标、页面标题、页头品牌、目录页标题与关于页首句。

## [0.5.0] - 2026-09-19

### Added / 新增

- Added a landing page at `/` with a poster-style hero, a collection counter, and a featured grid sampled by balanced type rotation; the catalog moved to `/games`.
- 新增 `/` 落地页：海报式 hero、收录统计条，以及按类型均衡取样得出的精选网格；目录迁至 `/games`。

### Changed / 变更

- The header badge shows the collection count on the landing page too, while navigation highlighting still follows the catalog route only.
- 页头贴纸在落地页也显示收录数；导航激活仍只看目录路由。

## [0.4.1] - 2026-09-19

### Changed / 变更

- Rebranded the user-facing strings to crearte: the page title, the header site name, the catalog heading, and the about page opener.
- 用户可见文案统一改为 crearte：页面标题、页头站点名、目录页标题与关于页首句。

## [0.4.0] - 2026-09-19

### Added / 新增

- Added an outbound interstitial: every link that leaves the site now goes through `/out` with game and generic notice copy, an invalid-target error state, a strict http/https whitelist, and a render-time rewrite of external markdown links.
- 新增外链中间页：所有离开本站的链接先经过 `/out`，含游戏版与普通版提示文案、非法目标错误态、严格 http/https 协议白名单，以及 markdown 外链的渲染期改写。

### Changed / 变更

- Game and author links on the detail page now open the interstitial first, and the about page documents the feedback email.
- 详情页的游戏与作者链接改为先进入中间页；关于页补充邮箱反馈渠道。

## [0.2.0] - 2026-09-18

### Added / 新增

- Added the game runtime: per-game subdomains, a Service Worker virtual source for signed bundles, a hosted (C) mode, sandboxed iframes with per-game feature flags, an agent-injected MessagePort bridge (score/save/exit), a shell degrade chain with a host error panel, offline play and bundle updates.
- 新增游戏运行时：按游戏子域隔离、签名 bundle 的 Service Worker 虚拟源、C 模式（后端托管）、带 features 开关的沙箱 iframe、注入 agent 的 MessagePort 桥（得分/存档/退出）、shell 降级链与宿主错误面板、离线可玩与版本更新。

- Extended the game schema to v2 with `runtime`/`version`/`bundle`/`entry`/`hostedUrl`/`fallback`/`features`, plus fixture/data pipelines and a multi-origin mock runtime server; added a Playwright e2e suite.
- 游戏 schema 升级到 v2，新增 `runtime`/`version`/`bundle`/`entry`/`hostedUrl`/`fallback`/`features`，并补充夹具/数据管线与多源 mock 运行时服务；新增 Playwright e2e 测试。

- Added `deploy/docker-compose.mock.yml` to run the multi-origin runtime mock (host site + `*.localhost` game subdomains) alongside the dev container.
- 新增 `deploy/docker-compose.mock.yml`，可与 dev 容器并行运行多源运行时 mock（宿主站 + `*.localhost` 游戏子域）。

### Changed / 变更

- Added a wildcard game-host nginx block and bundle download CORS; PR validation now runs the runtime e2e suite.
- 新增游戏子域 nginx 通配 server block 与 bundle 下载 CORS；PR 校验流水线现在会执行运行时 e2e。

- Widened the game player to `max-w-5xl` and restyled the runtime controls with design-system surface buttons (readable contrast, new `.btn-surface`); the iframe now has a white backdrop and an accessible title.
- 游戏播放器加宽到 `max-w-5xl`，运行时控制按钮改用设计系统纸面样式（对比度恢复正常，新增 `.btn-surface`）；iframe 增加白底与可访问标题。

- Made the delivery type explicit in game data: existing games now declare `runtime: "external"` instead of relying on the schema default.
- 游戏数据显式声明投递类型：现有游戏均写明 `runtime: "external"`，不再依赖缺省值。

- Renamed the compose files to the `docker-compose.*.yml` pattern (`deploy/docker-compose.dev.yml`, `docker-compose.prod.yml`, `docker-compose.mock.yml`).
- compose 文件统一改名为 `docker-compose.*.yml`（`deploy/docker-compose.dev.yml`、`docker-compose.prod.yml`、`docker-compose.mock.yml`）。

- Renamed the project and images to `crearte`: GHCR image `ghcr.io/xingfend/crearte`, compose images `crearte:dev`/`crearte:local`, compose projects `crearte-dev`/`crearte-prod`/`crearte-mock`, k8s namespace/name/labels, npm package name and schema `$id`.
- 项目与镜像全面改名为 `crearte`：GHCR 镜像 `ghcr.io/xingfend/crearte`，compose 镜像 `crearte:dev`/`crearte:local`，compose 项目名 `crearte-dev`/`crearte-prod`/`crearte-mock`，k8s namespace/名称/标签、npm 包名与 schema `$id`。

- Relicensed the frontend under AGPL-3.0-only (network copyleft) with a commercial-licensing note in the README; the service side stays proprietary and separately maintained.
- 前端改为 AGPL-3.0-only 许可（含网络条款），README 增加商业授权说明；服务端保持闭源、独立维护。

- Removed the publish workflow; images are now built and pushed manually, with keel polling (or a manual webhook) rolling out updates.
- 移除 publish 工作流；镜像改为手动构建推送，由 keel 轮询（或手动 webhook）滚动更新。

### Fixed / 修复

- Service Worker install signals readiness only after best-effort cache cleanup, and malformed request URLs and fixture mtimes are handled deterministically.
- Service Worker 安装改为缓存清理（尽力而为）完成后才上报就绪；畸形请求 URL 与夹具 mtime 处理确定化。

## [0.1.3] - 2026-09-17

### Added / 新增

- Added Case Files and Arclight Nightcast to the collection.
- 收录《案件推演系统》（Case Files）与《弧光镇晚间新闻》（Arclight Nightcast）。

## [0.1.2] - 2026-09-17

### Changed / 变更

- Removed the k8s Ingress because the cluster has no ingress controller, and exposed the Service as NodePort 30080 instead.
- 集群未安装 ingress controller，移除 k8s Ingress，改为 NodePort 30080 暴露 Service。

- Updated the deployment docs and manifest tests to match the NodePort setup.
- 同步更新部署文档与清单测试以匹配 NodePort 方案。

## [0.1.1] - 2026-09-17

### Fixed / 修复

- Lowercased the GHCR image path to `ghcr.io/xingfend/webgame-collection` in the k8s manifest and publish workflow, since containerd rejects repository names with uppercase letters.
- 将 k8s 清单与发布工作流中的 GHCR 镜像路径改为小写 `ghcr.io/xingfend/webgame-collection`，containerd 拒绝含大写字母的仓库名。

## [0.0.1] - 2026-04-28

### Added / 新增

- Added an English project-template README in `docs/README.md`.
- 在 `docs/README.md` 中补充了英文版项目模板说明。

- Added a Chinese project-template README in `docs/README_zh.md`.
- 在 `docs/README_zh.md` 中补充了中文版项目模板说明。

- Added guidance for template users on how to rewrite the README for their own project.
- 增加了模板使用者如何把 README 改写为自己项目介绍的说明。

- Added a documented repository structure overview based on the current scaffold.
- 基于当前仓库骨架补充了目录结构说明。

- Added this changelog file for future template maintenance.
- 新增本更新日志文件，便于后续持续维护模板。

### Notes / 说明

- The repository currently provides structure and placeholder files rather than a finished implementation.
- 当前仓库主要提供目录结构和占位文件，尚不是一个已完成功能实现的成品项目。

- Future updates should record framework selection, startup steps, deployment workflow, and major documentation changes.
- 后续若补充了技术栈、启动流程、部署方式或重要文档内容，建议继续记录在本文件中。

