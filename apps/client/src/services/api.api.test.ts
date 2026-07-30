import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { apiRequest, ApiError } from "@/services/api"

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json",
    },
    status,
  })
}

describe("API client", () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("joins paths to apiBaseUrl and includes credentials", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }))

    await apiRequest("/status")

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/status")
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      credentials: "include",
    })
  })

  it("serializes JSON requests and parses JSON responses", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "result-1" }))

    await expect(
      apiRequest<{ id: string }>("/results", {
        json: { title: "Result" },
        method: "POST",
      }),
    ).resolves.toEqual({ id: "result-1" })

    const request = fetchMock.mock.calls[0]?.[1]

    expect(request?.body).toBe(JSON.stringify({ title: "Result" }))
    expect(new Headers(request?.headers).get("Content-Type")).toBe("application/json")
  })

  it("returns undefined for 204 No Content", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))

    await expect(apiRequest<void>("/session", { method: "DELETE" })).resolves.toBeUndefined()
  })

  it("throws a structured ApiError for non-2xx responses", async () => {
    const responseBody = { error: "invalid_credentials" }

    fetchMock.mockResolvedValueOnce(jsonResponse(responseBody, 401))

    const error = await apiRequest("/session").catch((reason: unknown) => reason)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      body: responseBody,
      code: "invalid_credentials",
      status: 401,
    })
  })

  it("preserves fetch network errors", async () => {
    const networkError = new TypeError("fetch failed")

    fetchMock.mockRejectedValueOnce(networkError)

    await expect(apiRequest("/status")).rejects.toBe(networkError)
  })
})
