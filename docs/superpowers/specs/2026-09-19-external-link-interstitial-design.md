# 外链跳转提示页（中间页）设计文档

2026-09-19 · 状态：待评审 · 关联：本仓 `2026-09-17-webgame-collection-design.md`（目录站与详情页）、`2026-09-17-game-runtime-design.md`（站内可玩运行时）

## 1. 背景与目标

现状：详情页的「开始游戏」与作者主页都是直接 `<a target="_blank" rel="noopener noreferrer">` 外链，文档正文里的外链由 markdown-it 渲染后**直接离开本站**（连 `target`/`rel` 都没加）。用户在不被告知的情况下被送到第三方页面，站点也没有任何免责提示。

目标：

- 所有**外链**（离开本站的链接）统一经过一个站内中间页，用户明确点击确认后才真正离开
- 按用途分两套文案：
  - **游戏版**（`kind=game`）：说明游戏由第三方提供、内容可能与收录时不同、违规/侵权可向本站反馈等免责内容
  - **普通版**（`kind=link`）：常见第三方链接提示
- 中间页只做提示与转发，**不自动跳转**、不引入第三方脚本、不加载统计
- 参数处理安全：只允许 `http:`/`https:` 绝对地址，拒绝 `javascript:`/`data:` 等协议注入与相对路径，防被当成开放重定向跳板

## 2. 非目标（本期不做）

- 目标站点可用性预检（不发起服务端 HEAD 请求，不做"链接可能已失效"提示）
- "记住我的选择 / 不再提示"（免责声明不应被一键绕过，见 §3）
- 外链点击统计、转化埋点、风控黑名单
- 站内可玩游戏（`runtime` 走 SW 虚拟源/C 模式）的入口流程变更
- 数据 schema 变更（`game.url`、`author.url` 语义不变）

## 3. 设计决策摘要

| 决策 | 结论 | 原因 |
|---|---|---|
| 覆盖范围 | 站内**所有**外链统一走中间页 | 一致体验；避免"有些链接偷偷离站" |
| 判定方式 | 按 URL 是否为同源判定，而非按组件逐个改 | 文档正文（含 `linkify` 裸 URL）也能一并覆盖 |
| 路由形态 | 站内路由 `/out?to=<encoded>&kind=game|link` | 可被任何入口复用；SPA 内导航，无服务端改动 |
| 打开方式 | 入口链接 `target="_blank" rel="noopener"`，中间页在新标签打开 | 不打断当前浏览；沿用现有 `game.url` 的行为 |
| 继续方式 | 「继续访问」按钮 → `location.replace(target)` | 用户点击才离开；中间页不留历史，从目标站按返回键回到站内原页 |
| 自动跳转 | **不做**（无 meta refresh、无 `setTimeout` 跳转） | 免责提示的意义在于用户确实看到 |
| 记忆开关 | **不做**"不再提示" | 同上，避免免责被绕过 |
| 协议白名单 | 仅 `http:`/`https:` 绝对地址 | 防 `javascript:`/`data:`/`file:` 注入；解析失败即拒绝 |
| 同源链接 | 不走中间页，直接站内导航 | 防误用与自我循环 |
| 展示内容 | 以目标 `host` 为主，完整 URL 折行可复制 | 让用户能识别 `github.com.evil.com` 这类欺骗性域名 |
| 反馈渠道 | 邮箱 `xingfen.fendy@outlook.com` + 站内「关于本站」`/docs/about` | xf 定；关于页已有"权利人可提 issue/PR 移除"流程 |

## 4. 路由与触发范围

### 4.1 路由

- 路径：`/out`
- query：
  - `to`（必填）：目标绝对 URL，完整 URL 编码
  - `kind`（可选）：`game` | `link`，缺省 `link`，非法值按 `link` 处理
- 该路由不进入任何"需登录"守卫；无 `next` 语义（它本身不是站内内容页）

### 4.2 覆盖的入口

| 入口 | 现状 | 改动后 |
|---|---|---|
| 详情页「开始游戏」（`game.url`） | 直接 `target="_blank"` 外链 | `/out?kind=game&to=…` |
| 详情页作者主页（`author.url`） | 直接 `target="_blank"` 外链 | `/out?kind=link&to=…` |
| 文档正文外链（markdown 链接 + `linkify` 裸 URL） | 同标签直接离站，无 `rel` | 渲染期统一改写为 `/out?kind=link&to=…`，并补 `target="_blank" rel="noopener"` |
| 站内其它外链（关于页/页脚等后续新增） | — | 一律经统一改写入口 |

