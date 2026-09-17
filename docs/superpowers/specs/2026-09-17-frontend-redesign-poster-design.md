# webgame-collection 前端视觉重设计：平面海报（直角 · 无渐变）

2026-09-17 · 状态：待评审 · 本文档取代 `2026-09-17-webgame-collection-design.md` 的 §7.5 视觉部分

## 1. 背景与目标

现状：深色 neutral 底 + violet 强调的通用目录站外观；封面兜底使用 `hsl()` 双色渐变；无品牌识别。

本次重设计以「平面海报 / 印刷目录」为视觉语言重建全部界面：

- 浅色纸质底（奶白 `#F7F2E7`）+ 墨色描边 + 高饱和实色块 + 硬阴影
- **严禁渐变色彩**：任何 CSS 渐变函数、`repeating-*` 均不可出现，并纳入 CI 守卫
- **全站直角**：不使用任何 `border-radius`
- 西文展示字体自托管（Playfair Display 900），运行时零外部字体请求
- 信息架构不变（路由、数据层、筛选/排序/搜索算法、schema 全部不动）

成功标准：目录页 / 详情页 / 文档页 / 状态页视觉统一且具「收藏馆」气质；"无渐变"与"全直角"是可自动验证的约束；`npm run check` 全绿。

## 2. 非目标（本期不做）

- 暗色模式（只做浅色；`color-scheme: light` 固定）
- 站内试玩 / iframe 内嵌（见 `2026-09-17-game-runtime-design.md`）
- 中文字体子集化、封面图自动生成、动效库（GSAP 等）
- 数据层、路由、筛选/排序/搜索逻辑、字段 schema 的改动
- 文档内容改写

## 3. 设计语言

### 3.1 配色

| 令牌 | 值 | 用途 | 对比度（与纸底 `#F7F2E7`） |
|---|---|---|---|
| `paper` | `#F7F2E7` | 页面底色 | — |
| `surface` | `#FFFFFF` | 卡片 / 输入 / 侧栏面板 | — |
| `ink` | `#141414` | 正文、描边、深色块 | 16.8:1 |
| `ink-soft` | `#5C584D` | 次级文字（描述、元信息） | 6.4:1 |
| `ink-faint` | `#6F6A5C` | 占位符、装饰性小字 | 4.8:1 |
| `accent` | `#E8552F` | 块面红：选中标线、装饰方块、CTA 硬阴影 | 装饰用（不作正文） |
| `accent-ink` | `#C03A1B` | 文字红：链接、可点击的红色小字 | 4.9:1 |
| `highlight` | `#F5C518` | 高亮黄：选中态底色、加粗记号笔 | 其上放 `ink` 文字 = 11.5:1 |
| `info` | `#2B62CC` | 信息蓝（文字级） | 5.1:1 |
| `success` | `#2FA46A` | 成功态 | 3.1:1（仅色块/图标，不作正文） |

规则：红只有一个语义（强调与可点击），黄只有一个语义（当前选中）；所有正文与链接对比度 ≥ 4.5:1。

### 3.2 字体

| 角色 | 字体栈 | 用法 |
|---|---|---|
| `font-display` | `"Playfair Display", system-ui, "PingFang SC", "Microsoft YaHei", sans-serif` | 西文与数字（含游戏名中的拉丁部分）用 Playfair 900；中文按字符回退到系统黑体，字重同为 900，混排视觉重量一致 |
| `font-sans` | `system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif` | 正文、UI 文案 |
| `font-mono` | `ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace` | 元数据、计数、日期、时长、排序控件、标签 |

字号阶梯：

| 名称 | 规格 |
|---|---|
| display-1 | `clamp(2.25rem, 6vw, 3.25rem)` / 900 / 行高 1.05（404 巨字） |
| display-2 | `2.125rem` / 900 / 行高 1.1（详情页游戏名） |
| display-3 | `1.625rem` / 900（文档页 h1） |
| 卡片标题 | `0.875rem` / 900（西文 Playfair 900 / 中文系统 900） |
| 正文 | `0.875–0.9375rem` / 行高 1.8 |
| 元数据 | `0.6875rem` mono / 字距 0.05em |
| 分节标签 | `0.625rem` / 800 / 字距 0.2em / 全大写或加空格 |

