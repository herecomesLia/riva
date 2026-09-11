export function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim()
}

function uniqueItems(items: string[]) {
  const seen = new Set<string>()

  return items.filter((item) => {
    if (!item || seen.has(item)) return false
    seen.add(item)
    return true
  })
}

const listPrefix = /^\s*(?:[-*•●▪◦]|\d+[.)、]|[a-zA-Z][.)])\s+/

function withoutListPrefix(value: string) {
  return value.replace(listPrefix, "")
}

function splitSentences(value: string) {
  return value
    .split(/(?<=[。！？!?])\s*|(?<=[.])\s+(?=[A-Z\u4e00-\u9fff])/)
    .map((item) => normalizeWhitespace(item).replace(/[。！？!?.]$/, ""))
    .filter(Boolean)
}

/** Deterministically extracts user-provided bullet candidates without rewriting them. */
export function parseBulletItems(input: string): string[] {
  const normalized = input.replace(/\r\n?/g, "\n").trim()
  if (!normalized) return []

  const lines = normalized
    .split("\n")
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean)

  const hasExplicitList = lines.some((line) => listPrefix.test(line))
  const candidates = hasExplicitList
    ? lines.map(withoutListPrefix)
    : lines.length >= 2
      ? lines
      : normalized.includes(";") || normalized.includes("；")
        ? normalized.split(/[;；]/)
        : splitSentences(normalized)

  return uniqueItems(candidates.map(withoutListPrefix).map(normalizeWhitespace))
}

export function normalizeBulletItems(items: string[]) {
  return uniqueItems(items.map(normalizeWhitespace))
}
