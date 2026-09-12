import { beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError, TransportError } from "@/api/error"
import { authUserFixture } from "@/mocks/fixtures/auth"
import { getCurrentUser } from "@/services/auth"

const usersApi = vi.hoisted(() => ({ getCurrentUser: vi.fn() }))

vi.mock("@/api/generated/endpoints/users/users", () => ({
  getUsersApi: () => usersApi,
}))

describe("auth service", () => {
  beforeEach(() => {
    vi.mocked(usersApi.getCurrentUser).mockResolvedValue(authUserFixture)
  })

  it("returns the server user contract unchanged", async () => {
    await expect(getCurrentUser()).resolves.toEqual(authUserFixture)
  })

  it.each(["auth.invalid_session", "auth.not_authenticated", "auth.session_expired"] as const)(
    "maps %s to no restored session",
    async (code) => {
      vi.mocked(usersApi.getCurrentUser).mockRejectedValue(
        new ApiError({
          error: { code, message: "Authentication is required.", issues: [] },
        }),
      )

      await expect(getCurrentUser()).resolves.toBeNull()
    },
  )

  it("does not hide non-authentication failures during session restoration", async () => {
    const error = new TransportError("network", "Network unavailable")
    vi.mocked(usersApi.getCurrentUser).mockRejectedValue(error)

    await expect(getCurrentUser()).rejects.toBe(error)
  })
})
