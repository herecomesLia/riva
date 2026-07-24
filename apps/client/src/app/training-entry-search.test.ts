import { describe, expect, it } from "vitest"

import { createInterviewMockResponse } from "@/mocks/data/interview"
import { createPracticeMockResponse } from "@/mocks/data/practice"

import { applyInterviewEntrySearch, applyPracticeEntrySearch } from "./training-entry-defaults"

describe("training entry search application", () => {
  it("prefills practice setup without changing the service snapshot or active sessions", () => {
    const setup = createPracticeMockResponse("setupReady")
    const original = structuredClone(setup)
    const targetRole = setup.setupContext.targetRoles[0]
    const questionType = targetRole.supportedQuestionTypes[0]

    const result = applyPracticeEntrySearch(setup, {
      targetRoleId: targetRole.id,
      questionType,
      difficulty: "pressure",
      source: "history",
    })

    expect(result.session).toMatchObject({
      status: "setup",
      selection: {
        targetRoleId: targetRole.id,
        questionType,
        difficulty: "pressure",
        source: "history",
      },
    })
    expect(setup).toEqual(original)

    const active = createPracticeMockResponse("generatingQuestion")
    expect(applyPracticeEntrySearch(active, { source: "history" })).toBe(active)
  })

  it("prefills only interview options supported by the current setup", () => {
    const response = createInterviewMockResponse()
    const role = response.setup.targetRoles[0]
    const result = applyInterviewEntrySearch(response.setup, {
      targetRoleId: role.id,
      round: role.supportedRounds[0],
      difficulty: response.setup.availableDifficulties[0],
      durationMinutes: response.setup.availableDurationMinutes[0],
    })

    expect(result.defaultConfiguration).toEqual({
      targetRoleId: role.id,
      round: role.supportedRounds[0],
      difficulty: response.setup.availableDifficulties[0],
      durationMinutes: response.setup.availableDurationMinutes[0],
    })
    expect(result).not.toBe(response.setup)
  })
})
