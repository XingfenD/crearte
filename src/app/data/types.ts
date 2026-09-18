export const GAME_TYPES = [
  'puzzle', 'action', 'idle', 'strategy', 'simulation',
  'narrative', 'music', 'creative', 'casual', 'other'
] as const

export type GameType = (typeof GAME_TYPES)[number]

export interface Author {
  name: string
  url?: string
}

export type GameRuntimeMode = 'external' | 'virtual' | 'hosted'

export interface FeatureFlags {
  eval?: boolean
  inlineScript?: boolean
  inlineStyle?: boolean
  wasm?: boolean
  coop?: boolean
  fullscreen?: boolean
  gamepad?: boolean
}

export interface GameBundle {
  url: string
  bytes: number
  sha256: string
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
  runtime?: GameRuntimeMode
}

export interface Game extends GameSummary {
  intro?: string
  version?: string
  entry?: string
  playOrigin?: string
  hostedUrl?: string
  bundle?: GameBundle
  features?: FeatureFlags
  display?: { aspect?: '16:9' | '4:3' | 'fill' }
  fallback?: 'external' | 'hosted' | 'none'
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
