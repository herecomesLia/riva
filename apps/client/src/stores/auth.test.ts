import { beforeEach, describe, expect, it } from "vitest"

import { useAuthStore } from "@/stores/auth"
import { resetStores } from "@/test/stores"

describe("auth store", () => {
  beforeEach(() => {
    resetStores()
  })

  it("signs in with a normalized current user and session", () => {
    useAuthStore.getState().signIn("  eleno  ")

    const state = useAuthStore.getState()

    expect(state.isAuthenticated).toBe(true)
    expect(state.currentUser).toMatchObject({
      avatarFallback: "EL",
      displayName: "eleno",
      id: "local:eleno",
      username: "eleno",
    })
    expect(state.session?.id).toContain("local:eleno:")
    expect(state.session?.signedInAt).toEqual(expect.any(String))
  })

  it("signs out and clears session state", () => {
    useAuthStore.getState().signIn("eleno")

    useAuthStore.getState().signOut()

    expect(useAuthStore.getState()).toMatchObject({
      currentUser: null,
      isAuthenticated: false,
      session: null,
    })
  })
})
