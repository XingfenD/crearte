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

1. 本机构建并推送镜像（首次需把 Package 可见性设为 public；构建参数按实际值注入，`VITE_API_BASE_URL` 留空则不启用账号入口）：

   ```bash
   docker build -f deploy/Dockerfile \
     --build-arg VITE_API_BASE_URL=https://api.crearte.yoresee.cc \
     --build-arg VITE_GAMES_BASE_DOMAIN=crearte-games.yoresee.cc \
     --build-arg VITE_HOST_ORIGIN=https://crearte.yoresee.cc \
     -t ghcr.io/xingfend/crearte:latest .
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
4. 构建变量：`VITE_GAMES_BASE_DOMAIN`（默认 `games.example.com`）决定子域后缀，`VITE_HOST_ORIGIN`（默认 `https://games.example.com`）为宿主站来源；构建镜像时用 `--build-arg` 覆盖（见「部署」）。
5. 运行时三件套固定为 `dist/bootstrap/index.html`、`dist/sw.js`、`dist/agent.js`，由 nginx 通配 server block 精确暴露为 `/__bootstrap`、`/sw.js`、`/agent.js`（均 `no-store`），其余路径返回 404；主站 `/data/bundles/` 带 `Access-Control-Allow-Origin: *` 供子域拉取 bundle。

## 许可、开放边界与商业授权

本仓库是 crearte 的**官方前端**（Vue 3 静态站点 + 游戏运行时），以 [AGPL-3.0-only](https://www.gnu.org/licenses/agpl-3.0.html) 开源：可自由使用、修改、自建部署；但**修改后通过网络向用户提供服务时，必须按 AGPL 第 13 条向这些用户提供修改版的完整源码**。如需在闭源条件下使用（如商业集成），可联系作者获取商业授权。

开放边界：

- **可自建（当前能力，非长期承诺）**：用本仓构建静态目录站——浏览 / 筛选 / 以子域或外链方式运行游戏；域名、DNS、TLS 等运行时配置见上文「运行时运维配置」。
- **不可自建**：账号、上传、审核等依赖官方后端的能力。服务端与运营相关内容不开源，单独私有维护（`crearte-server`）；账号能力在本仓默认构建中关闭（未注入后端地址时不显示入口）。
- 本仓是官方客户端：社区无法仅凭本仓运行完整服务。

贡献：游戏数据 PR 与代码 PR 均适用[贡献者许可协议](./CLA.md)。字体（SIL OFL，见 `src/assets/fonts/OFL.txt`）与第三方依赖遵循各自许可。

Copyright (C) 2026 XingfenD

设计文档：[`docs/superpowers/specs/2026-09-17-webgame-collection-design.md`](./superpowers/specs/2026-09-17-webgame-collection-design.md)

## 环境变量

| 变量 | 用途 | 例子 |
| --- | --- | --- |
| `VITE_API_BASE_URL` | 后端 API 基地址（无尾斜杠） | 生产 `https://api.crearte.yoresee.cc`；dev 见 `src/.env.development` |
| `VITE_HOST_ORIGIN` | 宿主站 origin（游戏运行时用） | `https://crearte.yoresee.cc` |
| `VITE_GAMES_BASE_DOMAIN` | 游戏子域基域 | `crearte-games.yoresee.cc` |

> **生产构建如需账号能力，必须注入 `VITE_API_BASE_URL`**：`.env.development` 只管 dev；`build:e2e` 自带注入；生产走 `VITE_API_BASE_URL=https://api.crearte.yoresee.cc` 或部署侧注入；空值表示**关闭账号能力**（隐藏登录入口、auth 路由回首页、不发起 auth 请求）。
>
> **后端 CORS 必须同时配置 `CORS_ALLOWED_ORIGINS` 放行前端 origin 并 expose `Retry-After`**（否则跨域下前端读不到 `Retry-After`，429 提示会退化为缺省 60 秒）。

## 账号系统本地联调

1. 起后端依赖与后端：`cd crearte-server && docker compose -f deploy/docker-compose.dev.yml up -d`，再按该仓 `docs/README.md` 起 `go run ./cmd serve`
2. 后端 `.env`：`DATABASE_URL`、`AUTH_TOKEN_SECRET`、`BUNDLE_KEK_*` 三项必备；跨域联调时把 `CORS_ALLOWED_ORIGINS` 设为前端 dev 地址（如 `http://localhost:5173`）
3. 前端：`cd src && npm install && npm run dev`，默认读 `src/.env.development` 直连 `http://localhost:8080`
