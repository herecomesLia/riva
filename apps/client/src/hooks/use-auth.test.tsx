import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useAuth } from "@/hooks/use-auth"
import { useAuthStore } from "@/stores/auth"
import { resetStores } from "@/test/stores"

vi.mock("@/services/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/auth")>()),
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
})
