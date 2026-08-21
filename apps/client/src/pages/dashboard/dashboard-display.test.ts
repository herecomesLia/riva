import { describe, expect, it } from "vitest"

import { formatDashboardScore } from "./dashboard-display"

describe("formatDashboardScore", () => {
  it("keeps the shared /100 business score while formatting display precision", () => {
    expect(formatDashboardScore(80, "zh-CN")).toBe("80")
    expect(formatDashboardScore(86.5, "zh-CN")).toBe("86.5")
    expect(formatDashboardScore(100, "zh-CN")).toBe("100")
  })
})
