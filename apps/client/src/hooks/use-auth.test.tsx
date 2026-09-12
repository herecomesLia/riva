import { QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import type { PropsWithChildren } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { CURRENT_USER_QUERY_KEY, useAuth } from "@/hooks/use-auth"
import { createTestQueryClient } from "@/test/query-client"

vi.mock("@/services/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/auth")>()),
  register: vi.fn(),
  getCurrentUser: vi.fn(async () => null),
}))

describe("useAuth", () => {
  let queryClient = createTestQueryClient()
  function wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }

  beforeEach(() => {
    queryClient = createTestQueryClient()
  })

  it("does not automatically sign in when restoring no current user", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => expect(result.current.isPending).toBe(false))

    expect(queryClient.getQueryData(CURRENT_USER_QUERY_KEY)).toBeNull()
    expect(result.current.isAuthenticated).toBe(false)
  })

  it("replaces the session cache with the authenticated user returned by registration", async () => {
    const { register } = await import("@/services/auth")
    const user = {
      avatarUrl: null,
      displayName: "NewUser",
      id: "00000000-0000-4000-8000-000000000001",
      username: "NewUser",
    }
    vi.mocked(register).mockResolvedValue(user)
    queryClient.setQueryData(["profile"], { id: "previous-user-profile" })
    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.isPending).toBe(false))

    await act(async () => {
      await expect(
        result.current.register({ username: "NewUser", password: "ValidPass123!" }),
      ).resolves.toEqual(user)
    })

    expect(queryClient.getQueryData(CURRENT_USER_QUERY_KEY)).toEqual(user)
    expect(queryClient.getQueryCache().findAll()).toHaveLength(1)
  })
})
