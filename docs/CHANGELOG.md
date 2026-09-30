# Changelog / 更新日志

All notable changes to crearte are documented in this file.
本仓的重要变更统一记录在此文件中。

The format follows Keep a Changelog (https://keepachangelog.com/) and is used as this repository's release-note format.
书写格式遵循 Keep a Changelog（https://keepachangelog.com/），作为本仓发布记录的格式约定。

## [0.20.0] - 2026-10-01

### Added / 新增

- The submission form and both admin surfaces now expose the full seven-key CSP feature set: alongside the existing `eval` / `inlineScript`, authors and admins can toggle `inlineStyle`, `wasm`, `coop`, `fullscreen` and `gamepad` (the server and runtime already accepted all seven — this release only opens the editing UI, the flag consumers are untouched). All three surfaces (the submission form checkbox group, AdminView's expanded work row, AdminSubmissionView's read-only display) stay driven by the single `FEATURE_ITEMS` list, so no surface carries its own hard-coded copy. `collectFeatures` now emits all seven keys (an explicit all-false object still means “grant nothing”, preserving the backend's “a missing key in an old submission → keep the stored value” distinction), `featuresToForm` reads the five new keys back defaulting to false, and `hasAnyFeature` covers them. Each new switch's label and hint spell out what kind of work needs it, what is loosened, and when to leave it off.
- 提交表单与两处管理面现开放七键 CSP 权限全集：在既有 `eval` / `inlineScript` 之外，作者与管理员可勾选 `inlineStyle`、`wasm`、`coop`、`fullscreen`、`gamepad`（服务端与运行时本已支持七键，本次只补编辑 UI，flag 消费端零改动）。三处界面（投稿表单勾选区、AdminView 作品展开行、AdminSubmissionView 只读展示）仍由同一份 `FEATURE_ITEMS` 驱动，无任一界面自带硬编码。`collectFeatures` 改为输出七键齐全（显式全 false 仍表示「不放宽」，保住后端「旧提交缺键→保留原值」的区分），`featuresToForm` 回读五个新键并缺省 false，`hasAnyFeature` 自然覆盖。每条新开关的 label 与 hint 写清什么作品需要它、放宽了什么、何时不应开启。

### Docs / 文档

- Reworded this changelog's header into the project's own voice (crearte is a product, not a template): removed the “template” / “suggested” / “can be adjusted to taste” placeholder phrasing, keeping a single line that cites Keep a Changelog as the format source. Historical entries are untouched.
- CHANGELOG 头部改为项目自己的口径（crearte 是产品，不是模板）：去掉「模板/重要变更建议统一记录/可以根据团队习惯调整」的占位话术，保留一句出处说明（书写格式遵循 Keep a Changelog）。历史条目未改动。

## [0.19.1] - 2026-09-30

### Added / 新增

- Admin review detail now surfaces hosted submissions (P6 decision D-D follow-up): a 托管链接 row renders `payload.hostedUrl` as **plain text** — deliberately no anchor, no embed preview, reviewers are not steered into clicking arbitrary third-party URLs — plus a 降级方式 row with localized fallback labels（降级为外链 / 降级为站内播放 / 不降级；unknown values fall back to raw）shown for `runtime === 'hosted'`. e2e admin-flow gained a seventh flow (HOSTED queue fixture) pinning both rows and the no-anchor property.
- 审核详情页现展示 hosted 提交（P6 决策 D-D 补遗）：新增「托管链接」行，把 `payload.hostedUrl` 以**纯文本**呈现——有意不做锚点、不做内嵌预览，审核者不被引导点击任意第三方 URL；`runtime === 'hosted'` 时另显「降级方式」行（中文标签：降级为外链 / 降级为站内播放 / 不降级；未知值回退原文）。e2e admin-flow 新增第七条流（HOSTED 队列夹具）钉死两行形状与无锚点性质。

## [0.19.0] - 2026-09-30

### Added / 新增

- Authors can now submit self-hosted (hosted) works: the submission form's runtime radios gained a third option 「自托管内嵌」 and the content-layer payload type widens to `external | virtual | hosted` with `hostedUrl` and `fallback` fields (JSON names aligned with the server `WorkPayload`). A hosted submission fills an https play URL (required, https-only, any domain — mirroring the server's `payloadHTTPSPattern`) plus a fallback choice (`external | hosted | none`, default `external`); choosing `external` requires the work's original link, and the payload carries only `runtime` + `hostedUrl` + `fallback` — no `bundle` / `version` / `entry` / `features` (hosted never eats a platform file). `new_version` stays virtual-only, and the form can no longer refuse to prefill a hosted work: picking a hosted work in 元数据更新 now backfills `hostedUrl` / `fallback` instead of erroring out. The play side (GameHost / useGameFrame / sw / agent / bootstrap) is untouched by design.
- 作者现可投稿自托管（hosted）作品：提交表单的运行时单选新增第三档「自托管内嵌」，内容层提交载荷类型扩为 `external | virtual | hosted` 并补 `hostedUrl`、`fallback` 字段（json 名与服务端 `WorkPayload` 对齐）。hosted 档填 https 播放链接（必填、仅 https、任意域名——镜像服务端 `payloadHTTPSPattern`）与降级方式（`external | hosted | none`，默认 `external`）；选 `external` 时作品原始链接必填，且载荷只带 `runtime` + `hostedUrl` + `fallback`——不带 `bundle` / `version` / `entry` / `features`（hosted 不吃平台文件）。`new_version` 保持 virtual-only；表单不再拒绝预填 hosted 作品：元数据更新档选到 hosted 作品会回填 `hostedUrl` / `fallback` 而非报错。播放端（GameHost / useGameFrame / sw / agent / bootstrap）按 spec 决策零改动。

### Tests / 测试

- New vitest coverage for the hosted branch of SubmitFormView (submission shape drops bundle/version/entry/features, required-field failure surface for `hostedUrl` and `fallback=external`+missing `url`, hosted prefill backfill, and `new_version` refusing a hosted work), plus an `e2e/submit-flow.spec.ts` flow asserting the hosted draft payload shape through the real form.
- 新增 vitest 覆盖 SubmitFormView 的 hosted 分支（提交形状不带 bundle/version/entry/features、`hostedUrl` 与 `fallback=external` 缺 `url` 的必填失败面、hosted 预填回填、`new_version` 拒 hosted），并在 `e2e/submit-flow.spec.ts` 加一条真表单走查、断言 hosted 草稿载荷形状。

## [0.18.0] - 2026-09-30

### Added / 新增

- Added the admin console pages (P7): `/admin/users` (AdminUsersView — username/email/display-name/role/registered-at table, debounced search, 50-per-page pagination; promote-to-admin is a one-click PATCH, demote requires a two-step confirmation overlay spelling out that the target's sessions are revoked immediately and that demoting the last admin is rejected with 409, and the backend 409 text is echoed verbatim) and `/admin/audit` (AdminAuditView — reverse-chronological audit trail with localized timestamps, actor email, route-template→Chinese action labels falling back to the raw template for unknown routes, object extracted from the request path, 2xx-green / 4xx-amber / other-red status chips, and a route filter dropdown). AdminView's header gains 用户管理 / 操作日志 links; both new routes reuse the exact AdminView guard (`requiresAuth` + `requiresAdmin`, also registered in the auth-disabled redirect set).
- 新增管理后台两页（P7）：`/admin/users`（AdminUsersView——用户名/邮箱/显示名/角色/注册时间表格、防抖搜索、每页 50 分页；升 admin 一键直发 PATCH，降级走两步确认弹层，文案写明「对方所有登录态立即失效」与「若其为最后一个管理员将被 409 拒绝」两点，409 后端原文回显）与 `/admin/audit`（AdminAuditView——倒序审计流水：本地化时间、操作者邮箱、route 模板→中文动作标签（未知模板回退原文）、对象从请求 path 逐段提取、2xx 绿 4xx 黄其余红、route 过滤下拉）。AdminView 顶部新增「用户管理 / 操作日志」入口；两条新路由守卫与 AdminView 完全一致（requiresAuth + requiresAdmin，auth 关闭重定向集合同步登记）。

- Extended `apiRepo` with the admin surface: `listAdminUsers` / `setUserRole` / `listAudit` against the spec §3.4 endpoints (Bearer token from the session; neither admin GET participates in ETag caching; response bodies pass through without static schema validation). Errors surface as a new `AdminApiError` carrying the HTTP status and the backend `code` (`last_admin` / `validation` / `not_found` …) with the server message preserved verbatim so the UI can echo 409 text; the read-side `NotFoundError` contract is unchanged.
- `apiRepo` 扩充管理面：`listAdminUsers` / `setUserRole` / `listAudit` 三方法对接 spec §3.4 端点（携带 session Bearer token；两个 GET 不参与 ETag 缓存；响应体透传不做静态断言）。错误经新增 `AdminApiError` 暴露 status 与后端 `code`（`last_admin`/`validation`/`not_found`…）并原样保留后端 message，供 UI 直接回显 409 原文；读侧 `NotFoundError` 契约不变。

### Tests / 测试

- New vitest coverage for the admin repo request shapes and error mapping, both views (table render, debounced search, demote confirmation copy, 409 echo, action-label fallback, route filter) and guard parity for the new routes; `e2e/admin-flow.spec.ts` gains two fixture-driven flows — a role up/down round-trip with the confirmation overlay (plus the last-admin 409 echo), and "a management action lands as the first audit row". The fixtures implement the spec §3.4 shapes in-memory pending real-stack integration.
- 新增 vitest 覆盖：管理面 repo 请求形状与错误映射、两个新 view（表格渲染、防抖搜索、降级确认弹层文案、409 回显、标签映射回退、route 过滤）、新路由与 AdminView 守卫一致性；`e2e/admin-flow.spec.ts` 扩两条夹具流——角色升降往返 + 确认弹层文案出现（含唯一 admin 409 原文回显），以及「执行管理动作后审计页首行即该动作」。夹具按 spec §3.4 形状内存实现，待真栈联调。

## [0.17.0] - 2026-09-30

### Added / 新增

- Added the Creator Center (`/creator`): a homepage-style page with a hero (提交作品 / 投稿指南 CTAs) and two cards — 「作品数据」 (placeholder adapting to auth state: anonymous visitors get a login prompt with `next` return, signed-in users see build-in-progress copy, noauth deploys show no login link) and 「创作教程」 (placeholder linking to the existing submission guide until the tutorial content lands). The header main nav gains a third tab with the same active styling as 作品/文档. No backend or deploy changes.
- 新增创作者中心（`/creator`）：首页样式页面，hero（提交作品 / 投稿指南两个按钮）+ 两张卡——「作品数据」占位卡按登录态分流（未登录给登录引导并带 `next` 回跳、已登录显示建设中文案、noauth 部署不出现登录链接）与「创作教程」占位卡（教程内容定稿前链向现有《提交作品指南》）。页头主导航新增第三个 tab，激活样式与「作品 / 文档」一致。零后端、零部署改动。

## [0.16.1] - 2026-09-30

### Fixed / 修复

- `scripts/serve-runtime.mjs` now serves the runtime triple (`/__bootstrap`, `/sw.js`, `/agent.js`) on any `*.localhost` game subdomain, ahead of the fixture-table gate — matching the prod nginx wildcard block and the dev plugin (`dev-game-runtime.ts`) — so works registered live through the API in the real-stack full-loop e2e can install their service worker instead of timing out on 404s.
- `scripts/serve-runtime.mjs` 的运行时三件套（`/__bootstrap`、`/sw.js`、`/agent.js`）改为对任意 `*.localhost` 游戏子域可服务，不再卡在夹具表门槛之后——与 prod nginx 通配块及 dev 插件（`dev-game-runtime.ts`）对齐；真栈 full-loop e2e 中经活体 API 现场注册的作品由此能装上 SW，不再因 404 超时。

### CI / 持续集成

- `scripts/e2e-stack.sh` gains `CREARTE_STACK_GO` (explicit go binary for the backend build — a CI runner whose `/usr/local/go` predates the backend's go.mod floor used to trip the version gate into silent SKIP mode, a false green) and `CREARTE_STACK_REQUIRED=1` (fail fast when the stack cannot start instead of skipping full-loop silently); `validate.yml` now also runs on pushes to `master`.
- `scripts/e2e-stack.sh` 新增 `CREARTE_STACK_GO`（显式指定编译后端的 go 二进制——runner 上 `/usr/local/go` 低于后端 go.mod 地板时曾掉进静默 SKIP 假绿）与 `CREARTE_STACK_REQUIRED=1`（栈起不来直接失败，不再静默跳过 full-loop）；`validate.yml` 追加对 `master` 推送的触发。

## [0.16.0] - 2026-09-30

### Added / 新增

- Favorites & 5-star ratings reach the web UI (P5). New `GameReactions` component on the work detail page (mounted after the play action link, before the intro divider): a ♥ favorite toggle and a five-star bar — lit stars show the personal score when rated, otherwise floor(average); clicking the current star unrates; every successful mutation replaces local state wholesale from the server's `ReactionView` (never optimistic ±1 arithmetic), failures surface as a single `aria-live` line, in-flight requests lock all buttons, anonymous clicks go to `/login?next=<current path>`, and the whole component renders nothing without `VITE_API_BASE_URL` (noauth builds issue zero requests). New `lib/reactions.ts` wraps the favorite/rating/me-reactions endpoints with the session bearer token, using the same base-URL semantics as `data/index.ts` (the trimmed value decides enablement — `'/'` is a same-origin proxy, not "no backend"; trailing slashes are stripped only when joining); a missing token or a server 401 raises `AuthRequiredError`. Catalog cards gained a reaction badge line (`★ 4.5 · 2 人 · ♥ 3`) rendered only from aggregates actually present, so static noauth data stays pixel-identical, and the catalog gained the `热门` sort (Bayesian prior mean + log favorite weight, pure `hotScore` in `lib/filter.ts`). The account page shows a `我的收藏` section — favorites joined against the catalog list with a per-row 取消收藏 button (a successful unfavoriting removes the row locally; ids missing from the catalog, e.g. delisted works, skip their row), a compact `作品名 ★n` rating list, and the empty state 「还没有收藏或评分。」 — fetched only when authenticated and enabled.
- 收藏与 5 星评分进入 web UI（P5）。作品详情页新增 `GameReactions` 组件（挂在游玩入口之后、简介分隔线之前）：♥ 收藏开关 + 五星条——已评点亮个人分，未评点亮 floor(均分)，点当前星即撤评；每次变更成功后用服务端 `ReactionView` 全量替换本地态（绝不自作 ±1 加减），失败显示一行 `aria-live` 错误，在途请求锁住全部按钮，匿名点击跳 `/login?next=<当前路径>`，未配 `VITE_API_BASE_URL` 时整组件零渲染零请求（noauth 构建）。新增 `lib/reactions.ts` 封装收藏/评分/我的反应端点，Bearer 取自 session 单例，base URL 语义与 `data/index.ts` 一致（trim 后的值决定启用——`'/'` 是同源反代而非「无后端」；仅在拼接时去尾斜杠）；无 token 或服务端 401 抛 `AuthRequiredError`。目录卡片新增反应徽标行（`★ 4.5 · 2 人 · ♥ 3`），仅当聚合字段真实存在才渲染，静态 noauth 数据逐像素不变；目录同时新增 `热门` 排序（贝叶斯先验均分 + 收藏对数权重，`lib/filter.ts` 纯函数 `hotScore`）。账号页新增「我的收藏」节——收藏与目录列表 join、逐行取消收藏钮（取消成功后本地移除该行；目录查不到的 id（已下架作品）跳过该行），加紧凑评分行 `作品名 ★n`，空态「还没有收藏或评分。」；仅登录且启用时发请求。

## [0.15.0] - 2026-09-29

### Changed / 变更

- `deploy/nginx.conf` became `deploy/nginx.conf.template`, rendered at container start by the official nginx entrypoint's envsubst pass (`/etc/nginx/templates/`). The wildcard game server's `server_name` is now the `GAMES_SERVER_NAME` variable instead of the hardcoded `*.games.example.com`, and the block gained `location /api/` same-origin reverse proxy to `api:8080` — without it, prod play runtime on `<sub>.<domain>` couldn't reach bundle-key (dev only worked because vite proxies `/api` on every host). The three-piece runtime (`/__bootstrap`, `/sw.js`, `/agent.js`) and the 404 fallback are unchanged; the shape is pinned by `repo-yaml.test.ts` against the template.
- `deploy/nginx.conf` 改为 `deploy/nginx.conf.template`，由 nginx 官方镜像 entrypoint 的 envsubst 机制在容器启动时渲染到 `/etc/nginx/templates/`。通配游戏域 server 的 `server_name` 从硬编码 `*.games.example.com` 改为 `GAMES_SERVER_NAME` 变量，并新增 `location /api/` 同源反代到 `api:8080`——此前 prod 子域运行时根本够不着 bundle-key（dev 能跑全靠 vite 在每个 Host 上顺带代理 `/api`）。运行时三件套（`/__bootstrap`、`/sw.js`、`/agent.js`）与 404 兜底骨架不变，形状由 `repo-yaml.test.ts` 对模板钉死。

## [0.14.0] - 2026-09-29

### Added / 新增

- New author page `/users/:user` (route `author`) aggregating a user's published works: breadcrumb `目录 / @user`, header `@user` with the work count, the catalog's card grid filtered to the namespace (default sort), and an empty state 「该作者暂无已上架作品」 with a 返回目录 button. Author names cross-link to it from both the work detail page and every catalog card — the link target always comes from the namespace `user`, never the free-form `author.name`. The `author.url` external fallback exists only on the detail page's author line (its three forms: internal link / external link / plain text) and stays reachable only when no `user` exists; a card's author row has just two forms (internal link / plain text). GameCard was rebuilt around a stretched-link (the title anchor's pseudo-element covers the whole card) so the full-body click is kept without nested anchors. Covered by unit tests for the view, the card and the detail-page author line, plus noauth e2e cases that list the author's works, verify every card links into `/games/fixture/…`, click a card body outside both anchors to reach the work's detail page, and check the empty state including its return-to-catalog navigation.
- 新增作者主页 `/users/:user`（路由 `author`）聚合某用户的已上架作品：面包屑 `目录 / @user`、`@user` 标题与作品计数、与目录同款的作品卡片网格（按命名空间过滤，默认排序），以及空态「该作者暂无已上架作品」与「返回目录」按钮。作者名从作品详情页与每张目录卡片互链至作者页——链接目标永远取命名空间 `user`，与自由填写的 `author.name` 无涉。`author.url` 外链兜底只存在于详情页的作者行（其三态：站内链接 / 外链 / 纯文本），且仅在无 `user` 时可达；卡片作者行只有两态（站内链接 / 纯文本）。GameCard 改为拉伸链接（标题锚点伪元素铺满整卡），整卡点击得以保留且不再有锚点嵌套。附视图、卡片与详情页作者行单测，以及 noauth e2e 用例（列出该作者作品、校验每张卡链接进 `/games/fixture/…`、点击两锚点之外的卡身直达作品详情、覆盖空态含返回目录导航）。

## [0.12.0] - 2026-09-29

### Changed / 变更

- Submitting a work no longer requires 作者名/描述/作品原始链接: the three fields are marked （可选） and omitted from the payload when empty (`external` works still require a link). The API omits the keys entirely, so the types are now optional and the views fall back gracefully — the author slot shows the owner's username (or 佚名), and the description paragraph and the external-play link disappear when absent; a virtual work without a link degrades straight to an error instead of an empty external target. Includes a minimal fixture and e2e coverage.
- 提交作品不再强制填写作者名/描述/作品原始链接：三项标注（可选），留空即从载荷省略（外链作品仍必填链接）。API 侧对应键整体省略，类型随之改可选，渲染兜底——作者位回退显示所有者用户名（再退「佚名」），描述段与「开始体验」入口缺省不渲染；无链接的 virtual 作品降级直接报错而非拼空外链。附最小夹具与 e2e 覆盖。

## [0.11.1] - 2026-09-29

### Fixed / 修复

- Static-site works that navigate with forms now run: the embedded play frame's sandbox includes `allow-forms` (a `<form action="query.html" method="get">` search page no longer gets blocked), and the runtime CSP's `form-action` is relaxed from `'none'` to `'self'` so same-origin submissions go through while cross-origin form targets stay blocked. The sandbox already granted `allow-scripts`, so neither relaxation adds a new cross-origin send capability. The invalid `allow-fullscreen` sandbox flag (never part of the HTML spec; fullscreen is governed by the iframe's Permissions Policy `allow` attribute and the `allowfullscreen` attribute) is removed, silencing the browser's invalid-flag console error. The now-redundant legacy `allowfullscreen` attribute is dropped as well (the `allow` attribute takes precedence over it, so keeping both only produced a console warning). Unit tests pin the full sandbox flag set and the `form-action` directive.
- 以表单导航的静态站作品现在可以运行了：内嵌游玩 iframe 的 sandbox 补上 `allow-forms`（`<form action="query.html" method="get">` 检索页不再被浏览器阻止），运行时 CSP 的 `form-action` 由 `'none'` 放宽为 `'self'`——放行同源提交、继续阻断跨域表单目标。sandbox 本就授予 `allow-scripts`（等价跨域发送能力已存在），两处放宽均不扩大威胁面。同时移除了无效的 `allow-fullscreen` sandbox 旗标（HTML 规范从未收录，全屏由 iframe 的 Permissions Policy `allow` 属性与 `allowfullscreen` 属性管辖）——浏览器不再报 invalid flag。`allow` 属性优先于旧式 `allowfullscreen`，后者已纯属冗余（并存只会在控制台产生 warning），一并移除；新增 GameHost 组件测试钉住 iframe 的 allow 属性含 fullscreen 且无 allowfullscreen。单测分别钉住完整 sandbox 旗标集合与 `form-action` 指令。

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

