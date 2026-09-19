# crearte 落地页设计文档

2026-09-19 · 状态：待评审 · 关联：本仓 `2026-09-17-frontend-redesign-poster-design.md`（平面海报风格与令牌）、`2026-09-17-webgame-collection-design.md`（目录站与详情页）、`2026-09-19-external-link-interstitial-design.md`（外链中间页，`mailto:` 规则与本文一致）

## 1. 背景与目标

现状：`/` 直接是游戏目录（`views/HomeView.vue`：页头 + 筛选侧栏 + 搜索 + 卡片网格）。访客进站第一眼看到的是一个搜索框和几张卡，**没有任何可见文案说明这站是什么**——目录页的 `<h1>` 是 `sr-only` 的「crearte · 游戏目录」，页脚那句「数据来自社区 PR 收录」在屏幕最下方。

线上实际只有 **4 款**收录（`2048`、`a-dark-room`、`arclight-nightcast`、`case-files`，`addedAt` 全为 `2026-09-17`）。这个量级下，进站即目录尤其显得空。

目标：

- 新增独立**落地页**挂在 `/`，一屏内讲清"这站是什么、怎么玩、怎么投稿"
- 现有目录**整体挪到 `/games`**，交互一行不改（筛选、搜索、抽屉、空态全部保留）
- 落地页 = 静态 hero + 数据推导的精选 + 两个静态入口卡；**任何数据状态都保证 hero 与入口卡可见**
- 沿用平面海报令牌（零渐变、全直角、硬阴影），不新增依赖，`src/app/data/**` 一行不改

## 2. 非目标（本期不做）

- 不改目录页的任何交互与呈现（筛选、搜索、抽屉、分页、卡片）
- 不做服务端渲染 / 预渲染 / SEO 元信息（仍是纯 SPA，`/` 与 `/games` 都是前端路由）
- 不做专题、合集、榜单等新内容形态；不做轮播、动画、渐变
- 不做人工配置精选（按 `type` 均衡取样，见 §5）
- 不做老 URL 重定向（`/` 语义变更属有意行为，见 §11）
- 不改 `GameSummary` / `GamesIndex` schema，不改 `src/app/data/**`
- 不改页脚的文案与结构

## 3. 设计决策摘要

| 决策 | 结论 | 原因 |
|---|---|---|
| 落地页形态 | 海报式：居中三层刊头 hero + 精选网格 + 投稿/文档双卡 | 收录量少时，文字主导的封面比卡片墙更不显空 |
| hero 主视觉 | `crearte`（Playfair 900）+ 大字距 `STATIC WEB GAMES` + 分隔线 + 中文定位语 | 品牌、定位、站内展示字体三样都占住；标语与页脚同一串，前后呼应 |
| 目录位置 | 原 `HomeView` 重命名 `CatalogView`，挂 `/games` | 语义对齐；它本来就不是"首页" |
| 精选来源 | 从 `repo.listGames()` 推导，**按 `type` 轮转均衡取样**，上限 6 | 避免同类型扎堆；零维护，不碰数据层 |
| 精选呈现 | 复用现有 `GameCard` | 与目录页同一套卡片，不新造呈现 |
| 数据失败时 | 只有精选区受影响；hero / 双卡 / 页脚**始终渲染** | 落地页是入口，不能因接口抽风变白页 |
| 精选区三态 | 复用现有 `StatePanel`（骨架 / 错误 + 重试 / 正常 slot） | 站内已有组件，不新造状态机 |
| 落地页 `h1` | hero 的 `crearte` 用**可见** `<h1>` | 落地页需要可见一级标题；目录页维持原 `sr-only` h1 不变 |
| 页头贴纸 | 落地页与目录页都显示「共 N 款」 | 定稿预览如此；贴纸是"收录规模"徽标，落地页也该有 |
| 导航激活 | 落地页上「游戏 / 文档」都不激活 | 落地页不是目录；导航里不新增「首页」项（品牌贴纸即回首页） |
| CHANGELOG | `0.5.0` | master 现为 `0.4.1`；`0.3.0` 已被 `integration/backend` 占走 |

