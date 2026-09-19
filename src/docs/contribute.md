---
title: 收录与提交
order: 2
---

## 提交一个作品

1. 在仓库 `src/games/` 目录新增 `<id>.json`，`id` 只能包含小写字母、数字与连字符，且与文件名一致
2. 本地运行校验：`cd src && npm install && npm run validate:data`
3. 提交 PR，CI 会自动校验数据格式

## 字段说明

| 字段 | 说明 |
| --- | --- |
| `name` | 作品名（≤ 60 字） |
| `url` | 作品访问链接（仅 https） |
| `author` | 作者或团队，`url` 可选 |
| `description` | 一句话简介（≤ 140 字） |
| `intro` | 可选，详情页 Markdown 长简介 |
| `durationMinutes` | 预计时长分钟数区间 |
| `type` | 单选类型，见 schema 枚举 |
| `tags` | 自由标签，最多 8 个、每个 ≤ 12 字 |
| `cover` | 可选封面：外链 https 或 `/data/assets/covers/<id>.<扩展名>` |
| `addedAt` | 收录日期（`YYYY-MM-DD`） |
