#!/usr/bin/env node
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'

export const SRC_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
export const GAME_ID_PATTERN = /^[a-z0-9-]{1,64}$/
export const DOC_SLUG_PATTERN = /^[a-z0-9-]+$/
export const LOCAL_COVER_PATTERN = /^\/data\/assets\/covers\/([a-z0-9-]{1,64})\.(png|jpg|jpeg|webp|avif|gif)$/

export function createValidator(schema) {
  return new Ajv2020({ allErrors: true, strict: true }).compile(schema)
}

export function parseFrontmatter(raw, label = 'frontmatter') {
  const errors = []
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw)
  if (!match) {
    return { title: '', order: 999, content: raw, errors: [`${label}: 缺少 frontmatter（--- / title: ... / ---）`] }
  }
  let title = ''
  let order = 999
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim()) continue
    const idx = line.indexOf(':')
    if (idx < 0) {
      errors.push(`${label}: frontmatter 行无法解析：${line}`)
      continue
    }
    const key = line.slice(0, idx).trim()
    const value = line.slice(idx + 1).trim()
    if (key === 'title') title = value
    else if (key === 'order') {
      const n = Number(value)
      if (!Number.isFinite(n)) errors.push(`${label}: order 必须是数字，得到 "${value}"`)
      else order = n
    } else errors.push(`${label}: 未知 frontmatter 字段 "${key}"（仅支持 title、order）`)
  }
  if (!title) errors.push(`${label}: 缺少 title`)
  return { title, order, content: raw.slice(match[0].length).trim(), errors }
}

async function checkCover(game, coversDir) {
  if (!game.cover || game.cover.startsWith('https://')) return null
  const match = LOCAL_COVER_PATTERN.exec(game.cover)
  if (!match) return 'cover 必须是 https URL 或 /data/assets/covers/<id>.<png|jpg|jpeg|webp|avif|gif>'
  if (match[1] !== game.id) return `cover 文件名必须与 id 一致（应为 ${game.id}.${match[2]}）`
  if (!existsSync(path.join(coversDir, `${game.id}.${match[2]}`))) return `cover 文件不存在：assets/covers/${game.id}.${match[2]}`
  return null
}

export async function loadGames({ gamesDir, coversDir, validate }) {
  const errors = []
  const games = []
  const seen = new Map()
  let files = []
  try {
    files = (await readdir(gamesDir)).filter((f) => f.endsWith('.json')).sort()
  } catch {
    return { games, errors: [`无法读取目录：${gamesDir}`] }
  }
  for (const file of files) {
    const label = `games/${file}`
    const fileId = file.slice(0, -'.json'.length)
    if (!GAME_ID_PATTERN.test(fileId)) errors.push(`${label}: 文件名必须是 [a-z0-9-]{1,64}`)
    const lower = fileId.toLowerCase()
    if (seen.has(lower)) errors.push(`${label}: id 与 ${seen.get(lower)} 重复（忽略大小写）`)
    seen.set(lower, label)
    let raw
    try {
      raw = JSON.parse(await readFile(path.join(gamesDir, file), 'utf8'))
    } catch (e) {
      errors.push(`${label}: JSON 解析失败：${e.message}`)
      continue
    }
    if (!validate(raw)) {
      for (const err of validate.errors ?? []) errors.push(`${label}${err.instancePath || ''}: ${err.message}`)
      continue
    }
    if (raw.id !== fileId) {
      errors.push(`${label}: id "${raw.id}" 必须等于文件名 "${fileId}"`)
      continue
    }
    if (raw.durationMinutes.max < raw.durationMinutes.min) {
      errors.push(`${label}: durationMinutes.max 必须 >= min`)
      continue
    }
    const coverError = await checkCover(raw, coversDir)
    if (coverError) {
      errors.push(`${label}: ${coverError}`)
      continue
    }
    games.push(raw)
  }
  return { games, errors }
}

export async function loadDocs({ docsDir }) {
  const errors = []
  const docs = []
  let files = []
  try {
    files = (await readdir(docsDir)).filter((f) => f.endsWith('.md')).sort()
  } catch {
    return { docs, errors }
  }
  for (const file of files) {
    const label = `docs/${file}`
    const slug = file.slice(0, -'.md'.length)
    if (!DOC_SLUG_PATTERN.test(slug)) {
      errors.push(`${label}: 文件名必须是 [a-z0-9-]+`)
      continue
    }
    const parsed = parseFrontmatter(await readFile(path.join(docsDir, file), 'utf8'), label)
    if (parsed.errors.length) {
      errors.push(...parsed.errors)
      continue
    }
    docs.push({ slug, title: parsed.title, order: parsed.order, content: parsed.content })
  }
  return { docs, errors }
}

function pickGame(game, withIntro) {
  return {
    id: game.id,
    name: game.name,
    url: game.url,
    author: { name: game.author.name, ...(game.author.url ? { url: game.author.url } : {}) },
    description: game.description,
    ...(withIntro && game.intro ? { intro: game.intro } : {}),
    durationMinutes: { min: game.durationMinutes.min, max: game.durationMinutes.max },
    type: game.type,
    tags: [...game.tags],
    ...(game.cover ? { cover: game.cover } : {}),
    addedAt: game.addedAt
  }
}

export function buildIndex(games, generatedAt) {
  return {
    schemaVersion: 1,
    generatedAt,
    games: [...games].sort((a, b) => a.id.localeCompare(b.id)).map((g) => pickGame(g, false))
  }
}

export async function generate({ srcRoot = SRC_ROOT, check = false, now = new Date() } = {}) {
  const gamesDir = path.join(srcRoot, 'games')
  const docsDir = path.join(srcRoot, 'docs')
  const coversDir = path.join(srcRoot, 'assets', 'covers')
  const outDir = path.join(srcRoot, 'public', 'data')
  const schema = JSON.parse(await readFile(path.join(srcRoot, 'schema', 'game.schema.json'), 'utf8'))
  const validate = createValidator(schema)
  const { games, errors: gameErrors } = await loadGames({ gamesDir, coversDir, validate })
  const { docs, errors: docErrors } = await loadDocs({ docsDir })
  const errors = [...gameErrors, ...docErrors]
  if (errors.length) return { ok: false, errors }
  if (check) return { ok: true, errors: [], games: games.length, docs: docs.length }

  const generatedAt = now.toISOString()
  await rm(outDir, { recursive: true, force: true })
  await mkdir(path.join(outDir, 'games'), { recursive: true })
  await writeFile(path.join(outDir, 'index.json'), JSON.stringify(buildIndex(games, generatedAt), null, 2) + '\n')
  for (const game of games) {
    await writeFile(path.join(outDir, 'games', `${game.id}.json`), JSON.stringify(pickGame(game, true), null, 2) + '\n')
  }
  const sortedDocs = [...docs].sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug))
  await writeFile(path.join(outDir, 'docs.json'), JSON.stringify({ generatedAt, docs: sortedDocs }, null, 2) + '\n')
  if (existsSync(coversDir)) await cp(coversDir, path.join(outDir, 'assets', 'covers'), { recursive: true })
  return { ok: true, errors: [], games: games.length, docs: docs.length }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const check = process.argv.includes('--check')
  const result = await generate({ check })
  if (!result.ok) {
    console.error(`数据校验失败（${result.errors.length} 个问题）：`)
    for (const err of result.errors) console.error(`  - ${err}`)
    process.exit(1)
  }
  console.log(check ? `校验通过：${result.games} 个游戏，${result.docs} 篇文档` : `数据已生成：${result.games} 个游戏，${result.docs} 篇文档`)
}
