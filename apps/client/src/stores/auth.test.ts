import { beforeEach, describe, expect, it } from "vitest"

import { authSessionMock, authUserMock } from "@/mocks/data/auth"
import { useAuthStore } from "@/stores/auth"
import { resetStores } from "@/test/stores"

describe("auth store", () => {
  beforeEach(() => {
    resetStores()
  })

  it("sets the provided auth session state", () => {
    useAuthStore.getState().setAuthSession(authUserMock, authSessionMock)

    const state = useAuthStore.getState()

    expect(state.isAuthenticated).toBe(true)
    expect(state.currentUser).toEqual(authUserMock)
    expect(state.session).toEqual(authSessionMock)
  })

  it("clears auth session state", () => {
    useAuthStore.getState().setAuthSession(authUserMock, authSessionMock)

    useAuthStore.getState().clearAuthSession()

    expect(useAuthStore.getState()).toMatchObject({
      currentUser: null,
      isAuthenticated: false,
      session: null,
    })
  })
})
