import { beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError, TransportError } from "@/api/error"
import { getCurrentUser as getCurrentUserRequest } from "@/api/generated/endpoints/users/users"
import { authUserFixture } from "@/mocks/fixtures/auth"
import { getCurrentUser } from "@/services/auth"

vi.mock("@/api/generated/endpoints/users/users", () => ({
  getCurrentUser: vi.fn(),
}))

describe("auth service", () => {
  beforeEach(() => {
    vi.mocked(getCurrentUserRequest).mockResolvedValue(authUserFixture)
  })

  it("returns the server user contract unchanged", async () => {
    await expect(getCurrentUser()).resolves.toEqual(authUserFixture)
  })

  it.each(["auth.invalid_session", "auth.not_authenticated", "auth.session_expired"] as const)(
    "maps %s to no restored session",
    async (code) => {
      vi.mocked(getCurrentUserRequest).mockRejectedValue(
        new ApiError({
          error: { code, message: "Authentication is required.", issues: [] },
        }),
      )

      await expect(getCurrentUser()).resolves.toBeNull()
    },
  )

  it("does not hide non-authentication failures during session restoration", async () => {
    const error = new TransportError("network", "Network unavailable")
    vi.mocked(getCurrentUserRequest).mockRejectedValue(error)

    await expect(getCurrentUser()).rejects.toBe(error)
  })
})
