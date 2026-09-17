# 贡献指南

## 提交游戏

1. Fork 仓库并新建分支
2. 在 `src/games/` 新增 `<id>.json`，参考现有文件：

```json
{
  "id": "your-game",
  "name": "游戏名",
  "url": "https://example.com/",
  "author": { "name": "作者", "url": "https://github.com/author" },
  "description": "一句话简介（≤140 字）",
  "intro": "可选，详情页展示的 Markdown 长简介",
  "durationMinutes": { "min": 5, "max": 20 },
  "type": "puzzle",
  "tags": ["休闲"],
  "cover": "/data/assets/covers/your-game.png",
  "addedAt": "2026-09-17"
}
```

3. 校验：`cd src && npm install && npm run validate:data`（CI 同样会跑）
4. 提 PR，描述游戏玩法与链接来源

## 硬性规则（CI 会拒绝）

- `id` 必须等于文件名，仅含 `[a-z0-9-]`
- 字段不允许自创（schema 为 `additionalProperties: false`）
- `url` 与封面外链仅允许 https
- `tags` 最多 8 个、每个不超过 12 字、不允许重复
- `type` 只能取枚举值：`puzzle | action | idle | strategy | simulation | narrative | music | creative | casual | other`
- 本地封面只能放在 `src/assets/covers/<id>.<png|jpg|jpeg|webp|avif|gif>`，并在 JSON 中写 `/data/assets/covers/<id>.<ext>`
- `durationMinutes.max >= min` 且 `max <= 600`

## 提交站点文档

- 文档放在 `src/docs/*.md`，文件名即 URL slug（`[a-z0-9-]+`）
- frontmatter 仅支持 `title`（必填）与 `order`（可选，数字，越小越靠前）
- 正文从 `##` 开始（页面标题已由 `title` 渲染）

## 改代码

```bash
cd src
npm install
npm run dev        # 本地开发
npm run check      # 提交前必须全绿：vitest + vue-tsc + vite build
```

- 数据层改动保持 `ContentRepository` 接口不变（未来接后端的迁移边界）
- 需要新字段时同时更新 `src/schema/game.schema.json`、`src/app/data/types.ts`、本文件与 spec
