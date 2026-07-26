import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { mockLoginCredentials, userMock } from "@/mocks/data/auth"
import { login } from "@/services/auth"

async function resolveMockLogin(
  username: string = mockLoginCredentials.username,
  password: string = mockLoginCredentials.password,
) {
  const loginPromise = login({ password, username })

  await vi.advanceTimersByTimeAsync(500)

  return loginPromise
}

describe("auth service mock login", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it("returns a user for the configured mock credentials", async () => {
    await expect(resolveMockLogin()).resolves.toEqual(userMock)
  })

  it("throws invalidCredentials for incorrect mock credentials", async () => {
    const loginPromise = login({
      password: "wrong-password",
      username: mockLoginCredentials.username,
    })
    const expectation = expect(loginPromise).rejects.toMatchObject({
      code: "invalidCredentials",
    })

    await vi.advanceTimersByTimeAsync(500)
    await expectation
  })

  it("returns an independent user object for each successful mock login", async () => {
    const firstUser = await resolveMockLogin()

    firstUser.displayName = "Mutated User"

    const secondUser = await resolveMockLogin()

    expect(secondUser).toEqual(userMock)
    expect(secondUser).not.toBe(firstUser)
  })
})