## 4. 路由与页面结构

### 4.1 路由

| 路径 | 变更 | 组件 | 路由 `name` |
|---|---|---|---|
| `/` | 新落地页 | `views/LandingView.vue`（新增） | `home` |
| `/games` | 目录（原 `/` 的内容） | `views/CatalogView.vue`（由 `HomeView.vue` 重命名） | `catalog` |
| `/games/:id` | 不变 | `views/GameView.vue` | `game` |
| `/docs`、`/docs/:slug` | 不变 | `views/DocsView.vue` | `docs` / `doc` |
| `/out` | 不变 | `views/OutboundView.vue` | `outbound` |
| `/:pathMatch(.*)*` | 不变 | `views/NotFoundView.vue` | `not-found` |

- 路由 `name` 只在两处变了：`/` 从目录变落地页（仍叫 `home`），目录新占 `catalog`
- **不做重定向**：`/` 不再渲染目录，老书签会看到落地页（见 §11）

### 4.2 页面区块（自上而下）

| 区块 | 数据依赖 | 数据未就绪 / 失败时 |
|---|---|---|
| `AppHeader` | 收录数（既有逻辑） | 贴纸回落 `STATIC WEB GAMES`（现有行为） |
| hero | 无（静态文案） | **始终渲染** |
| └ 统计条（hero 内） | `games` | 整条隐藏，不显示假数字 |
| 精选区 | `games` | `StatePanel` 三态（§6） |
| 投稿入口卡 / 文档入口卡 | 无（静态链接） | **始终渲染** |
| `AppFooter` | 无 | 始终渲染 |

hero 内部自上而下：

1. `<h1>crearte</h1>`（`--font-display`，Playfair 900）
2. `<p>STATIC WEB GAMES</p>`（`--font-mono`、`letter-spacing` 大字距）
3. 短分隔线（3px `ink`，居中）
4. `<p>` 定位语（`--font-sans`）
5. 双 CTA：「进入游戏目录」（主）/「关于本站」（次）
6. 统计条（等宽字体、小字距）

### 4.3 页头导航与激活态

`AppHeader.vue` 现在只有一个 `onCatalog = (route.name === 'home')`，同时管**导航激活**与**贴纸**两件事。目录改名后必须拆成两个判定：

- `onCatalog`（导航激活）：`route.name === 'catalog'` → 「游戏」只在 `/games` 激活；落地页上两项导航都不激活；详情页 `/games/:id` 仍不激活（行为不变）
- 「游戏」的 `to` 从 `/` 改为 `/games`：否则该导航项点下去回的是落地页，而它只在 `catalog` 路由激活，等于永远不亮
- `showGameCount`（贴纸）：`route.name === 'catalog' || route.name === 'home'` → 落地页与目录页都显示「共 N 款」；文档页仍显示「共 N 篇」
- 「文档」判定 `onDocs` 不变；品牌 `crearte` 贴纸仍指 `/`
- 落地页上 `AppHeader` 会取一次 `repo.listGames()`（与落地页自身请求同源，`staticRepo` 有 `cachedGames` 缓存，**不产生第二次网络请求**）

### 4.4 指向目录的其它链接

`/` 的语义从「目录」变成「落地页」，所有**指向目录**的既有链接必须一并改到 `/games`，否则标签与实际落点不符：

| 位置 | 现状 | 改动后 |
|---|---|---|
| `AppHeader.vue` 导航「游戏」 | `to="/"` | `to="/games"` |
| `GameView.vue` 未找到分支的「返回目录」 | `to="/"` | `to="/games"` |
| `GameView.vue` 详情页顶部的「返回目录」 | `to="/"` | `to="/games"` |
| `NotFoundView.vue` 的「返回目录」 | `to="/"` | `to="/games"` |
| `GameView.vue` 站内运行时的「退出游戏」（`onExit` → `router.push('/')`） | 回目录 | `router.push('/games')` |
| `AppHeader.vue` 品牌 `crearte` 贴纸 | `to="/"` | **不变**（落地页就是首页） |
| `OutboundView.vue` 的 `goBack()` 无历史兜底 `router.replace('/')` | 回站内首页 | **不变**（语义是「回首页」，不是「回目录」） |