字体资源（自托管，见 §7.1）：`playfair-display-900.woff2`（latin 子集，woff2，约 30–40KB），`font-display: swap`；仅标题与数字使用，正文永远是系统字体，故字体未加载时不影响阅读。

### 3.3 描边 / 硬阴影 / 直角

- 描边：常规 `2px solid ink`；强分隔（页头底、侧栏右、页脚顶、文档 h2 下划线）`3px`；微件（标签片、行内代码）`1.5px`
- 硬阴影（无模糊、无透明度）：`3px 3px 0 ink`（小件）/ `4px 4px 0 ink`（卡片、输入）/ `6px 6px 0 ink`（悬停抬起、封面大图）/ `4px 4px 0 accent`（仅详情页主 CTA）
- 直角：全站 `border-radius: 0`，包括输入框、徽章、卡片、抽屉、对话框
- 悬停/按下（只动 `transform` 与 `box-shadow`，不占布局）：
  - 悬停：`translate(-2px,-2px)`，阴影升一档
  - 按下：`translate(2px,2px)`，阴影归零
- 焦点：`:focus-visible { outline: 3px solid accent; outline-offset: 2px }`

### 3.4 间距与栅格

- 4/8 节奏：组件内 8/12，区块间 16/24，页面级 24/32
- 内容最大宽 `max-w-6xl`（72rem）保持现状；目录页主区在 `xl` 下 4 列卡片，`lg` 3 列，`sm` 2 列，移动 1 列
- 侧栏固定 `215px`（`lg` 起显示）

### 3.5 动效

- 交互过渡 `140ms ease-out`（transform + box-shadow）
- 骨架屏脉动：`1.4s` 透明度 1 → 0.5 → 1
- `prefers-reduced-motion: reduce` 时关闭全部动画与过渡（全局降级，含骨架脉动与悬停位移）

## 4. 组件规格

### 4.1 页头 / 页脚

- 页头：`3px` 底边；左侧墨色方块 logo（`ink` 底、`paper` 字、800、字距 0.04em）；导航「游戏 / 文档」当前项 `3px` 红色下划线；右侧黄色贴纸（`2px` 描边）——目录页显示「共 N 款」、文档页显示「共 N 篇」、其它路由退化为静态标语「STATIC WEB GAMES」
  - 计数复用 `repo.listGames()` / `repo.listDocs()`：仓库已按 Promise 缓存，与页面请求共享，不产生重复请求
- 页脚：`3px` 顶边；左侧 `STATIC WEB GAMES`（mono、字距 0.18em），右侧版权说明（`ink-soft`）

### 4.2 目录侧栏（桌面）与筛选抽屉（移动）

- 桌面（`lg` 起）：`surface` 底、`3px` 右边；分节标题（红、`0.625rem`、800、字距 0.22em）：类型 / 时长 / 标签；每行 = 名称 + 右对齐 mono 计数，行间 `1.5px` 虚线分隔；选中行 = 黄底 + `2px` 描边 + 加粗；底部「重置筛选」按钮（`2px` 描边 + `3px` 硬阴影）
- 计数来自完整目录（非筛选后结果）；计数为 0 的类型 / 时长 / 标签不渲染；「全部」始终显示
- 标签行沿用现有实现：按出现次数降序取前 16 个
- 移动（`< lg`）：侧栏隐藏；结果行中的「筛选」按钮打开原生 `<dialog>` 抽屉——`paper` 底、`3px` 顶边、最高 `85vh` 可滚动、右上角关闭按钮、底部「查看 N 款结果」按钮（点击即关闭，筛选实时生效）；遮罩 `rgba(20,20,20,.6)`（实色带透明度，非渐变）
- 抽屉交互：`showModal()` 自带 Escape 关闭与焦点圈定；关闭后焦点回到触发按钮
- 页头贴纸在 `< sm` 隐藏（导航与 logo 始终可见）

### 4.3 结果行

