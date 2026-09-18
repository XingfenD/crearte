# crearte

收集**静态网页游戏**（打开网页即玩、无需服务端）的开源目录站。

- 站点：Vue 3 静态构建；目录页支持搜索、按类型/时长/标签筛选与排序
- 详情页：简介（支持 Markdown）与外链跳转
- 文档：内置 Markdown 渲染，带文档目录（TOC）
- 部署：GitHub Actions 构建镜像 → GHCR → keel.sh webhook → k3s 滚动更新

## 提交一个游戏

1. 在 `src/games/` 新增 `<id>.json`（`id` 仅含小写字母、数字、连字符，且与文件名一致）
2. 本地校验：`cd src && npm install && npm run validate:data`
3. 提 PR，CI 会跑数据校验与完整检查

字段与规则详见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

## 本地开发

```bash
cd src
npm install
npm run dev      # 自动生成 src/public/data
npm run check    # vitest + vue-tsc + vite build
```

容器内开发（源码挂载 + HMR，无需本机装 Node）：

```bash
docker compose -f deploy/docker-compose.dev.yml up --build   # http://localhost:8080
```

> 访问端口与生产模式统一为 8080（`WGC_PORT` 可覆盖），两者不要同时启动。

## 生产形态本地验收

```bash
docker compose -f deploy/docker-compose.prod.yml up -d --build   # http://localhost:8080
```

或不用 compose：

```bash
docker build -f deploy/Dockerfile -t crearte:local .
docker run --rm -p 8080:80 crearte:local
```

## 部署

1. 本机构建并推送镜像（首次需把 Package 可见性设为 public）：

   ```bash
   docker build -f deploy/Dockerfile -t ghcr.io/xingfend/crearte:latest .
   docker push ghcr.io/xingfend/crearte:latest
   ```
2. k3s：`kubectl apply -f deploy/k8s/`（镜像固定为 `ghcr.io/xingfend/crearte:latest`）；集群未装 ingress controller，Service 为 NodePort，访问 `http://<节点IP>:30080`
3. keel：集群内安装 [keel.sh](https://keel.sh)（`helm upgrade --install keel --namespace=keel keel/keel --set helmProvider.enabled=false`）
4. 发布链路：推送新镜像后 keel 按 `@every 5m` 轮询自动滚动更新；需要立即触发时手动 POST native webhook（`{"name":"ghcr.io/xingfend/crearte","tag":"latest"}`）

## 运行时运维配置

游戏以 `<id>.games.example.com` 子域运行，运维侧需要：

1. DNS：把 `*.games.example.com` 泛解析到节点 IP（或前端代理地址）。
2. 访问：集群未装 ingress controller，Service 走 NodePort 30080，即 `http://<节点IP>:30080`；生产建议由前端代理按 Host 转发。
3. TLS：集群内不终止 TLS；需要 HTTPS 时在前端代理用 `*.games.example.com` 通配证书终止，或后续补装 ingress controller 再导入通配证书（DNS-01 签发，如 acme.sh `dns_ali` 或 cert-manager）。
4. 构建变量：`VITE_GAMES_BASE_DOMAIN`（默认 `games.example.com`）决定子域后缀，`VITE_HOST_ORIGIN`（默认 `https://games.example.com`）为宿主站来源；构建镜像前按实际域名覆盖。
5. 运行时三件套固定为 `dist/bootstrap/index.html`、`dist/sw.js`、`dist/agent.js`，由 nginx 通配 server block 精确暴露为 `/__bootstrap`、`/sw.js`、`/agent.js`（均 `no-store`），其余路径返回 404；主站 `/data/bundles/` 带 `Access-Control-Allow-Origin: *` 供子域拉取 bundle。

## 许可与商业授权

本仓库（前端与运行时）以 [AGPL-3.0-only](https://www.gnu.org/licenses/agpl-3.0.html) 开源：可自由使用、修改、自建部署；但**修改后通过网络向用户提供服务时，必须按 AGPL 第 13 条向这些用户提供修改版的完整源码**。如需在闭源条件下使用（如商业集成），可联系作者获取商业授权。

服务端与运营相关内容不开源，单独私有维护。字体（SIL OFL，见 `src/assets/fonts/OFL.txt`）与第三方依赖遵循各自许可。

Copyright (C) 2026 XingfenD

设计文档：[`docs/superpowers/specs/2026-09-17-webgame-collection-design.md`](./superpowers/specs/2026-09-17-webgame-collection-design.md)
