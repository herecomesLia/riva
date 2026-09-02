import { AxiosError, AxiosHeaders } from "axios"
import { describe, expect, it } from "vitest"

import { ApiError, normalizeRequestError, TransportError } from "./error"

describe("normalizeRequestError", () => {
  it("preserves a structured API error response", () => {
    const error = new AxiosError("Request failed", "ERR_BAD_REQUEST", undefined, undefined, {
      data: {
        error: {
          code: "auth.invalid_credentials",
          message: "Invalid credentials",
          issues: [{ location: ["body", "email"], message: "Invalid email" }],
        },
      },
      status: 401,
      statusText: "Unauthorized",
      headers: {},
      config: { headers: new AxiosHeaders() },
    })

    const normalized = normalizeRequestError(error)

    expect(normalized).toBeInstanceOf(ApiError)
    expect(normalized).toMatchObject({
      message: "Invalid credentials",
      code: "auth.invalid_credentials",
      issues: [{ location: ["body", "email"], message: "Invalid email" }],
    })
  })

  it("handles an unstructured HTTP response", () => {
    const error = new AxiosError("Bad gateway", "ERR_BAD_RESPONSE", undefined, undefined, {
      data: "<html>Bad Gateway</html>",
      status: 502,
      statusText: "Bad Gateway",
      headers: {},
      config: { headers: new AxiosHeaders() },
    })

    const normalized = normalizeRequestError(error)

    expect(normalized).toBeInstanceOf(Error)
    expect(normalized).not.toBeInstanceOf(ApiError)
    expect(normalized).toMatchObject({
      message: "Bad gateway",
    })
  })

  it.each([
    [undefined, "network"],
    ["ECONNABORTED", "timeout"],
    ["ETIMEDOUT", "timeout"],
    ["ERR_CANCELED", "cancelled"],
  ] as const)("maps Axios code %s to %s", (code, kind) => {
    const normalized = normalizeRequestError(new AxiosError("Request failed", code))

    expect(normalized).toBeInstanceOf(TransportError)
    expect(normalized).toMatchObject({ kind, message: "Request failed" })
  })
})
