import { describe, expect, it } from "vitest"

import { toDashboardScoreOutOfTen } from "./dashboard-display"

describe("toDashboardScoreOutOfTen", () => {
  it("converts the history /100 business score only at presentation time", () => {
    expect(toDashboardScoreOutOfTen(86)).toBe(8.6)
    expect(toDashboardScoreOutOfTen(0)).toBe(0)
    expect(toDashboardScoreOutOfTen(100)).toBe(10)
  })
})