- 结构：`N 款游戏`（800）+ 贯通横线（`2px`）+ 排序控件（原生 `<select>`，mono、`2px` 描边、直角）+ 移动端「筛选」按钮（Phosphor `FunnelSimple` + 生效条件数角标）
- 排序选项沿用：最新收录 / 名称 / 时长（短到长）

### 4.4 游戏卡片

- 结构：封面（16:9）→ 类型贴纸（白底 `2px` 描边、旋转 -3°、压在封面左上）→ 名称（西文 Playfair 900 / 中文系统 900）→ 简介（两行截断，`ink-soft`）→ 标签片行（时长 + 标签，`1.5px` 描边）
- 卡片本体：`surface` 底、`2px` 描边、`4px 4px 0 ink` 硬阴影、直角；整卡是 `<RouterLink>`，焦点环可见
- 悬停抬起 / 按下压入见 §3.3

### 4.5 封面兜底（替换渐变）

- `cover.ts` 删除 `coverGradient`，新增 `COVER_COLORS`（8 色）与 `coverColor(id)`：`hashString(id) % 8` 取色，同一 id 恒定
- 调色板（白字对比度均 ≥ 4.5:1）：`#2F6DE0`、`#C03A1B`、`#1F7A4D`、`#6B4FD8`、`#B35C00`、`#0F6E6E`、`#A3256B`、`#141414`
- 兜底渲染：纯色块 + 首字（`coverInitial`，display 字体、白色、与封面同尺寸比例）+ `2px` 底边；真实封面图仍优先，加载失败回落到纯色块

### 4.6 状态组件

| 状态 | 规格 |
|---|---|
| 加载中 | 3 张骨架卡（封面区与文字条用 `#EFE9DA`，`2px` 描边），透明度脉动；容器 `aria-busy="true"`，并提供「加载中」的读屏文本 |
| 空结果 | `2px` 虚线直角「空展位」+ mono `NO MATCH · 0 款` + 说明 + 「重置筛选」按钮 |
| 加载失败 | 白面板 + 红标签条 `ERROR · 加载失败` + 错误信息 + mono 细节（数据路径、重试次数可选）+ 墨色「重试」按钮 |
| 404 | Playfair 巨字 `404` + 红色斜印章 `PAGE NOT FOUND`（`2.5px` 红描边、旋转 -6°）+ 说明 + 墨色「返回目录」 |
| 游戏不存在 | 虚线面板 + mono `GAME NOT FOUND` + 「该游戏不存在或已移除。」+ 「返回目录」 |

### 4.7 Markdown 正文

- h2：`1.125rem` / 800 / 下方 `2px` 墨线；h3：`0.9rem` / 800 / 左侧 `4px` 红竖条
- 段落 `0.875rem` / 行高 1.85；`strong` = 黄底记号笔（`highlight` 底、`ink` 字、左右 3px 内边距）
- 链接：`accent-ink` + `2px` 下划线 + 2px offset
- 列表：自定义标记——`ul` 红色 7px 方块，`ol` mono 红色序号
- 行内代码：`surface` 底 + `1.5px` 描边 + mono；代码块：`surface` 底 + `2px` 描边 + `4px` 硬阴影
- 表格：整表 `2px` 描边，表头墨底纸字，单元格 `1.5px` 底线
- 引用：左侧 `4px` 墨条 + 纸色底

## 5. 页面

### 5.1 首页（目录）

页头 → [侧栏 215px | 主区]。主区：搜索框（`2px` 描边 + `3px` 硬阴影）→ 结果行 → 卡片网格。移动端侧栏折叠为抽屉。

### 5.2 详情页

返回目录（mono、`accent-ink`）→ 大封面（`2px` 描边 + `6px` 硬阴影，16:7）→ 游戏名（display-2）→ 元数据 mono 行（作者链接 / 时长 / 收录日期）→ 简介 → 标签片 → 主 CTA「开始游戏 ↗」（`ink` 底 `paper` 字、`4px 4px 0 accent` 硬阴影、新标签外链）→ `3px` 分隔线 → Markdown 简介（§4.7）

### 5.3 文档页

