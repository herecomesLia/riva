import { describe, expect, it } from "vitest"

import { createAuthFaker } from "@/mocks/fakers/auth"
import { authCredentialsFixture, authUserFixture } from "@/mocks/fixtures/auth"

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

  it("restores the initial state on reset", () => {
    const faker = createAuthFaker()
    faker.login(authCredentialsFixture)

    faker.reset()

    expect(faker.getCurrentUser()).toBeNull()
  })
})