**验收判据是语义而非 `grep`**：导航不一定写在模板里——`router.push('/')` 这类程序化导航，`grep 'to="/"'` 是看不见的。判据是「凡是语义为『回目录』的导航都指向 `/games`」，不是「`grep` 只剩一处」。

落地页自身的两个入口（hero 主 CTA「进入游戏目录」、精选区「查看全部 N 款 →」）本来就指向 `/games`。

## 5. 精选规则

新增纯函数模块 `src/app/lib/featured.ts`，只依赖 `GameSummary` 类型与 `GAME_TYPES` 常量，无 IO、无 `location`：

```
pickFeatured(games: GameSummary[], limit = 6): GameSummary[]
```

规则：

1. 按 `type` 分组
2. 组内排序：`addedAt` 倒序；`addedAt` 相同按 `id` 升序（保证确定性，不吃数据返回顺序）
3. 组顺序：按 `GAME_TYPES` 常量顺序（`puzzle, action, idle, strategy, simulation, narrative, music, creative, casual, other`）；schema 之外的未知 `type` 排在已知类型之后，按 `type` 名字典序
4. **轮转取样**：第 1 轮依次取每组第 1 款，第 2 轮取每组第 2 款……直到取满 `limit` 或取完
5. 返回**新数组**，不修改入参；`limit <= 0` 返回 `[]`

当前线上数据（4 款）的分组与结果：

- `puzzle[2048, case-files]`、`idle[a-dark-room]`、`narrative[arclight-nightcast]`
- 第 1 轮 `2048` → `a-dark-room` → `arclight-nightcast`；第 2 轮 `case-files`
- 最终顺序：`2048 → a-dark-room → arclight-nightcast → case-files`

统计条三个数（视图内 computed，同一份数据）：

- 收录数：`games.length`
- 类型数：去重 `type` 数
- 更新日：`max(addedAt)`，按 `YYYY-MM-DD` 原样显示

## 6. 数据流与状态

- `LandingView.vue` 用既有 `useAsync<GameSummary[]>(() => repo.listGames())`，与 `CatalogView` 同一套（`data` 初始为 `null`、`loading` 初始为 `true`）
- `featured = computed(() => pickFeatured(games.value ?? []))`
- `stats = computed(...)`：`games.value` 为 `null` **或空数组**时返回 `null` → 统计条整条隐藏（收录 0 款时显示「收录 0 款」比不显示更糟）
- 精选区：

```
<StatePanel :loading="loading" :error="error" @retry="reload">
  <div v-if="featured.length" class="grid …">GameCard ×N</div>
  <div v-else>还没有收录游戏。</div>
</StatePanel>
```

- 空态与目录页的空态措辞一致（目录页现有文案即「还没有收录游戏。」）
- 「查看全部 N 款 →」只在 `featured.length > 0` 时渲染（避免出现「查看全部 0 款」）
- **错误态的兜底是 hero 的主 CTA**（「进入游戏目录」始终可见），不在 `StatePanel` 的错误框里重复塞一个同义按钮
- hero 文案写成视图内的 `const` 常量，不引入 i18n 层

## 7. 文案与内容

hero：

- `<h1>`：`crearte`
- 标语：`STATIC WEB GAMES`（与页脚、页头贴纸同一串）
- 定位语：`收集可直接开玩的静态网页游戏 · 打开即玩、无需安装`
- 主 CTA：`进入游戏目录` → `/games`
- 次 CTA：`关于本站` → `/docs/about`
- 统计条：`收录 {n} 款` · `{m} 种类型` · `更新 {YYYY-MM-DD}`

