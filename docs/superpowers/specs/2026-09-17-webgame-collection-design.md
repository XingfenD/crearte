# webgame-collection 设计文档

2026-09-17 · 状态：待评审

## 1. 项目目标

一个收集"静态网页游戏"（无需服务端、纯前端交互的游戏）的开源目录站：

- 站点本身是纯静态页面（Vue3 构建产物），无服务端依赖
- 数据源为仓库内 JSON，一游戏一文件，通过 PR 提交收录
- 数据结构严格（JSON Schema 校验），并设计数据抽象层，未来可无缝接入后端 API
- 内置 markdown 文档渲染系统，访问文档时显示文档目录（TOC）
- 部署链路：GitHub Actions 构建镜像 → 推送 GHCR → 调 keel.sh webhook → k3s 拉取并滚动更新

## 2. 非目标（v1 不做）

- 站内 iframe 试玩（一律新标签外链跳转）
- 用户账号、评分、评论、收藏
- 后端 API、服务端搜索、分页（数据量预计 < 1000，纯前端处理）
- 多语言 i18n（中文为主；schema 不预留多语言字段）
- HPA、CDN、监控（纯静态 nginx，无必要）

## 3. 仓库结构

```
webgame-collection/            # 仓库根
├─ src/                        # 完整站点工程 = 唯一构建输入
│  ├─ package.json             # npm/vite 工程在此，cd src 后 npm run dev/build
│  ├─ vite.config.ts / index.html / tsconfig.json
│  ├─ app/                     # Vue 源码
│  │  ├─ main.ts / App.vue
│  │  ├─ router/               # 路由
│  │  ├─ views/                # 页面
│  │  ├─ components/           # 组件
│  │  ├─ data/                 # 数据抽象层（repository 接口 + fetch 实现）
│  │  └─ lib/                  # markdown 渲染、筛选/排序等纯函数
│  ├─ games/                   # 游戏 JSON 数据源（一游戏一文件，PR 提交点）
│  ├─ docs/                    # 站点文档源（*.md，frontmatter: title/order）
│  ├─ assets/covers/           # 仓库内封面图（文件名 = 游戏 id）
│  ├─ schema/game.schema.json  # JSON Schema（draft 2020-12）
│  ├─ scripts/build-data.mjs   # 校验 + 生成 public/data/*
│  └─ public/                  # favicon 等手写资源；public/data/ 为生成物（gitignore）
├─ docs/                       # 只服务 GitHub 仓库，不参与站点构建
│  ├─ README.md                # GitHub 首页会自动展示 docs/README.md
│  ├─ CONTRIBUTING.md          # GitHub 也会识别 docs/CONTRIBUTING.md
│  └─ superpowers/specs/       # 设计文档与实施计划
├─ deploy/                     # Dockerfile、nginx.conf、k8s manifests
├─ LICENSE                     # MIT
├─ .gitignore                  # node_modules、src/dist、src/public/data 等
└─ .github/workflows/          # validate.yml（PR 校验）、publish.yml（构建发布）
```

约束：站点构建只针对 `src/`（npm 工程根 = `src/`）；Docker 构建上下文为仓库根，但只拷贝 `src/` 与 `deploy/nginx.conf`。

## 4. 游戏数据 schema

### 4.1 文件与命名

- 位置：`src/games/<id>.json`，一游戏一文件
- `<id>`：`^[a-z0-9-]{1,64}$`，且必须等于文件名（CI 强制，防止 id/文件名漂移）

### 4.2 字段定义

| 字段 | 必填 | 类型 | 规则 |
|---|---|---|---|
| `id` | 是 | string | `^[a-z0-9-]{1,64}$`，等于文件名 |
| `name` | 是 | string | 1–60 字符 |
| `url` | 是 | string | 仅 https，合法 URL |
| `author.name` | 是 | string | 1–60 字符 |
| `author.url` | 否 | string | 仅 https |
| `description` | 是 | string | 1–140 字符，一句话简介（列表页展示） |
| `intro` | 否 | string | Markdown，≤ 5000 字符（详情页渲染） |
| `durationMinutes.min` | 是 | int | ≥ 1 |
| `durationMinutes.max` | 是 | int | ≥ min，≤ 600 |
| `type` | 是 | enum | 见 4.3 |
| `tags` | 是 | string[] | ≤ 8 个；每个 1–12 字符、无首尾空白、不重复 |
| `cover` | 否 | string | https 外链，或 `/data/assets/covers/<文件名>`（对应文件必须存在于 `src/assets/covers/`，文件名须为 `<id>.<png\|jpg\|jpeg\|webp\|avif\|gif>`） |
| `addedAt` | 是 | string | `YYYY-MM-DD` |

`additionalProperties: false`（所有对象层级），未知字段直接报错，保证严格。

### 4.3 type 枚举与中文标签

| 值 | 中文 |
|---|---|
| `puzzle` | 解谜 |
| `action` | 动作 |
| `idle` | 放置 |
| `strategy` | 策略 |
| `simulation` | 模拟 |
| `narrative` | 文字叙事 |
| `music` | 音乐 |
| `creative` | 创意 |
| `casual` | 休闲 |
| `other` | 其他 |

