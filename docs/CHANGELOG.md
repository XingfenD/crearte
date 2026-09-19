# Changelog / 更新日志

All notable changes to this template should be documented in this file.
本模板的重要变更建议统一记录在此文件中。

The format loosely follows Keep a Changelog and can be adapted to the team's habits.
本文档参考了 Keep a Changelog 的思路，也可以根据团队习惯调整。

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

