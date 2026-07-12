import { describe, expect, it } from "vitest"

import { calculatePercentageChange } from "./dashboard-utils"

describe("calculatePercentageChange", () => {
  it("calculates an increase from the previous value", () => {
    const change = calculatePercentageChange(76, 65.8)

    expect(change?.direction).toBe("up")
    expect(change?.percentage).toBeCloseTo(15.5, 1)
  })

  it("calculates a decrease and a steady result", () => {
    expect(calculatePercentageChange(45, 49)).toMatchObject({ direction: "down" })
    expect(calculatePercentageChange(7.2, 7.2)).toEqual({ direction: "unchanged", percentage: 0 })
  })

  it("does not calculate a comparison without usable values", () => {
    expect(calculatePercentageChange(null, 7.4)).toBeNull()
    expect(calculatePercentageChange(7.4, null)).toBeNull()
    expect(calculatePercentageChange(7.4, 0)).toBeNull()
  })
})