### 4.4 示例

```json
{
  "id": "2048",
  "name": "2048",
  "url": "https://play2048.co/",
  "author": { "name": "Gabriele Cirulli", "url": "https://github.com/gabrielecirulli/2048" },
  "description": "滑动合并数字方块的经典益智游戏。",
  "intro": "可选，Markdown 长简介。",
  "durationMinutes": { "min": 5, "max": 20 },
  "type": "puzzle",
  "tags": ["数字", "休闲"],
  "cover": "/data/assets/covers/2048.png",
  "addedAt": "2026-09-17"
}
```

### 4.5 校验规则（构建脚本 + PR CI 同源）

1. JSON Schema 校验（Ajv，draft 2020-12）
2. `id` 等于文件名
3. 全部游戏 `id` 全局唯一
4. `tags` 去重、无首尾空白、长度与数量限制
5. `cover` 为本地路径时，文件必须存在且扩展名合法
6. 校验失败输出可读错误（文件、字段、原因），退出码非 0

## 5. 生成数据（构建产物）

`scripts/build-data.mjs` 在校验通过后生成，写入 `src/public/data/`（gitignore，predev/prebuild 自动执行）：

| 产物 | 内容 |
|---|---|
| `public/data/index.json` | `{ schemaVersion, generatedAt, games: GameSummary[] }`，GameSummary = 除 `intro` 外的全部字段（目录页搜索/筛选用） |
| `public/data/games/<id>.json` | 完整游戏对象（含 `intro`），详情页按需拉取 |
| `public/data/docs.json` | `{ generatedAt, docs: [{ slug, title, order, content }] }`，`content` 为 markdown 原文（内联，文档数少，一次请求） |
| `public/data/assets/covers/*` | 从 `src/assets/covers/` 复制 |

脚本参数：无参 = 校验 + 生成；`--check` = 只校验（PR CI 用）。

## 6. 文档系统

- 数据源：`src/docs/*.md`，slug = 文件名（`^[a-z0-9-]+$`）
- frontmatter：`title` 必填；`order` 可选（数字，缺省 999，升序排序，同序按文件名）
- 缺失 `title`、文件名非法、slug 重复 → 构建失败
- 渲染：markdown-it（`linkify + typographer`），标题自动生成锚点（slug 化保留中文，重名自动去重）
- TOC：从 markdown-it token 流提取 `h2/h3`，右侧固定目录，`IntersectionObserver` 滚动高亮，点击平滑滚动
- 内容为仓库内 PR 审核过的可信来源，不引 DOMPurify；将来若接入用户投稿内容再加

## 7. 前端架构

### 7.1 技术栈

Vue 3 + TypeScript + Vite · Vue Router · Tailwind CSS v4 · markdown-it · Vitest · vue-tsc。
不引 Pinia（数据量小，模块级 composable + URL query 足够）。

### 7.2 路由

| 路由 | 页面 |
|---|---|
| `/` | 目录页：搜索 + 类型/时长/标签筛选 + 排序，响应式卡片网格 |
| `/games/:id` | 详情页：封面、元信息、intro markdown、"开始游戏"新标签外链、返回 |
| `/docs/:slug` | 文档页：左侧文档列表 + 右侧 TOC + 正文 |
| `/docs` | 重定向到第一篇文档 |
| `*` | 404（含"游戏不存在"） |

### 7.3 筛选状态

- 状态全部同步 URL query：`q`（关键词）、`type`、`tag`（逗号分隔多选）、`dur`、`sort`
- `q` 匹配 `name / description / author.name / tags`（忽略大小写，`includes`，中文可用）
- `dur` 桶（按 `durationMinutes.max` 判定，无重叠）：`short` ≤5 分钟；`mid` (5, 30]；`long` >30
- `sort`：`new`（addedAt 倒序，默认）/ `name`（中文 locale 排序）/ `duration`（min 升序）

### 7.4 数据抽象层（未来接后端的唯一边界）

```ts
// app/data/repository.ts —— 页面只依赖此接口
interface ContentRepository {
  listGames(): Promise<GameSummary[]>
  getGame(id: string): Promise<Game>          // 不存在抛 NotFoundError
  listDocs(): Promise<DocMeta[]>
  getDoc(slug: string): Promise<Doc>
}
```

- `app/data/staticRepo.ts`：fetch 实现，GET `{base}/index.json`、`{base}/games/<id>.json`、`{base}/docs.json`；内存缓存；错误类型化
- `app/data/index.ts`：导出单例；未来换 `ApiRepository` 只改这一处
- `base` = `import.meta.env.VITE_DATA_BASE_URL`，默认 `/data`；未来后端的 URL 结构照抄 `/data` 即可无缝切换
- 抽象层做轻量运行时校验（按 TS 类型检查响应体字段），不只信构建期
- 页面消费 `loading / error / data` 三态

### 7.5 视觉与兜底

- Tailwind v4，深色为主的现代目录站风格；卡片网格 1/2/3/4 列响应式
- 封面加载失败或无封面：游戏名首字 + 按 id 哈希取色的确定性渐变占位卡（稳定不闪）
- 空状态（筛选无结果）、加载骨架、错误重试面板