页头 → [文档列表 200px | 正文 max-w 640px | 本页目录 170px]。列表项 = mono 序号 + 标题，选中项黄底 `2px` 描边；正文按 §4.7；右栏目录 `3px` 左标，当前节为红色，层级缩进。移动端：列表折叠为横向滑动标签，右栏目录隐藏。

### 5.4 404

按 §4.6 居中呈现，垂直方向留白 ≥ 25vh。

## 6. 无障碍与响应式

- 焦点：全局 `:focus-visible` 红色 3px 环；卡片/筛选行/侧栏链接全部可 Tab
- 键盘顺序 = 视觉顺序；抽屉用原生 `<dialog>`（Escape、焦点圈定、`aria-modal` 由浏览器提供）
- 触摸目标：移动抽屉行高 ≥ 44px；桌面筛选行 ≥ 36px
- 状态区分不依赖颜色：选中项 = 黄底 + 描边 + 字重；错误 = 标签条文字 + 文案
- 图标：Phosphor 统一 `weight="bold"`；纯装饰图标 `aria-hidden="true"`，独立含义图标提供可访问名（图标按钮带 `aria-label`）
- 响应式断点：`<sm` 1 列；`sm` 2 列；`lg` 3 列 + 侧栏；`xl` 4 列；手测 375 / 768 / 1280 / 1920 无横向滚动
- 结果数用 `aria-live="polite"`，筛选变化后读屏可获知命中数量
- 目标浏览器为现代常青浏览器（Chrome / Edge / Firefox / Safari 最近两个版本），原生 `<dialog>` 可用
- `prefers-reduced-motion` 全局降级；`color-scheme: light` 固定，避免系统暗色影响表单控件

## 7. 工程实现

### 7.1 依赖与资源

- 新增依赖：`@phosphor-icons/vue`（按需引入，图标集见下）
- 字体：一次性获取 `Playfair Display 900` latin 静态 woff2，提交至 `src/assets/fonts/playfair-display-900.woff2`，并附 `OFL.txt`（SIL OFL 1.1 要求随字体分发许可）
  - 获取方式：优先从 Google Fonts 直接下载一次；若外网不可达，用 `npm i -D @fontsource/playfair-display` 从包内 `files/` 复制 woff2，随后卸载该依赖
  - 运行时与构建期均不访问 Google 域名（Network 面板验收：除本站外无字体请求）
- 图标（Phosphor，`weight="bold"`）：`MagnifyingGlass`（搜索）、`FunnelSimple`（筛选）、`X`（关闭）、`ArrowsDownUp`（排序）、`ArrowSquareOut`（外链/开始游戏）、`ArrowLeft`（返回）、`WarningCircle`（错误面板）
- favicon：`src/public/favicon.svg` 重绘为直角几何标记（纸底 + 墨色描边 + 墨/黄/红三色方块），无渐变、无圆角

### 7.2 文件改动清单

新增：

- `src/assets/fonts/playfair-display-900.woff2`、`src/assets/fonts/OFL.txt`
- `src/app/components/AppHeader.vue`、`AppFooter.vue`（从 `App.vue` 拆出）
- `src/app/components/FilterSidebar.vue`、`FilterDrawer.vue`、`ResultMeta.vue`
- `src/app/lib/no-gradient.test.ts`

重写：

- `src/app/styles/main.css`（令牌、base 层、`@font-face`、`markdown-body`）
- `src/app/components/GameCard.vue`、`GameCover.vue`、`StatePanel.vue`、`DocSidebar.vue`、`DocToc.vue`
- `src/app/views/HomeView.vue`、`GameView.vue`、`DocsView.vue`、`NotFoundView.vue`
- `src/app/App.vue`（仅保留布局骨架与页头/页脚挂载）
- `src/index.html`（body 类、`color-scheme`、`theme-color`）、`src/public/favicon.svg`

删除：

- `src/app/components/GameFilters.vue`（被 `FilterSidebar` + `FilterDrawer` + `ResultMeta` 取代）
- `src/app/lib/cover.ts` 的 `coverGradient`（函数级删除）

修改：