实测补充：当前 `src/docs/*.md` 与各组件/视图里**没有任何外链**（全站 `target="_blank"` 只出现在 `GameView.vue` 两处）。文档正文的改写规则因此是**面向后续内容的防护**，不是对现存链接的修复。

### 4.3 判定规则

入口层面的前提：详情页**站内可玩**（`playable`，走 `GameHost`）的游戏本来就不渲染外链按钮，「开始游戏」的中间页只作用于 `v-else` 的外链按钮；两种形态不会同时出现。

`isExternalHref(href)`：解析为绝对 URL 且 `origin !== location.origin` 时视为外链；以下情形**不**算外链、不做改写：

- 站内路由路径与锚点（`/games/x`、`#toc`、空值）
- 相对路径（`./x`、`x.md`）——它们在本站内解析
- `mailto:` / `tel:`：不套中间页（不是"离站浏览"，且套上会破坏邮件客户端唤起）
- 协议相对地址（`//evil.com`）**算外链**：`new URL('//evil.com', location.href)` 解析为当前协议 + 该 host，跨源，走中间页

## 5. 参数与安全

- `to` 必须能被 `new URL()` 解析为绝对地址，且 `protocol` ∈ {`http:`, `https:`}；否则渲染**错误态**（「链接无效」+ 返回按钮），绝不做任何跳转
- 明确拒绝：`javascript:`、`data:`、`blob:`、`file:`、`vbscript:`、相对路径、空值、超长（> 2048 字符视为无效）
- 目标与当前站点**同源**时：不显示中间页，直接 `router.replace()` 到站内路径
- 页面展示一律文本插值（Vue 默认转义），不渲染来自 `to` 的任何 HTML
- 页面不加载任何第三方脚本/字体/图片；不写入 `document.referrer` 相关逻辑
- 错误态与正常态都不把 `to` 写进页面标题或 meta

## 6. 文案与内容

### 6.1 游戏版（`kind=game`）

- 标题：即将前往第三方站点开始游戏
- 正文：
  > 该游戏由第三方提供并托管在其站点，本站仅收录链接与介绍。
  > 游戏内容**可能与其被收录时不同**，也可能随时变更、下架或停止服务；内容、版权与数据均由第三方负责，与本站无关。
  > 如发现违规、侵权或不适内容，请通过 xingfen.fendy@outlook.com 反馈，或查看「关于本站」了解处理流程，我们会尽快核实处理。
- 目标行：目标站点：`<host>`
- 按钮：「继续访问」/「返回」

### 6.2 普通版（`kind=link`）

- 标题：即将离开本站
- 正文：
  > 你将前往第三方站点，其内容与隐私政策由该站点负责，本站无法控制亦不承担责任。请确认链接可信后再继续。
- 目标行：目标站点：`<host>`
- 按钮：「继续访问」/「返回」

### 6.3 错误态（`to` 非法）

- 标题：链接无效
- 正文：该链接地址不合法，已阻止跳转。请返回上一页，或联系站点维护者。
- 只有一个按钮：「返回」
- 邮箱在页面上以 `mailto:` 形式可点击；「关于本站」链向站内 `/docs/about`

### 6.4 关于页同步

`src/docs/about.md` 的免责声明补一句邮箱反馈渠道，与中间页口径一致（现在只写了"提交 issue 或 PR 移除"）。

## 7. 交互与视觉

