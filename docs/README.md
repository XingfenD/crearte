# webgame-collection

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

生产形态本地验收：

```bash
docker build -f deploy/Dockerfile -t webgame-collection:local .
docker run --rm -p 8080:80 webgame-collection:local
```

## 部署

1. 推送 `master` 后 Actions 自动推送镜像 `ghcr.io/<owner>/webgame-collection:{latest,sha-<long>}`（首次需把 Package 可见性设为 public）
2. k3s：替换 `deploy/k8s/deployment.yaml` 中的 `OWNER`、`deploy/k8s/ingress.yaml` 中的 `host` 后 `kubectl apply -f deploy/k8s/`
3. keel：集群内安装 [keel.sh](https://keel.sh)（`helm upgrade --install keel --namespace=keel keel/keel --set helmProvider.enabled=false`），仓库 Secrets 配置 `KEEL_WEBHOOK_URL`（如 `http://keel.keel.svc.cluster.local:9300/v1/webhooks/native`）与 `KEEL_TOKEN`（keel 的 `TOKEN_SECRET`；keel 未开 `AUTHENTICATED_WEBHOOKS` 时留空即可）
4. 发布链路：推镜像后 Action POST keel native webhook（`{"name":"<镜像>","tag":"latest"}`），keel 滚动更新 Deployment；webhook 不可用时依赖 `@every 5m` 轮询兜底

设计文档：[`docs/superpowers/specs/2026-09-17-webgame-collection-design.md`](./superpowers/specs/2026-09-17-webgame-collection-design.md)
