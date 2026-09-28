import type { GameSummary, GameType } from '@/data/types'

export const GAME_TYPE_LABELS: Record<GameType, string> = {
  puzzle: '解谜',
  action: '动作',
  idle: '放置',
  strategy: '策略',
  simulation: '模拟',
  narrative: '文字叙事',
  music: '音乐',
  creative: '创意',
  casual: '休闲',
  other: '其他'
}

export function durationText(duration: { min: number; max: number }): string {
  return duration.min === duration.max ? `约 ${duration.min} 分钟` : `${duration.min}–${duration.max} 分钟`
}

// 作者位回退链：显式作者名 → 所有者用户名 → 佚名（作者为可选项后的兜底）
export function authorDisplayName(game: Pick<GameSummary, 'author' | 'user'>): string {
  return game.author?.name || game.user || '佚名'
}
