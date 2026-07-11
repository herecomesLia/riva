import { describe, expect, it } from "vitest"

import { createLoginHeroesScene } from "./hero-scene"

describe("createLoginHeroesScene", () => {
  it("scales horizontal geometry without changing character heights", () => {
    const input = {
      action: "idle" as const,
      isPurplePeeking: false,
      isShowingMutualLook: false,
      pointerPosition: null,
    }
    const fullScene = createLoginHeroesScene({ ...input, horizontalScale: 1 })
    const halfScene = createLoginHeroesScene({ ...input, horizontalScale: 0.5 })

    for (const character of ["purple", "black", "orange", "yellow"] as const) {
      expect(halfScene[character].body.left).toBeCloseTo(fullScene[character].body.left * 0.5)
      expect(halfScene[character].body.width).toBeCloseTo(fullScene[character].body.width * 0.5)
      expect(halfScene[character].body.height).toBe(fullScene[character].body.height)
    }
  })
})
