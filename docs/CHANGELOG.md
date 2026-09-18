# Changelog / 更新日志

All notable changes to this template should be documented in this file.
本模板的重要变更建议统一记录在此文件中。

The format loosely follows Keep a Changelog and can be adapted to the team's habits.
本文档参考了 Keep a Changelog 的思路，也可以根据团队习惯调整。

## [0.2.0] - 2026-09-18

### Added / 新增

- Added the game runtime: per-game subdomains, a Service Worker virtual source for signed bundles, a hosted (C) mode, sandboxed iframes with per-game feature flags, an agent-injected MessagePort bridge (score/save/exit), a shell degrade chain with a host error panel, offline play and bundle updates.
- 新增游戏运行时：按游戏子域隔离、签名 bundle 的 Service Worker 虚拟源、C 模式（后端托管）、带 features 开关的沙箱 iframe、注入 agent 的 MessagePort 桥（得分/存档/退出）、shell 降级链与宿主错误面板、离线可玩与版本更新。

- Extended the game schema to v2 with `runtime`/`version`/`bundle`/`entry`/`hostedUrl`/`fallback`/`features`, plus fixture/data pipelines and a multi-origin mock runtime server; added a Playwright e2e suite.
- 游戏 schema 升级到 v2，新增 `runtime`/`version`/`bundle`/`entry`/`hostedUrl`/`fallback`/`features`，并补充夹具/数据管线与多源 mock 运行时服务；新增 Playwright e2e 测试。

### Changed / 变更

- Added a wildcard game-host nginx block and bundle download CORS; PR validation now runs the runtime e2e suite.
- 新增游戏子域 nginx 通配 server block 与 bundle 下载 CORS；PR 校验流水线现在会执行运行时 e2e。

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