- `src/app/lib/cover.ts`（新增 `COVER_COLORS` / `coverColor`）、`src/app/lib/cover.test.ts`
- `src/package.json`（新增依赖）

`HomeView` 需新增少量派生计算：侧栏计数（类型/时长/标签各分组）与「重置筛选」动作（`update(DEFAULT_FILTER)`）。这些是纯展示逻辑，优先放 `lib/filter.ts` 作为纯函数（如 `countByType` / `countByDuration` / `countByTag`），便于单测。

### 7.3 令牌落地（Tailwind v4）

```css
@import "tailwindcss";

@theme {
  --color-paper: #f7f2e7;
  --color-surface: #ffffff;
  --color-ink: #141414;
  --color-ink-soft: #5c584d;
  --color-ink-faint: #6f6a5c;
  --color-accent: #e8552f;
  --color-accent-ink: #c03a1b;
  --color-highlight: #f5c518;
  --color-info: #2b62cc;
  --color-success: #2fa46a;

  --font-display: "Playfair Display", system-ui, "PingFang SC", "Microsoft YaHei", sans-serif;
  --font-sans: system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
  --font-mono: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;

  --shadow-hard-sm: 3px 3px 0 #141414;
  --shadow-hard: 4px 4px 0 #141414;
  --shadow-hard-lg: 6px 6px 0 #141414;
  --shadow-hard-accent: 4px 4px 0 #e8552f;
}

@font-face {
  font-family: "Playfair Display";
  src: url("../../assets/fonts/playfair-display-900.woff2") format("woff2");
  font-weight: 900;
  font-style: normal;
  font-display: swap;
}
```

base 层：`body` 用 `bg-paper text-ink font-sans`；`::selection` 黄底；`:focus-visible` 红环；`color-scheme: light`；reduced-motion 全局降级。

### 7.4 守卫测试（把设计规则变成 CI 约束）

`src/app/lib/no-gradient.test.ts`：

- 扫描 `src/app/**/*.{vue,ts,css}`（排除 `*.test.ts`）与 `src/index.html`
- 命中任一即失败并输出「文件:行号 + 命中串」：`/gradient/i`、`/repeating-/i`、`/rounded-/i`
- 守卫自身的关键词以字符串拼接方式书写，避免自命中

### 7.5 测试更新

- `cover.test.ts`：改为断言 `coverColor(id)` 稳定、取值属于 8 色表、不同 id 色彩有分布；`coverInitial` 保留原断言
- 新增筛选计数纯函数单测（含 0 计数与边界）
- 现有 `filter.test.ts` / `markdown.test.ts` / `staticRepo.test.ts` 不受影响
- 门槛：`npm run check`（vitest + vue-tsc + build）全绿

## 8. 验收标准

- [ ] 目录 / 详情 / 文档 / 404 / 游戏不存在 / 空结果 / 加载 / 错误 全部按本规格实现，无圆角、无渐变
- [ ] 向任一组件临时加入 `rounded-lg` 或 `linear-gradient(...)` 会让 `no-gradient.test.ts` 失败（验证守卫有效）
- [ ] 侧栏与抽屉筛选实时同步 URL query；「重置筛选」清空 query 并恢复默认排序
- [ ] 侧栏计数与目录数据一致，0 计数项不渲染；结果数正确
- [ ] 键盘可完成：搜索、筛选、重置、打开/关闭抽屉、进入卡片、返回
- [ ] 375px 与 1280px 下无横向滚动、无内容被遮挡
- [ ] reduced-motion 下无脉动与位移动效
- [ ] 断网时 Playfair 回退系统字体且布局不破；Network 面板无 Google 域名请求
- [ ] `npm run check` 全绿

## 9. 与原设计文档的关系

- 本文档取代原设计 §7.5「视觉与兜底」：深色主题、violet 强调、渐变兜底封面全部作废，改为 §3–§5
- 原设计 §7.1–§7.4（技术栈、路由、筛选状态、数据抽象层）、§4–§6（数据 schema、生成数据、文档系统）、§8–§10（部署、本地验收、后端迁移）继续有效
- §7.5 提到的「空状态、加载骨架、错误重试面板」语义保留，视觉改按 §4.6