### 7.6 测试（Vitest，跑在 src/）

- 筛选/排序/搜索纯函数（含中文）
- TOC slug 化、提取、去重
- repository URL 拼接与错误映射（404 → NotFoundError）
- `build-data.mjs` 校验函数单测（合法/非法样例）

## 8. 部署

### 8.1 镜像构建

`deploy/Dockerfile` 多阶段：

1. `node:22-alpine`：拷 `src/package*.json` → `npm ci` → 拷 `src/` → `npm run build`
2. `nginx:alpine`：拷 `deploy/nginx.conf` 与构建产物 `dist/`

`.dockerignore` 排除 `docs/`、`deploy/k8s/`、`.git`、`node_modules`、`src/dist`、`src/public/data`。
镜像名：`ghcr.io/<owner>/webgame-collection:<sha-短哈希>` + `:latest`；包设为 public，k3s 免 imagePullSecret。

### 8.2 nginx 配置

- SPA fallback：`try_files $uri /index.html`
- gzip 开启
- 缓存：`/assets/`（Vite 哈希产物）`max-age=31536000, immutable`；`/data/*` ETag 协商缓存（`no-cache`）；`index.html` 不缓存

### 8.3 GitHub Actions

**`validate.yml`**（PR 触发，`paths: src/**`）：

1. setup-node 22 + npm cache（`cache-dependency-path: src/package-lock.json`）
2. `cd src && npm ci`
3. `npm run validate:data`（只校验，错误信息面向贡献者）
4. `npm run check`（`vue-tsc --noEmit && vitest run && vite build`）

**`publish.yml`**（push main）：

1. `permissions: contents: read, packages: write`
2. 登录 GHCR（`GITHUB_TOKEN`），`docker/build-push-action` 推 `sha-<短哈希>` + `latest`
3. 调 keel webhook：`POST ${{ secrets.KEEL_WEBHOOK_URL }}`（token 在 body/header，按集群 keel 版本约定）；secret 未配置则跳过并 log 提示（依赖轮询兜底）
4. `concurrency` 保证同时间仅一次发布

### 8.4 k3s 清单（`deploy/k8s/`）

- `namespace.yaml`、`deployment.yaml`：2 副本、RollingUpdate、readinessProbe GET `/`、资源 requests cpu 10m / 内存 16Mi，limits cpu 200m / 内存 128Mi
- `service.yaml`：ClusterIP:80
- `ingress.yaml`：k3s 默认 Traefik；host 与 TLS 用占位注释，按实际集群填
- keel 注解（Deployment）：

```yaml
keel.sh/policy: force
keel.sh/trigger: webhook     # 未配 webhook 时退回轮询
keel.sh/pollSchedule: "@every 1m"
```

- 不引入 HPA（纯静态 nginx）

### 8.5 需要一次性提供/配置的项

1. GitHub 仓库与 owner（决定镜像路径 `ghcr.io/<owner>/webgame-collection`）
2. GHCR 包可见性设为 public
3. k3s 中部署 keel.sh（或确认已有），取得 webhook URL 与 token → 写入 GH 仓库 secrets
4. 域名与 Ingress host（`deploy/k8s/ingress.yaml` 占位处）

## 9. 本地开发与验收

- 开发：`cd src && npm run dev`（predev 自动生成数据）
- 门槛：`npm run check`（vue-tsc + vitest + vite build）
- 生产形态：`docker build -f deploy/Dockerfile . && docker run -p 8080:80 <image>`，人工过一遍目录/筛选/详情/文档 TOC
- 端到端：合并一个游戏 JSON 的 PR → validate 通过；push main → GHCR 新镜像 → keel 更新 k3s → 站点出现新游戏

## 10. 未来接后端迁移路径

1. 后端提供与 `/data` 相同结构的接口（或标准 REST），URL 可直接沿用
2. 前端新增 `ApiRepository implements ContentRepository`，改 `app/data/index.ts` 单例导出即可，页面与组件零改动
3. 数据 schema 不变，PR 流程与校验规则继续适用于仓库内数据
4. 用户投稿/审核等有服务端的行为届时另开 spec，不在本设计内

## 11. 验收标准

- [ ] `src/games/` 新增合法 JSON 通过 `npm run validate:data`；非法样例（id 与文件名不符、tags 重复、cover 文件缺失、未知字段）全部报错
- [ ] `npm run dev` 目录页可搜索、按类型/时长/标签筛选、排序，URL query 可分享/刷新保持
- [ ] 详情页展示完整信息与 intro markdown，"开始游戏"新标签打开外链
- [ ] 文档页渲染 markdown，左侧列表 + 右侧 TOC 滚动高亮、锚点跳转正确
- [ ] 无封面/封面加载失败显示确定性占位卡
- [ ] `docker build` 产出镜像可跑通生产形态，缓存头符合 8.2
- [ ] PR 触发 validate.yml；push main 触发 publish.yml 推送 GHCR 并调 keel webhook
- [ ] `deploy/k8s/` 清单在 k3s 可 apply，keel 能拉新镜像滚动更新