精选区：

- 标题：`精选 · SELECTED`
- 出口：`查看全部 {n} 款 →` → `/games`
- 空态：`还没有收录游戏。`

投稿入口卡：

- 标题：`想被收录？`
- 正文：`提交 issue 或 PR，也可以发邮件到 xingfen.fendy@outlook.com`
- 邮箱渲染为可点 `mailto:` 锚点，与 `OutboundView.vue` 现有写法一致；**`mailto:` 不套 `/out` 中间页**（规则见中间页规格 §4.3）

文档入口卡：

- 标题：`文档`
- 正文：`收录标准、投稿方式与本站说明`
- 指向 `/docs`

## 8. 交互与视觉

- 全部沿用平面海报令牌：主 CTA 用 `.btn-ink`、次 CTA 用 `.btn-surface`，卡片沿用 `shadow-hard` + `.lift`；零渐变、全直角由 `app/lib/no-gradient.test.ts` 守卫
- 字体：hero 大标题用 `--font-display`（`@font-face` 只声明了 **900** 一个字重，大字必须用 900）；标语与统计条用 `--font-mono`；定位语与卡片正文用 `--font-sans`
- 响应式：hero 大标题 `text-4xl sm:text-5xl md:text-6xl`（要求窄屏不溢出、不折断 `crearte` 这一串）；标语固定 `text-[0.6875rem]` + `tracking-[0.3em]`（与页头贴纸同级）；定位语 `text-sm`；精选网格沿用目录页断点 `sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`；投稿/文档双卡窄屏堆叠、`sm` 起并排（`sm:grid-cols-2`）
- 无障碍：全页唯一 `<h1>`（可见，即 hero 的 `crearte`）；精选区标题为 `<h2>`，双卡标题为 `<h3>`；标语与定位语为 `<p>`
- 键盘可达：两个 CTA 与所有卡片均为原生 `<RouterLink>` / `<a>`，Tab 顺序即视觉顺序
- 落地页**不引入**新的装饰元素（不加 photo、不加底色块、不加纹理）

## 9. 代码组织

```
src/app/
├── lib/featured.ts            # pickFeatured（纯函数，新增）
├── lib/featured.test.ts       # 新增
├── views/LandingView.vue      # 落地页（新增）
├── views/CatalogView.vue      # 目录（由 HomeView.vue 重命名，内容不改）
├── components/AppHeader.vue   # onCatalog / showGameCount 拆分 + 导航「游戏」改指 /games（既有文件）
├── views/GameView.vue         # 两处「返回目录」改指 /games（既有文件）
├── views/NotFoundView.vue     # 「返回目录」改指 /games（既有文件）
└── router/index.ts            # / → LandingView、/games → CatalogView（既有文件）
```

另需改动：

- `e2e/landing.spec.ts`（新增）
- `docs/CHANGELOG.md` 记 `0.5.0`（Changed：新增落地页、目录挪到 `/games`）

约定：

- `HomeView.vue` 重命名后**内容一行不改**（仍含 `sr-only` h1「crearte · 游戏目录」、筛选侧栏、搜索、抽屉、空态）
- `featured.ts` 不含任何视图/DOM 依赖，可在 node 环境直接单测
- 不新增依赖；`src/app/data/**` 一行不改
- 分支：从 `master` 切 `feat/landing-page`；完成后 `git merge --no-ff` 合回 `master` 并删分支

## 10. 测试与验收

### 10.1 单测（vitest，新增 `featured.test.ts`）

- 空数组 → `[]`
- 单一类型多款 → 组内按 `addedAt` 倒序、并列按 `id` 升序，截断到 `limit`
- 多类型 → 轮转顺序符合 `GAME_TYPES` 顺序（用固定夹具断言**精确顺序**，不只断言数量）
- `addedAt` 全部相同时 → 结果稳定：同一输入调用两次结果一致，且与入参顺序无关
- 超过 `limit` → 截断；`limit <= 0` → `[]`
- 不修改入参（调用前后深比较）
- 未知 `type`（schema 之外）→ 排在已知类型之后