- 入口链接（`GameView.vue` 两处 + markdown 改写出的链接）：`<a href="/out?kind=…&to=…" target="_blank" rel="noopener">` —— 新标签打开，当前页（目录/文档）不被打断
- 「继续访问」：`window.location.replace(target)`（`replace` 不新增历史项，中间页因此不留在历史里）
- 「返回」：`history.back()`；无历史可回时 `router.replace('/')`。中间页固定在新标签打开，该标签的历史里只有中间页这一项，因此实际表现是回到站内首页——这是**有意接受的确定性行为**；**不使用 `window.close()`**：各浏览器对非脚本打开的标签限制不一，失败时静默无反应，比回首页更糟
- **Referrer 策略**：用 `location.replace` 离开会让目标站收到 `Referer: <本站>/out?to=…`，原本入口上的 `rel="noreferrer"` 因此丢失。本期**不抑制**：`location.replace` 无法按次设置 `referrerpolicy`，而在 `index.html` 全局加 `<meta name="referrer">` 会波及整个 SPA 的所有导航与子资源。中间页 URL 不含隐私信息，且目标站本就知道自己的地址
- 键盘可达：两个按钮为原生 `<button>`/`<a>`，Tab 顺序为 继续访问 → 返回；错误态只有一个按钮
- 视觉沿用平面海报令牌（`.lift`、`.btn-ink`、零渐变、全直角），与现有 `StatePanel` 的错误态风格一致
- 中间页为独立全页视图（`views/OutboundView.vue`），复用 `AppHeader`/`AppFooter`

## 8. 代码组织

```
src/app/
├── lib/externalLink.ts        # isExternalHref / toInterstitial / parseTarget（纯函数）
├── lib/externalLink.test.ts
├── lib/markdown.ts            # 渲染期改写 <a>（link_open 规则）为 /out?kind=link&to=…
├── lib/markdown.test.ts       # 追加改写用例（既有文件）
├── views/OutboundView.vue     # 中间页（三种态：game / link / invalid）
├── views/GameView.vue         # 两处外链 <a> 改经 toInterstitial()（既有文件）
└── router/index.ts            # + { path: '/out', name: 'outbound', component: OutboundView }
```

另需改动：`src/docs/about.md` 免责声明补邮箱反馈渠道（见 §6.4）。

- `externalLink.ts` 只依赖 `URL` 与 `location`（location 以参数注入，便于测试）
- 详情页两处 `<a>` 改为经 `toInterstitial()` 生成 href；文档渲染改写集中在 `markdown.ts` 一处
- 不新增依赖

## 9. 测试与验收

### 9.1 单测（vitest）

- `isExternalHref`：同源绝对地址（→ 否）/ 跨域 http(s)（→ 是）/ 协议相对 `//evil.com`（→ 是）/ 站内路径与锚点 / 空值 / `mailto:`（→ 否）/ 非法串
- `toInterstitial`：正确编码（目标 URL 自带 query 与 `&`、`#`、中文、空格）；`kind` 缺省与非法值归一
- `parseTarget`：`javascript:`、`data:`、`file:`、相对路径、空值、超长 → 无效；`http`/`https` → 通过；`host` 提取（含端口、IDN）
- 同源目标：返回"直接导航"结果而非中间页
- markdown 渲染：外链改写为 `/out?kind=link&…`，站内链接与锚点**不**被改写

### 9.2 e2e（Playwright）

- 详情页点「开始游戏」→ 出现游戏版免责文案与目标 host → 点「继续访问」→ 断言离开本站（`page.route` 拦截目标域，或断言 `page.url()`）
- 文档正文外链 → 普通版文案
- 直接打开 `/out?to=javascript:alert(1)` → 错误态、无跳转
- 直接打开 `/out`（无 `to`）→ 错误态

### 9.3 验收命令

- `npm run check`（vitest + `vue-tsc` + `vite build`）
- `npm run e2e`

## 10. 风险与已知限制

- 中间页只是**告知**，阻止不了用户点「继续访问」；也不替代上架审核与内容治理
- 新标签打开意味着中间页与该标签的历史绑定：`location.replace` 让目标站成为该标签的历史项，返回键回到站内原页
- 无法感知目标站点内容变化、下架或跳转链（`game.url` 指向的页面自己再跳转或注入内容，本站不可控）
- 文档作者仍可写 `mailto:`/相对路径绕过中间页（按设计如此），不属于漏洞
- 免责文案不构成法律意见；如需正式条款，后续由法务审阅后替换文案

## 11. 后续（不在本期）

1. 外链可用性预检（发布流水线里做 HEAD 检查，标记失效链接）
2. 按需给高风险域名加"可信度提示"分级
3. 中间页 A/B（是否默认新标签）与可配置的"不再提示"（若要，需先评审免责诉求）
