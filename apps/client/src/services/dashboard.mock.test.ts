import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { dashboardResponseMock } from "@/mocks/data/dashboard"
import { getDashboardData } from "@/services/dashboard"
import { getRolesPage, resetRolesMockState, setCurrentTargetRole } from "@/services/roles"

beforeEach(() => {
  vi.useFakeTimers()
  resetRolesMockState()
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

async function settle<T>(promise: Promise<T>) {
  await vi.runAllTimersAsync()
  return promise
}

describe("getDashboardData mock service", () => {
  it("returns a dashboard summary projected from the current target-role state", async () => {
    const roles = await settle(getRolesPage())
    const currentRole = roles.roles.find((role) => role.id === roles.currentRoleId)!

    const responsePromise = getDashboardData()
    await vi.advanceTimersByTimeAsync(999)
    const pendingCheck = await Promise.race([
      responsePromise.then(() => "resolved"),
      Promise.resolve("pending"),
    ])
    expect(pendingCheck).toBe("pending")
    await vi.advanceTimersByTimeAsync(1)

    await expect(responsePromise).resolves.toMatchObject({
      currentRole: {
        id: currentRole.id,
        title: currentRole.title,
        profileCompleted: true,
        jobDescriptionAdded: true,
      },
    })
  })

  it("returns an independent response copy for each mock request", async () => {
    const firstResponse = await settle(getDashboardData())
    firstResponse.currentRole!.title = "Mutated role title"
    firstResponse.weaknesses[0].description = "Mutated weakness description"

    const secondResponse = await settle(getDashboardData())

    expect(secondResponse.currentRole!.title).not.toBe("Mutated role title")
    expect(secondResponse.weaknesses).toEqual(dashboardResponseMock.weaknesses)
    expect(secondResponse).not.toBe(firstResponse)
  })

  it("reflects a target-role current switch on the next dashboard request", async () => {
    resetRolesMockState("multipleRoles")
    const roles = await settle(getRolesPage())
    const nextRole = roles.roles.find((role) => !role.isCurrent)!

    await settle(setCurrentTargetRole({ roleId: nextRole.id, version: nextRole.version }))
    const dashboard = await settle(getDashboardData())

    expect(dashboard.currentRole).toMatchObject({
      id: nextRole.id,
      title: nextRole.title,
      profileCompleted: true,
      jobDescriptionAdded: false,
    })
  })

  it("derives profile and JD completion flags from domain state", async () => {
    resetRolesMockState("profileMissing")
    const missingProfile = await settle(getDashboardData())
    expect(missingProfile.currentRole).toMatchObject({
      profileCompleted: false,
      jobDescriptionAdded: true,
    })

    resetRolesMockState("roleWithJobDescriptionParsing")
    const parsingJobDescription = await settle(getDashboardData())
    expect(parsingJobDescription.currentRole).toMatchObject({
      profileCompleted: true,
      jobDescriptionAdded: true,
    })

    resetRolesMockState("singleRoleWithoutJobDescription")
    const missingJobDescription = await settle(getDashboardData())
    expect(missingJobDescription.currentRole).toMatchObject({
      profileCompleted: true,
      jobDescriptionAdded: false,
    })
  })

  it("returns no current-role summary when the roles domain has no current role", async () => {
    resetRolesMockState("noRoles")

    await expect(settle(getDashboardData())).resolves.toMatchObject({ currentRole: null })
  })
})