### 10.2 e2e（Playwright，新增 `landing.spec.ts`）

- `/` 是落地页：可见 `<h1>` 文本为 `crearte`；定位语可见；主 CTA 存在
- 统计条文案含 `收录 N 款`（N = 夹具总数）
- 精选卡片数 = `6`（上限截断）；e2e 数据由 `build-data.mjs --with-fixtures` 产出（真实 4 款 + 夹具，收录数 > 6），因此必然被截断到 6
- 卡片顺序等于 `pickFeatured(该夹具数据)` 的结果——**不能照抄 §5 里线上 4 款的示例**，§5 那段只用于说明规则
- 点「进入游戏目录」→ URL 为 `/games`，且目录的搜索框可见
- 页头导航「游戏」在 `/` 与 `/games` 上的 `href` 均为 `/games`（防它退回指向落地页）
- `/games/2048`（详情页）与未知路径（catch-all 落到 `NotFoundView`）上的「返回目录」`href` 为 `/games`
- `/games/does-not-exist`（详情页的「游戏不存在」分支）上的「返回目录」`href` 为 `/games`
- `GameView.vue` 的「退出游戏」（`onExit`）改走 `/games`：这需要跑站内运行时，不做 e2e，由代码审查覆盖
- 点「查看全部 N 款 →」→ 同上
- 投稿卡邮箱：断言锚点 `href` 以 `mailto:` 开头（**不点击**，避免唤起邮件客户端），且**未**被改写成 `/out`
- 数据失败：`page.route` 拦 `/data/index.json` 返回 500 → 断言 hero 文案与双卡**仍在**、精选区显示错误态与重试按钮
- 空数据：拦 `/data/index.json` 返回空 `games` → 断言精选区空态文案、统计条隐藏

### 10.3 对既有测试的影响

- 实测（`grep` 全部 `e2e/*.ts`）：**现有 e2e 没有一条断言 `/` 是目录**——所有游戏用例直接访问 `/games/:id`（见 `e2e/helpers.ts`），`outbound.spec.ts` 只断言 `/out` 与 `/docs/about`
- 因此本轮**无需迁移既有 e2e**，只需新增落地页用例
- 说明：设计讨论期间曾判断"既有 e2e 中断言 `/` 是目录的用例要搬到 `/games`"，与实际不符，按实测更正

### 10.4 验收命令

- `npm run check`（vitest + `vue-tsc` + `vite build`）
- `npm run e2e`

## 11. 风险与已知限制

- **`/` 语义变更**：老书签或指向 `/` 的外链会落到落地页而不是目录，多一次点击。本期不做重定向（落地页主 CTA 直达目录，代价可接受）
- **文件重命名会影响并行分支**：`HomeView.vue` → `CatalogView.vue` 且 `/` 路由换主，`integration/backend`（账号系统线）下次合 master 时会在这两处产生冲突，需要它自行解决
- 「均衡」只保证类型轮转，不保证质量；上限固定 6，收录增长后是否需要调整要再人工判断
- 落地页不参与筛选/搜索，重度用户每次多一跳（有意为之：目录归 `/games`）
- 数据失败时落地页只剩静态内容 + 双卡，属可接受降级；hero 的统计条会消失（不显示假数字）
- Playfair Display 仅 900 一字重，hero 大字不能用其他字重（会回落系统衬线）

## 12. 后续（不在本期）

1. 老 URL 兼容：若出现指向 `/` 的目录深链或 `?filter=` 参数，再考虑重定向或参数透传
2. 落地页 SEO：预渲染 `/` 与 `/games` 的静态 HTML，补 meta
3. 精选上限可配置：数据里加 `featured` 标记，或按 `tags` 提升权重
4. 「最近更新」区块与站点 RSS
