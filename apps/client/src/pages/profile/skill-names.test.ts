import { describe, expect, it } from "vitest"

import { normalizeSkillName, parseSkillNames } from "./skill-names"

describe("parseSkillNames", () => {
  it("supports supported separators without splitting spaces in names", () => {
    expect(parseSkillNames("React, TypeScript；Design systems\nMachine learning")).toEqual([
      "React",
      "TypeScript",
      "Design systems",
      "Machine learning",
    ])
  })

  it("preserves punctuation in skill names and deduplicates case-insensitively", () => {
    expect(parseSkillNames("C++, C#, .NET, Next.js, react, React")).toEqual([
      "C++",
      "C#",
      ".NET",
      "Next.js",
      "react",
    ])
    expect(normalizeSkillName("  Design   Systems ")).toBe("design systems")
  })
})
