import { beforeEach, describe, expect, it } from "vitest"

import { userMock } from "@/mocks/data/auth"
import { useAuthStore } from "@/stores/auth"
import { resetStores } from "@/test/stores"

describe("auth store", () => {
  beforeEach(() => {
    resetStores()
  })

  it("sets the provided current user state", () => {
    useAuthStore.getState().setCurrentUser(userMock)

    const state = useAuthStore.getState()

    expect(state.currentUser).toEqual(userMock)
    expect("isAuthenticated" in state).toBe(false)
  })

  it("clears current user state", () => {
    useAuthStore.getState().setCurrentUser(userMock)

    useAuthStore.getState().clearCurrentUser()

    expect(useAuthStore.getState()).toMatchObject({
      currentUser: null,
    })
    expect("isAuthenticated" in useAuthStore.getState()).toBe(false)
  })
})
