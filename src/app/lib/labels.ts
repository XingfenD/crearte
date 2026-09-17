import type { GameType } from '@/data/types'

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
