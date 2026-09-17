export const COVER_COLORS = [
  '#2F6DE0',
  '#C03A1B',
  '#1F7A4D',
  '#6B4FD8',
  '#B35C00',
  '#0F6E6E',
  '#A3256B',
  '#141414'
] as const

export function hashString(input: string): number {
  let hash = 0
  for (const char of input) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) | 0
  return Math.abs(hash)
}

export function coverColor(id: string): string {
  return COVER_COLORS[hashString(id) % COVER_COLORS.length]
}

export function coverInitial(name: string): string {
  return [...name.trim()][0] ?? '?'
}
