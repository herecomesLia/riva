import { normalizeWhitespace } from "@/lib/text"

export function normalizeSkillName(value: string) {
  return normalizeWhitespace(value).toLocaleLowerCase("en-US")
}

export function parseSkillNames(input: string): string[] {
  return normalizeSkillNames(input.split(/[,，;；\r\n]+/))
}

export function normalizeSkillNames(names: string[]) {
  const seen = new Set<string>()

  return names.map(normalizeWhitespace).filter((name) => {
    const normalized = normalizeSkillName(name)
    if (!normalized || seen.has(normalized)) return false
    seen.add(normalized)
    return true
  })
}
