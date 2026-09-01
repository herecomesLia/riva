import { describe, expect, it } from "vitest"

import { createAuthFaker } from "@/mocks/fakers/auth"
import { authCredentialsFixture, authUserFixture } from "@/mocks/fixtures/auth"

const newAccountCredentials = {
  password: "ValidPass123!",
  username: "TestUser",
}

describe("auth faker", () => {
  it("starts signed out", () => {
    expect(createAuthFaker().getCurrentUser()).toBeNull()
  })

  it("stores and returns the fixed user after a valid login", () => {
    const faker = createAuthFaker()

    expect(faker.login(authCredentialsFixture)).toEqual(authUserFixture)
    expect(faker.getCurrentUser()).toEqual(authUserFixture)
  })

  it("does not establish or replace state for invalid credentials", () => {
    const signedOutFaker = createAuthFaker()
    expect(signedOutFaker.login({ username: "rivauser", password: "wrong" })).toBeNull()
    expect(signedOutFaker.getCurrentUser()).toBeNull()

    const signedInFaker = createAuthFaker()
    signedInFaker.login(authCredentialsFixture)
    expect(signedInFaker.login({ username: "unknown", password: "wrong" })).toBeNull()
    expect(signedInFaker.getCurrentUser()).toEqual(authUserFixture)
  })

  it("clears the current user on logout", () => {
    const faker = createAuthFaker()
    faker.login(authCredentialsFixture)

    faker.logout()

    expect(faker.getCurrentUser()).toBeNull()
  })

  it("registers and authenticates a new account", () => {
    const faker = createAuthFaker()
    const result = faker.register(newAccountCredentials)

    expect(result).toMatchObject({
      ok: true,
      user: {
        avatarUrl: null,
        displayName: "TestUser",
        username: "TestUser",
      },
    })
    expect(faker.getCurrentUser()).toEqual(result.ok ? result.user : null)
  })

  it("can log back in to a registered account after logout", () => {
    const faker = createAuthFaker()
    const result = faker.register(newAccountCredentials)
    faker.logout()

    expect(faker.login(newAccountCredentials)).toEqual(result.ok ? result.user : null)
  })

  it("rejects duplicate usernames case-insensitively", () => {
    const faker = createAuthFaker()
    faker.register(newAccountCredentials)

    expect(
      faker.register({
        ...newAccountCredentials,
        username: newAccountCredentials.username.toLowerCase(),
      }),
    ).toEqual({ ok: false, reason: "usernameTaken" })
  })

  it("reset removes registered accounts and restores the initial account", () => {
    const faker = createAuthFaker()
    faker.register(newAccountCredentials)

    faker.reset()

    expect(faker.getCurrentUser()).toBeNull()
    expect(faker.login(newAccountCredentials)).toBeNull()
    expect(faker.login(authCredentialsFixture)).toEqual(authUserFixture)
  })
})
