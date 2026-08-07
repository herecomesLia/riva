import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { mockLoginCredentials, userMock } from "@/mocks/data/auth"
import { getCurrentAuthUser, login, logout, register, restoreCurrentUser } from "@/services/auth"

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

  it("registers without fetching and uses the submitted username", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
    const registerPromise = register({ password: "Correct123!", username: "new_user" })

    await vi.advanceTimersByTimeAsync(500)

    await expect(registerPromise).resolves.toMatchObject({
      avatarUrl: null,
      displayName: "new_user",
      id: userMock.id,
      username: "new_user",
    })
    expect(fetchMock).not.toHaveBeenCalled()
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

  it("keeps the existing unauthenticated restore behavior", async () => {
    const restorePromise = restoreCurrentUser()

    await vi.advanceTimersByTimeAsync(500)

    await expect(restorePromise).resolves.toBeNull()
  })

  it("keeps logout available without a backend", async () => {
    const logoutPromise = logout()

    await vi.advanceTimersByTimeAsync(500)

    await expect(logoutPromise).resolves.toBeUndefined()
  })

  it("returns the mock authentication identity", async () => {
    const currentUserPromise = getCurrentAuthUser()

    await vi.advanceTimersByTimeAsync(500)

    await expect(currentUserPromise).resolves.toEqual({
      id: userMock.id,
      username: userMock.username,
    })
  })
})
