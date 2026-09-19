import { GAME_TYPES, type GameSummary } from '@/data/types'

const KNOWN_TYPES: readonly string[] = GAME_TYPES

function compareTypes(a: string, b: string): number {
  const indexA = KNOWN_TYPES.indexOf(a)
  const indexB = KNOWN_TYPES.indexOf(b)
  const rankA = indexA === -1 ? KNOWN_TYPES.length : indexA
  const rankB = indexB === -1 ? KNOWN_TYPES.length : indexB
  if (rankA !== rankB) return rankA - rankB
  if (a === b) return 0
  return a < b ? -1 : 1
}

function compareByRecency(a: GameSummary, b: GameSummary): number {
  if (a.addedAt !== b.addedAt) return a.addedAt < b.addedAt ? 1 : -1
  if (a.id === b.id) return 0
  return a.id < b.id ? -1 : 1
}

export function pickFeatured(games: GameSummary[], limit = 6): GameSummary[] {
  if (limit <= 0) return []

  const groups = new Map<string, GameSummary[]>()
  for (const game of games) {
    const bucket = groups.get(game.type)
    if (bucket) bucket.push(game)
    else groups.set(game.type, [game])
  }

  const types = [...groups.keys()].sort(compareTypes)
  const ordered: GameSummary[][] = []
  let depth = 0
  for (const type of types) {
    const bucket = groups.get(type) ?? []
    bucket.sort(compareByRecency)
    ordered.push(bucket)
    depth = Math.max(depth, bucket.length)
  }

  const picked: GameSummary[] = []
  for (let round = 0; round < depth && picked.length < limit; round += 1) {
    for (const bucket of ordered) {
      const game = bucket[round]
      if (!game) continue
      picked.push(game)
      if (picked.length === limit) break
    }
  }
  return picked
}
