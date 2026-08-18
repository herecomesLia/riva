import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ZodError } from "zod"

import {
  ensureCurrentTrainingPlanning,
  getTrainingPlanningStatus,
  startTrainingPlanning,
} from "@/services/training-planning"

const roleId = "11111111-1111-4111-8111-111111111111"
const runId = "22222222-2222-4222-8222-222222222222"

function targetedResponse(overrides: Record<string, unknown> = {}) {
  return {
    runId,
    status: "succeeded",
    targetRoleId: roleId,
    interactionLanguage: "en",
    attemptCount: 1,
    maxAttempts: 3,
    errorCode: null,
    failureReason: null,
    createdAt: "2026-08-18T10:00:00.000Z",
    startedAt: "2026-08-18T10:00:00.000Z",
    finishedAt: "2026-08-18T10:00:01.000Z",
    plan: {
      action: "targetedPractice",
      reason: "Practice the current project-results gap.",
      focusAreas: ["results and evidence"],
      questionType: "projectDeepDive",
      difficulty: "basic",
      prioritizeWeaknesses: true,
    },
    ...overrides,
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  })
}

describe("training planning real service", () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("ensures the current plan with the target role", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(targetedResponse()))

    await expect(ensureCurrentTrainingPlanning({ targetRoleId: roleId })).resolves.toMatchObject({
      runId,
      status: "succeeded",
      plan: { action: "targetedPractice", prioritizeWeaknesses: true },
    })
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/training-plans/current",
      expect.objectContaining({
        body: JSON.stringify({ targetRoleId: roleId }),
        credentials: "include",
        method: "POST",
      }),
    )
  })

  it("starts a fresh request and reads status through the real endpoints", async () => {
    const requestId = "33333333-3333-4333-8333-333333333333"
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(
          targetedResponse({
            status: "queued",
            attemptCount: 0,
            startedAt: null,
            finishedAt: null,
            plan: null,
          }),
        ),
      )
      .mockResolvedValueOnce(jsonResponse(targetedResponse()))

    await expect(startTrainingPlanning({ requestId, targetRoleId: roleId })).resolves.toMatchObject(
      {
        status: "queued",
        plan: null,
      },
    )
    await expect(getTrainingPlanningStatus(runId)).resolves.toMatchObject({
      status: "succeeded",
      runId,
    })
    expect(fetchMock.mock.calls.map(([input]) => input)).toEqual([
      "/api/training-plans",
      `/api/training-plans/${runId}`,
    ])
  })

  it("rejects a malformed lifecycle response at the API boundary", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(targetedResponse({ status: "failed", plan: null, failureReason: null })),
    )

    await expect(getTrainingPlanningStatus(runId)).rejects.toBeInstanceOf(ZodError)
  })
})
