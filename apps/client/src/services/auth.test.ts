import { beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError, TransportError } from "@/api/error"
import { getCurrentUser } from "@/api/generated/endpoints/users/users"
import { authUserFixture } from "@/mocks/fixtures/auth"
import { restoreCurrentUser } from "@/services/auth"

vi.mock("@/api/generated/endpoints/users/users", () => ({
  getCurrentUser: vi.fn(),
}))

describe("auth service", () => {
  beforeEach(() => {
    vi.mocked(getCurrentUser).mockResolvedValue(authUserFixture)
  })

  it("maps a server user to the UI user model", async () => {
    await expect(restoreCurrentUser()).resolves.toEqual({
      ...authUserFixture,
      avatarFallback: "R",
      avatarUrl: undefined,
    })
  })

  it("maps only an unauthenticated response to no restored session", async () => {
    vi.mocked(getCurrentUser).mockRejectedValue(
      new ApiError(
        401,
        {
          error: { code: "auth.not_authenticated", message: "Authentication is required." },
        },
        "Request failed",
      ),
    )

    await expect(restoreCurrentUser()).resolves.toBeNull()
  })

  it("does not hide non-authentication failures during session restoration", async () => {
    const error = new TransportError("network", "Network unavailable")
    vi.mocked(getCurrentUser).mockRejectedValue(error)

    await expect(restoreCurrentUser()).rejects.toBe(error)
  })
})
