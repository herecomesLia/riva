import { QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useAuth } from "@/hooks/use-auth"
import { userMock } from "@/mocks/data/auth"
import { useAuthStore } from "@/stores/auth"
import { resetStores } from "@/test/stores"
import { createTestQueryClient } from "@/test/query-client"

vi.mock("@/services/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/auth")>()),
  login: vi.fn(),
  logout: vi.fn(),
  register: vi.fn(),
  restoreCurrentUser: vi.fn(),
}))

describe("useAuth", () => {
  let queryClient: ReturnType<typeof createTestQueryClient>

  beforeEach(() => {
    resetStores()
    queryClient = createTestQueryClient()
  })

  function renderUseAuth() {
    return renderHook(() => useAuth(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    })
  }

  it("does not automatically sign in when restoring no current user", async () => {
    const { restoreCurrentUser } = await import("@/services/auth")
    vi.mocked(restoreCurrentUser).mockResolvedValue(null)
    const { result } = renderUseAuth()

    await act(async () => {
      await expect(result.current.restoreCurrentUser()).resolves.toBeNull()
    })

    expect(useAuthStore.getState().currentUser).toBeNull()
    expect(result.current.isAuthenticated).toBe(false)
  })

  it("stores a user after login", async () => {
    const { login } = await import("@/services/auth")
    vi.mocked(login).mockResolvedValue(userMock)
    queryClient.setQueryData(["roles"], { stale: true })
    const { result } = renderUseAuth()

    await act(async () => {
      await expect(
        result.current.login({
          password: "correct-password",
          username: "rivauser",
        }),
      ).resolves.toEqual(userMock)
    })

    expect(useAuthStore.getState().currentUser).toEqual(userMock)
    expect(queryClient.getQueryData(["roles"])).toBeUndefined()
    expect(result.current.isAuthenticated).toBe(true)
  })

  it("stores a user after registration", async () => {
    const { register } = await import("@/services/auth")
    vi.mocked(register).mockResolvedValue(userMock)
    queryClient.setQueryData(["roles"], { stale: true })
    const { result } = renderUseAuth()

    await act(async () => {
      await expect(
        result.current.register({
          password: "correct-password",
          username: "rivauser",
        }),
      ).resolves.toEqual(userMock)
    })

    expect(useAuthStore.getState().currentUser).toEqual(userMock)
    expect(queryClient.getQueryData(["roles"])).toBeUndefined()
    expect(result.current.isAuthenticated).toBe(true)
  })

  it("restores a user into the store", async () => {
    const { restoreCurrentUser } = await import("@/services/auth")
    vi.mocked(restoreCurrentUser).mockResolvedValue(userMock)
    const { result } = renderUseAuth()

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
    queryClient.setQueryData(["roles"], { stale: true })
    const { result } = renderUseAuth()

    await act(async () => {
      await expect(result.current.logout()).resolves.toBeUndefined()
    })

    expect(useAuthStore.getState().currentUser).toBeNull()
    expect(queryClient.getQueryData(["roles"])).toBeUndefined()
    expect(result.current.isAuthenticated).toBe(false)
  })
})
