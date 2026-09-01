import { beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError, TransportError } from "@/api/error"
import {
  login as loginRequest,
  logout as logoutRequest,
  register as registerRequest,
} from "@/api/generated/endpoints/auth/auth"
import { getCurrentUser } from "@/api/generated/endpoints/users/users"
import { authCredentialsFixture, authUserFixture } from "@/mocks/fixtures/auth"
import { login, logout, register, restoreCurrentUser } from "@/services/auth"

vi.mock("@/api/generated/endpoints/auth/auth", () => ({
  login: vi.fn(),
  logout: vi.fn(),
  register: vi.fn(),
}))
vi.mock("@/api/generated/endpoints/users/users", () => ({
  getCurrentUser: vi.fn(),
}))

describe("auth service", () => {
  beforeEach(() => {
    vi.mocked(loginRequest).mockResolvedValue(authUserFixture)
    vi.mocked(logoutRequest).mockResolvedValue()
    vi.mocked(registerRequest).mockResolvedValue(authUserFixture)
    vi.mocked(getCurrentUser).mockResolvedValue(authUserFixture)
  })

  it("registers through the generated operation and maps its response", async () => {
    const credentials = { username: "NewUser", password: "ValidPass123!" }
    const response = {
      ...authUserFixture,
      displayName: credentials.username,
      username: credentials.username,
    }
    vi.mocked(registerRequest).mockResolvedValue(response)

    await expect(register(credentials)).resolves.toEqual({
      ...response,
      avatarFallback: "N",
      avatarUrl: undefined,
    })
    expect(registerRequest).toHaveBeenCalledWith(credentials)
  })

  it("uses generated operations and maps server users to the UI model", async () => {
    await expect(login(authCredentialsFixture)).resolves.toEqual({
      ...authUserFixture,
      avatarFallback: "R",
      avatarUrl: undefined,
    })
    expect(loginRequest).toHaveBeenCalledWith(authCredentialsFixture)

    await expect(logout()).resolves.toBeUndefined()
    expect(logoutRequest).toHaveBeenCalledOnce()
  })

  it("maps only an unauthenticated response to no restored session", async () => {
    vi.mocked(getCurrentUser).mockRejectedValue(
      new ApiError(
        401,
        {
          error: { code: "auth.not_authenticated", message: "Authentication is required." },
          requestId: "request-1",
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
