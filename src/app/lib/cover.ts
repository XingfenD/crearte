export function hashString(input: string): number {
  let hash = 0
  for (const char of input) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) | 0
  return Math.abs(hash)
}

export function coverGradient(id: string): [string, string] {
  const hue = hashString(id) % 360
  return [`hsl(${hue} 65% 45%)`, `hsl(${(hue + 50) % 360} 65% 22%)`]
}

export function coverInitial(name: string): string {
  return [...name.trim()][0] ?? '?'
}
