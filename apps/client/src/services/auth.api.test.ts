import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ZodError } from "zod"

import { getCurrentAuthUser, login, logout, restoreCurrentUser } from "@/services/auth"

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json",
    },
    status,
  })
}

describe("auth service API", () => {
  const fetchMock = vi.fn<typeof fetch>()
  const userId = "11111111-1111-4111-8111-111111111111"
  const otherUserId = "22222222-2222-4222-8222-222222222222"

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("loads the full user account after login", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          id: userId,
          username: "lia",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          avatarUrl: null,
          displayName: "Lia Chen",
          id: userId,
          username: "lia",
        }),
      )

    await expect(login({ password: "correct-password", username: "lia" })).resolves.toEqual({
      avatarFallback: "LC",
      avatarUrl: null,
      displayName: "Lia Chen",
      id: userId,
      username: "lia",
    })

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/auth/login", "/api/users/me"])
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      body: JSON.stringify({
        password: "correct-password",
        username: "lia",
      }),
      credentials: "include",
      method: "POST",
    })
  })

  it("maps invalid credentials without matching error messages", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "invalid_credentials" }, 401))

    await expect(login({ password: "wrong", username: "lia" })).rejects.toMatchObject({
      code: "invalidCredentials",
    })
  })

  it.each([
    ["network errors", new TypeError("fetch failed")],
    ["503 responses", new Response(null, { status: 503 })],
  ])("maps %s to serviceUnavailable", async (_case, failure) => {
    if (failure instanceof Response) {
      fetchMock.mockResolvedValueOnce(failure)
    } else {
      fetchMock.mockRejectedValueOnce(failure)
    }

    await expect(login({ password: "secret", username: "lia" })).rejects.toMatchObject({
      code: "serviceUnavailable",
    })
  })

  it("maps other API errors to unknown", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "csrf_failed" }, 403))

    await expect(login({ password: "secret", username: "lia" })).rejects.toMatchObject({
      code: "unknown",
    })
  })

  it("returns null when restoring receives 401", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "not_authenticated" }, 401))

    await expect(restoreCurrentUser()).resolves.toBeNull()
  })

  it("restores the full current user from users/me", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        avatarUrl: "https://example.com/avatar.png",
        displayName: "林 雅",
        id: otherUserId,
        username: "linya",
      }),
    )

    await expect(restoreCurrentUser()).resolves.toEqual({
      avatarFallback: "林雅",
      avatarUrl: "https://example.com/avatar.png",
      displayName: "林 雅",
      id: otherUserId,
      username: "linya",
    })
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/users/me")
  })

  it("does not swallow non-401 restore errors", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: "service_unavailable" }, 503))

    await expect(restoreCurrentUser()).rejects.toMatchObject({
      code: "service_unavailable",
      status: 503,
    })
  })

  it("calls auth/me for the current authentication identity", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: userId, username: "lia" }))

    await expect(getCurrentAuthUser()).resolves.toEqual({
      id: userId,
      username: "lia",
    })
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/auth/me")
  })

  it("rejects a users/me account that does not match the login identity", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ id: userId, username: "lia" }))
      .mockResolvedValueOnce(
        jsonResponse({
          avatarUrl: null,
          displayName: "Another User",
          id: otherUserId,
          username: "other",
        }),
      )

    await expect(login({ password: "correct-password", username: "lia" })).rejects.toMatchObject({
      code: "unknown",
    })
  })

  it("rejects malformed account responses", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        avatarUrl: null,
        displayName: "",
        id: "not-a-uuid",
        username: "lia",
      }),
    )

    await expect(restoreCurrentUser()).rejects.toBeInstanceOf(ZodError)
  })

  it("handles a successful 204 logout", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))

    await expect(logout()).resolves.toBeUndefined()
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/auth/logout")
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      credentials: "include",
      method: "POST",
    })
  })
})
