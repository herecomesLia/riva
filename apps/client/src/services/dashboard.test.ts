import { describe, expect, it, vi } from "vitest"

import { dashboardFixture } from "@/mocks/fixtures/dashboard"
import { matchResultFixture, targetRoleFixture } from "@/mocks/fixtures/target-role"
import type { RoleView } from "@/models/target-role-workflow"
import { getRoles } from "@/services/roles"
import { getDashboardData } from "./dashboard"

vi.mock("@/services/roles", () => ({ getRoles: vi.fn() }))

const role = {
  ...structuredClone(targetRoleFixture),
  jdState: { status: "ready", result: structuredClone(targetRoleFixture.jd) },
  matchState: { status: "current", result: structuredClone(matchResultFixture) },
} satisfies RoleView

describe("getDashboardData", () => {
  it("projects the active role and uses fixed training data", async () => {
    vi.mocked(getRoles).mockResolvedValue({
      roles: [role],
      activeRoleId: role.id,
      profile: { exists: true, complete: true },
    })

    const response = await getDashboardData()
    expect(response).toEqual({
      ...dashboardFixture,
      currentRole: {
        id: role.id,
        title: role.title,
        company: role.company,
        recruitmentType: role.recruitmentTrack,
        location: role.location,
        profileCompleted: true,
        jobDescriptionAdded: true,
      },
      metrics: {
        ...dashboardFixture.metrics,
        roleFit: { currentValue: matchResultFixture.overallMatchScore, previousValue: null },
      },
    })
  })

  it("keeps training data when no role is active", async () => {
    vi.mocked(getRoles).mockResolvedValue({
      roles: [role],
      activeRoleId: null,
      profile: { exists: true, complete: true },
    })
    expect(await getDashboardData()).toEqual(dashboardFixture)
  })

  it("projects incomplete prerequisites without exposing a stale score", async () => {
    const incomplete: RoleView = structuredClone(role)
    incomplete.jdState = { status: "missing" }
    incomplete.matchState = { status: "stale", result: structuredClone(matchResultFixture) }
    vi.mocked(getRoles).mockResolvedValue({
      roles: [incomplete],
      activeRoleId: incomplete.id,
      profile: { exists: true, complete: false },
    })
    const response = await getDashboardData()
    expect(response.currentRole).toMatchObject({
      profileCompleted: false,
      jobDescriptionAdded: false,
    })
    expect(response.metrics.roleFit).toEqual({ currentValue: null, previousValue: null })
  })
})
