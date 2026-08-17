import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ZodError } from "zod"

import type { DashboardResponseWire } from "@/schemas/dashboard"
import { getDashboardData } from "@/services/dashboard"

const roleId = "11111111-1111-4111-8111-111111111111"
const sourceId = "22222222-2222-4222-8222-222222222222"

function dashboardPayload(): DashboardResponseWire {
  return {
    currentRole: {
      id: roleId,
      title: "Backend Engineer",
      company: "Riva",
      recruitmentType: "experienced",
      location: "Shanghai",
      experienceYears: { min: 2, max: 5 },
      profileCompleted: true,
      jobDescriptionAdded: true,
    },
    recommendation: {
      id: "33333333-3333-4333-8333-333333333333",
      sourceRecordId: sourceId,
      targetRoleId: roleId,
      recommendation: {
        action: "targetedPractice",
        reason: "Add measurable outcomes.",
        questionType: "projectDeepDive",
        difficulty: "basic",
        focusAreas: ["Results and Evidence"],
      },
      estimatedMinutes: 15,
    },
    metrics: {
      roleFit: { currentValue: 82, previousValue: null },
      practiceTimeMinutes: { currentValue: 30, previousValue: 15 },
      targetedPracticeScore: { currentValue: 76, previousValue: 68 },
      mockInterviewScore: { currentValue: null, previousValue: null },
    },
    performanceTrend: {
      targetedPractice: [{ id: sourceId, occurredAt: "2026-08-17T10:00:00Z", score: 76 }],
      mockInterview: [],
    },
    weaknesses: [
      {
        id: "44444444-4444-4444-8444-444444444444",
        category: "quantifiedResults",
        description: "Add measurable outcomes.",
        recommendedPracticeCount: 2,
      },
    ],
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  })
}

describe("getDashboardData real service", () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("requests and parses the real dashboard wire response", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(dashboardPayload()))

    const response = await getDashboardData()

    expect(response.currentRole?.id).toBe(roleId)
    expect(response.recommendation?.recommendation.action).toBe("targetedPractice")
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/dashboard",
      expect.objectContaining({ credentials: "include" }),
    )
  })

  it("accepts an empty read model", async () => {
    const payload = dashboardPayload()
    payload.currentRole = null
    payload.recommendation = null
    payload.weaknesses = []
    payload.performanceTrend = { targetedPractice: [], mockInterview: [] }
    payload.metrics = {
      roleFit: { currentValue: null, previousValue: null },
      practiceTimeMinutes: { currentValue: null, previousValue: null },
      targetedPracticeScore: { currentValue: null, previousValue: null },
      mockInterviewScore: { currentValue: null, previousValue: null },
    }
    fetchMock.mockResolvedValueOnce(jsonResponse(payload))

    await expect(getDashboardData()).resolves.toMatchObject({
      currentRole: null,
      recommendation: null,
      weaknesses: [],
    })
  })

  it("rejects malformed dashboard data at the API boundary", async () => {
    const payload = dashboardPayload()
    payload.metrics.roleFit.currentValue = 101
    fetchMock.mockResolvedValueOnce(jsonResponse(payload))

    await expect(getDashboardData()).rejects.toBeInstanceOf(ZodError)
  })
})
