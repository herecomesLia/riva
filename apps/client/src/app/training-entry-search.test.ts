import { describe, expect, it } from "vitest"

import { createInterviewMockResponse } from "@/mocks/data/interview"
import { createPracticeScenario } from "@/pages/practice/stories/practice-scenarios"
import {
  resolveInterviewTrainingEntry,
  resolvePracticeTrainingEntry,
  resolveTrainingEntryRoleAvailability,
  toPracticeQuestionType,
} from "@/models/training-entry"

describe("training entry search application", () => {
  it("centralizes cross-mode history question-type mapping", () => {
    expect(toPracticeQuestionType("selfIntroduction")).toBe("motivation")
    expect(toPracticeQuestionType("roleCapability")).toBe("businessUnderstanding")
    expect(toPracticeQuestionType("technicalOrBusiness")).toBe("technicalFoundation")
    expect(toPracticeQuestionType("resumeRisk")).toBe("behavioral")
  })

  it("does not replace a deleted practice role with the current role", () => {
    const response = createPracticeScenario("setupReady")

    expect(
      resolvePracticeTrainingEntry(
        response.setupContext,
        response.session.selection,
        {
          targetRoleId: "role_missing",
          questionType: "businessUnderstanding",
        },
        { status: "unavailable", reason: "targetRoleDeleted" },
      ),
    ).toEqual({
      status: "roleUnavailable",
      reason: "targetRoleDeleted",
      configuration: {
        ...response.session.selection,
        targetRoleId: null,
        questionType: "businessUnderstanding",
      },
    })
  })

  it("reports every adjusted interview field with stable reasons", () => {
    const response = createInterviewMockResponse()
    const role = response.setup.targetRoles[0]
    const setup = structuredClone(response.setup)
    setup.targetRoles[0]!.supportedRounds = ["technical"]
    setup.availableDifficulties = ["basic"]
    setup.availableDurationMinutes = [15]

    expect(
      resolveInterviewTrainingEntry(
        setup,
        {
          targetRoleId: role.id,
          round: "hr",
          difficulty: "pressure",
          durationMinutes: 45,
        },
        { status: "available" },
      ),
    ).toEqual({
      status: "adjusted",
      adjustments: ["interviewRoundUnsupported", "difficultyUnavailable", "durationUnavailable"],
      configuration: {
        targetRoleId: role.id,
        round: "technical",
        difficulty: "basic",
        durationMinutes: 15,
      },
    })
  })

  it("reports unsupported practice question types and difficulties with stable reasons", () => {
    const response = createPracticeScenario("setupReady")
    const role = response.setupContext.targetRoles[0]
    const context = structuredClone(response.setupContext)
    context.targetRoles[0]!.supportedQuestionTypes = ["behavioral"]
    context.availableDifficulties = ["basic"]

    expect(
      resolvePracticeTrainingEntry(
        context,
        response.session.selection,
        {
          targetRoleId: role.id,
          questionType: "technicalFoundation",
          difficulty: "pressure",
        },
        { status: "available" },
      ),
    ).toEqual({
      status: "adjusted",
      adjustments: ["practiceQuestionTypeUnsupported", "difficultyUnavailable"],
      configuration: {
        ...response.session.selection,
        targetRoleId: role.id,
        questionType: "behavioral",
        difficulty: "basic",
      },
    })
  })

  it("distinguishes deleted, archived, and prerequisite-unavailable roles", () => {
    const roles = [
      { id: "active", status: "active" as const },
      { id: "archived", status: "archived" as const },
    ]

    expect(resolveTrainingEntryRoleAvailability(roles, ["active"], "missing")).toEqual({
      status: "unavailable",
      reason: "targetRoleDeleted",
    })
    expect(resolveTrainingEntryRoleAvailability(roles, ["active"], "archived")).toEqual({
      status: "unavailable",
      reason: "targetRoleArchived",
    })
    expect(resolveTrainingEntryRoleAvailability(roles, [], "active")).toEqual({
      status: "unavailable",
      reason: "targetRolePrerequisiteUnavailable",
    })
  })
})
