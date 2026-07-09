import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"

import { useAuth } from "@/hooks/use-auth"
import { useAuthStore } from "@/stores/auth"
import { resetStores } from "@/test/stores"

describe("useAuth", () => {
  beforeEach(() => {
    resetStores()
  })

  it("does not automatically sign in when restoring the current user in mock mode", async () => {
    const { result } = renderHook(() => useAuth())

    await act(async () => {
      await expect(result.current.restoreCurrentUser()).resolves.toBeNull()
    })

    expect(useAuthStore.getState().currentUser).toBeNull()
    expect(result.current.isAuthenticated).toBe(false)
  })
})
