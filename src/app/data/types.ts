export const GAME_TYPES = [
  'puzzle', 'action', 'idle', 'strategy', 'simulation',
  'narrative', 'music', 'creative', 'casual', 'other'
] as const

export type GameType = (typeof GAME_TYPES)[number]

export interface Author {
  name: string
  url?: string
}

export interface GameSummary {
  id: string
  name: string
  url: string
  author: Author
  description: string
  durationMinutes: { min: number; max: number }
  type: GameType
  tags: string[]
  cover?: string
  addedAt: string
}

export interface Game extends GameSummary {
  intro?: string
}

export interface DocMeta {
  slug: string
  title: string
  order: number
}

export interface Doc extends DocMeta {
  content: string
}

export interface GamesIndex {
  schemaVersion: number
  generatedAt: string
  games: GameSummary[]
}

export interface DocsIndex {
  generatedAt: string
  docs: Doc[]
}
