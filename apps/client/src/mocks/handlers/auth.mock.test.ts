import { setupServer } from "msw/node"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { login, logout } from "@/api/generated/endpoints/auth/auth"
import { getCurrentUser } from "@/api/generated/endpoints/users/users"
import { authFaker } from "@/mocks/fakers/auth"
import { authCredentialsFixture, authUserFixture } from "@/mocks/fixtures/auth"
import { handlers } from "@/mocks/handlers"

const server = setupServer(...handlers)

beforeAll(() => server.listen({ onUnhandledRequest: "error" }))
beforeEach(() => authFaker.reset())
afterAll(() => server.close())

describe("auth handlers", () => {
  it("returns the formal invalid-credentials response for a failed login", async () => {
    const request = login({ username: "rivauser", password: "wrong" })

    await expect(request).rejects.toMatchObject({
      code: "auth.invalid_credentials",
      requestId: "mock-auth-request-id",
      status: 401,
    })
  })

  it("keeps login, current-user lookup, and logout in one observable state", async () => {
    await expect(login(authCredentialsFixture)).resolves.toEqual(authUserFixture)
    await expect(getCurrentUser()).resolves.toEqual(authUserFixture)

    await logout()
    await expect(getCurrentUser()).rejects.toMatchObject({
      code: "auth.not_authenticated",
      status: 401,
    })
  })
})
