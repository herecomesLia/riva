import { describe, expect, it } from "vitest"

import { resolveHeroesAction } from "./hero-motion"

describe("resolveHeroesAction", () => {
  it.each([
    [{ isPasswordEmpty: true, isPasswordVisible: false, isUsernameFocused: false }, "idle"],
    [{ isPasswordEmpty: true, isPasswordVisible: false, isUsernameFocused: true }, "peek"],
    [{ isPasswordEmpty: false, isPasswordVisible: false, isUsernameFocused: false }, "peek"],
    [{ isPasswordEmpty: false, isPasswordVisible: true, isUsernameFocused: true }, "look-away"],
  ] as const)("returns %s for the current form state", (state, action) => {
    expect(resolveHeroesAction(state)).toBe(action)
  })
})
