import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useAuth } from "@/hooks/use-auth"
import { userMock } from "@/mocks/data/auth"
import { useAuthStore } from "@/stores/auth"
import { resetStores } from "@/test/stores"

vi.mock("@/services/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/auth")>()),
  login: vi.fn(),
  logout: vi.fn(),
  restoreCurrentUser: vi.fn(),
}))

describe("useAuth", () => {
  beforeEach(() => {
    resetStores()
  })

  it("does not automatically sign in when restoring no current user", async () => {
    const { restoreCurrentUser } = await import("@/services/auth")
    vi.mocked(restoreCurrentUser).mockResolvedValue(null)
    const { result } = renderHook(() => useAuth())

    await act(async () => {
      await expect(result.current.restoreCurrentUser()).resolves.toBeNull()
    })

    expect(useAuthStore.getState().currentUser).toBeNull()
    expect(result.current.isAuthenticated).toBe(false)
  })

  it("stores a user after login", async () => {
    const { login } = await import("@/services/auth")
    vi.mocked(login).mockResolvedValue(userMock)
    const { result } = renderHook(() => useAuth())

    await act(async () => {
      await expect(
        result.current.login({
          password: "correct-password",
          username: "rivauser",
        }),
      ).resolves.toEqual(userMock)
    })

    expect(useAuthStore.getState().currentUser).toEqual(userMock)
    expect(result.current.isAuthenticated).toBe(true)
  })

  it("restores a user into the store", async () => {
    const { restoreCurrentUser } = await import("@/services/auth")
    vi.mocked(restoreCurrentUser).mockResolvedValue(userMock)
    const { result } = renderHook(() => useAuth())

    await act(async () => {
      await expect(result.current.restoreCurrentUser()).resolves.toEqual(userMock)
    })

    expect(useAuthStore.getState().currentUser).toEqual(userMock)
    expect(result.current.isAuthenticated).toBe(true)
  })

  it("clears the store only after logout succeeds", async () => {
    const { logout } = await import("@/services/auth")
    vi.mocked(logout).mockResolvedValue()
    useAuthStore.getState().setCurrentUser(userMock)
    const { result } = renderHook(() => useAuth())

    await act(async () => {
      await expect(result.current.logout()).resolves.toBeUndefined()
    })

    expect(useAuthStore.getState().currentUser).toBeNull()
    expect(result.current.isAuthenticated).toBe(false)
  })
})
