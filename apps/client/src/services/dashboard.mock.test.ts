import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { dashboardResponseMock } from "@/mocks/data/dashboard"
import { resetRolesMockState } from "@/mocks/services/roles"
import { resetTrainingRecordsMockState } from "@/mocks/services/training-records"
import { getDashboardData } from "@/services/dashboard"
import type { TargetRoleExperienceRange } from "@/models/roles"
import { getRolesPage, setCurrentTargetRole, updateTargetRole } from "@/services/roles"

beforeEach(() => {
  vi.useFakeTimers()
  resetRolesMockState()
  resetTrainingRecordsMockState()
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

async function settle<T>(promise: Promise<T>) {
  await vi.runAllTimersAsync()
  return promise
}

async function updateCurrentExperienceRange(experienceRange: TargetRoleExperienceRange | null) {
  const roles = await settle(getRolesPage())
  const role = roles.roles.find((candidate) => candidate.id === roles.currentRoleId)!
  await settle(
    updateTargetRole({
      roleId: role.id,
      version: role.version,
      title: role.title,
      company: role.company,
      recruitmentType: role.recruitmentType,
      location: role.location,
      experienceRange,
    }),
  )
  return settle(getDashboardData())
}

describe("getDashboardData mock service", () => {
  it("returns a dashboard summary projected from the current target-role state", async () => {
    const roles = await settle(getRolesPage())
    const currentRole = roles.roles.find((role) => role.id === roles.currentRoleId)!
    const matchingAnalysis = currentRole.matchingAnalysis
    if (matchingAnalysis?.status !== "current") {
      throw new Error("Expected the default current matching-analysis fixture.")
    }

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
      metrics: {
        roleFit: {
          currentValue: matchingAnalysis.result.overallMatchScore,
          previousValue: null,
        },
      },
    })
    expect(matchingAnalysis.result.overallMatchScore).not.toBe(
      dashboardResponseMock.metrics.roleFit.currentValue,
    )
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

  it("returns a real empty training state when the repository is empty", async () => {
    resetTrainingRecordsMockState("empty")

    const dashboard = await settle(getDashboardData())

    expect(dashboard.metrics).toMatchObject({
      practiceTimeMinutes: { currentValue: null, previousValue: null },
      targetedPracticeScore: { currentValue: null, previousValue: null },
      mockInterviewScore: { currentValue: null, previousValue: null },
    })
    expect(dashboard.performanceTrend).toEqual({
      targetedPractice: [],
      mockInterview: [],
    })
    expect(dashboard.weaknesses).toEqual([])
    expect(dashboard.recommendation).toBeNull()
  })

  it("reflects a target-role current switch on the next dashboard request", async () => {
    resetRolesMockState("multipleRoles")
    const roles = await settle(getRolesPage())
    const nextRole = roles.roles.find((role) => role.id !== roles.currentRoleId)!

    await settle(setCurrentTargetRole({ roleId: nextRole.id, version: nextRole.version }))
    const dashboard = await settle(getDashboardData())

    expect(dashboard.currentRole).toMatchObject({
      id: nextRole.id,
      title: nextRole.title,
      profileCompleted: true,
      jobDescriptionAdded: false,
    })
    expect(dashboard.metrics.roleFit).toEqual({ currentValue: null, previousValue: null })
  })

  it("derives profile and JD completion flags from domain state", async () => {
    resetRolesMockState("profileMissing")
    const missingProfile = await settle(getDashboardData())
    expect(missingProfile.currentRole).toMatchObject({
      profileCompleted: false,
      jobDescriptionAdded: true,
    })

    resetRolesMockState("roleWithSavedJobDescription")
    const savedJobDescription = await settle(getDashboardData())
    expect(savedJobDescription.currentRole).toMatchObject({
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

  it.each(["noRoles", "rolesWithoutCurrent"] as const)(
    "returns no current-role summary for the %s scenario",
    async (scenario) => {
      resetRolesMockState(scenario)

      await expect(settle(getDashboardData())).resolves.toMatchObject({
        currentRole: null,
        metrics: { roleFit: { currentValue: null, previousValue: null } },
      })
    },
  )

  it.each(["matchingAnalysisStale", "roleWithParsedJobDescription"] as const)(
    "does not expose %s as a current role-fit score",
    async (scenario) => {
      resetRolesMockState(scenario)

      const dashboard = await settle(getDashboardData())

      expect(dashboard.metrics.roleFit).toEqual({ currentValue: null, previousValue: null })
    },
  )

  it.each([
    [
      { minYears: 3, maxYears: 5 },
      { min: 3, max: 5 },
    ],
    [
      { minYears: 5, maxYears: null },
      { min: 5, max: null },
    ],
    [
      { minYears: null, maxYears: 3 },
      { min: null, max: 3 },
    ],
    [{ minYears: null, maxYears: null }, null],
    [null, null],
  ] satisfies Array<
    [TargetRoleExperienceRange | null, { min: number | null; max: number | null } | null]
  >)(
    "projects the %o experience range without losing one-sided bounds",
    async (range, expected) => {
      const dashboard = await updateCurrentExperienceRange(range)

      expect(dashboard.currentRole?.experienceYears).toEqual(expected)
    },
  )
})
