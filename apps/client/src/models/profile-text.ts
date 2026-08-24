import { normalizeWhitespace } from "@/lib/text"

export function normalizeSkillName(value: string) {
  return value.trim().toLowerCase()
}

export function parseSkillNames(input: string): string[] {
  const seen = new Set<string>()

  return input
    .split(/[,，;；\r\n]+/)
    .map(normalizeWhitespace)
    .filter((item) => {
      const normalized = normalizeSkillName(item)
      if (!normalized || seen.has(normalized)) return false
      seen.add(normalized)
      return true
    })
}
