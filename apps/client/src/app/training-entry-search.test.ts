import { describe, expect, it } from "vitest"

import { createInterviewMockResponse } from "@/mocks/data/interview"
import { createPracticeMockResponse } from "@/mocks/data/practice"
import {
  resolveInterviewTrainingEntry,
  resolvePracticeTrainingEntry,
  toPracticeQuestionType,
} from "@/models/training-entry"

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

  it("centralizes cross-mode history question-type mapping", () => {
    expect(toPracticeQuestionType("selfIntroduction")).toBe("motivation")
    expect(toPracticeQuestionType("roleCapability")).toBe("businessUnderstanding")
    expect(toPracticeQuestionType("technicalOrBusiness")).toBe("technicalFoundation")
    expect(toPracticeQuestionType("resumeRisk")).toBe("behavioral")
  })

  it("falls back to the current role and its first supported practice type", () => {
    const response = createPracticeMockResponse("setupReady")
    const currentRole = response.setupContext.targetRoles.find(
      ({ id }) => id === response.setupContext.defaultTargetRoleId,
    )
    if (!currentRole) throw new Error("Expected the current practice role.")

    expect(
      resolvePracticeTrainingEntry(response.setupContext, response.session.selection, {
        targetRoleId: "role_missing",
        questionType: "businessUnderstanding",
      }),
    ).toMatchObject({
      targetRoleId: currentRole.id,
      questionType: "businessUnderstanding",
    })
  })

  it("falls back to the current role and its first supported interview round", () => {
    const response = createInterviewMockResponse()
    const currentRole = response.setup.targetRoles.find(
      ({ id }) => id === response.setup.defaultConfiguration.targetRoleId,
    )
    if (!currentRole) throw new Error("Expected the current interview role.")

    expect(
      resolveInterviewTrainingEntry(
        response.setup,
        { targetRoleId: "role_archived", round: "hr" },
        currentRole.id,
      ),
    ).toMatchObject({
      targetRoleId: currentRole.id,
      round: currentRole.supportedRounds.includes("hr") ? "hr" : currentRole.supportedRounds[0],
    })
  })
})
