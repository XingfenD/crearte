---
title: 收录与提交
order: 2
---

## 提交一个作品

1. 在仓库 `src/games/` 目录新增 `<slug>.json`（文件名即 slug，不含 `/`），JSON 内填复合 `id` = `user/slug`，并显式提供与拆段一致的 `user`、`slug` 字段
2. 本地运行校验：`cd src && npm install && npm run validate:data`
3. 提交 PR，CI 会自动校验数据格式

## 字段说明

| 字段 | 说明 |
| --- | --- |
| `id` | 复合作品 id = `user/slug` |
| `user` | 作者命名空间，`^[a-z0-9]([a-z0-9-]{0,37}[a-z0-9])?$` |
| `slug` | 作品短名，与文件名一致，`^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$` |
| `name` | 作品名（≤ 60 字） |
| `url` | 作品访问链接（仅 https） |
| `author` | 作者或团队，`url` 可选 |
| `description` | 一句话简介（≤ 140 字） |
| `intro` | 可选，详情页 Markdown 长简介 |
| `durationMinutes` | 预计时长分钟数区间 |
| `type` | 单选类型，见 schema 枚举 |
| `tags` | 自由标签，最多 8 个、每个 ≤ 12 字 |
| `cover` | 可选封面：外链 https 或 `/data/assets/covers/<slug>.<扩展名>` |
| `addedAt` | 收录日期（`YYYY-MM-DD`） |
| `runtime` | 可选运行方式：`external`（默认，仅外链）/ `virtual` / `hosted` |
| `playSubdomain` | 可选（自托管）：后端按 `sha256(复合 id)[:16]` 签发的 16 位 hex 播放子域标签（`^[0-9a-f]{16}$`） |
| `playOrigin` | 可选（自托管）：显式播放源 origin，覆盖子域推导 |

自托管作品（`runtime` 为 `virtual` 或 `hosted`）必须在运行时有一个可播放的源：后端签发的 `playSubdomain` 或显式的 `playOrigin` 覆盖；二者皆缺时 `npm run validate:data` 直接报错。静态投稿者拿不到后端签发的子域，可自建运行地址并填 `playOrigin`，或走站内投稿流程由后端签发 `playSubdomain`。
