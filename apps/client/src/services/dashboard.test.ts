import { getProfile } from "@/services/profile"
import { careerProfileFixture } from "@/mocks/fixtures/career-profile"
import { createRoleStoryResponse } from "@/pages/roles/stories/role-story-fixtures"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { dashboardFixture } from "@/mocks/fixtures/dashboard"
import { matchResultFixture, roleFixture } from "@/mocks/fixtures/role"
import type { RoleResponse } from "@/api/generated/models"
import { getRoles, getMatchingAnalysis, getJdExtractionState } from "@/services/roles"
import { getDashboardData } from "./dashboard"

vi.mock("@/services/roles", () => ({
  getRoles: vi.fn(),
  getMatchingAnalysis: vi.fn(),
  getJdExtractionState: vi.fn(),
}))
vi.mock("@/services/profile", () => ({ getProfile: vi.fn() }))
beforeEach(() => {
  vi.mocked(getProfile).mockResolvedValue(careerProfileFixture)
  vi.mocked(getJdExtractionState).mockResolvedValue({ status: "idle", error: null })
  vi.mocked(getMatchingAnalysis).mockResolvedValue({
    status: "current",
    result: matchResultFixture,
  })
})

const role = {
  ...structuredClone(roleFixture),
} satisfies RoleResponse

describe("getDashboardData", () => {
  it("projects the active role and uses fixed training data", async () => {
    vi.mocked(getRoles).mockResolvedValue({
      roles: [role],
      activeRoleId: role.id,
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
    })
    expect(await getDashboardData()).toEqual(dashboardFixture)
  })

  it("projects incomplete prerequisites without exposing a stale score", async () => {
    const incomplete: RoleResponse = structuredClone(role)
    incomplete.jd = createRoleStoryResponse("singleRoleWithoutJobDescription").roles[0]!.jd
    vi.mocked(getProfile).mockResolvedValue({ ...careerProfileFixture, skills: [] })
    vi.mocked(getMatchingAnalysis).mockResolvedValue({
      status: "stale",
      result: matchResultFixture,
    })
    vi.mocked(getRoles).mockResolvedValue({
      roles: [incomplete],
      activeRoleId: incomplete.id,
    })
    const response = await getDashboardData()
    expect(response.currentRole).toMatchObject({
      profileCompleted: false,
      jobDescriptionAdded: false,
    })
    expect(response.metrics.roleFit).toEqual({ currentValue: null, previousValue: null })
  })
})
