import { describe, expect, it } from "vitest"

import type { InterviewSetup } from "@/models/interview-workflow"
import { practiceFixture } from "@/mocks/fixtures/practice"
import type { ActiveSelection, PracticeSetupContext } from "@/models/practice-workflow"
import {
  resolveInterviewTrainingEntry,
  resolvePracticeTrainingEntry,
  resolveTrainingEntryRoleAvailability,
  toPracticeQuestionType,
} from "@/models/training-entry"

const selection: ActiveSelection = {
  ...practiceFixture.selection,
  targetRoleId: "role_active",
}
const setupContext: PracticeSetupContext = {
  targetRoles: [
    {
      id: selection.targetRoleId,
      title: "Frontend Engineer",
      company: null,
      supportedQuestionTypes: ["behavioral"],
    },
  ],
  availableDifficulties: ["basic"],
  eligibleQuestionCounts: { saved: 1, history: 1 },
}

describe("training entry search application", () => {
  it("centralizes cross-mode history question-type mapping", () => {
    expect(toPracticeQuestionType("selfIntroduction")).toBe("motivation")
    expect(toPracticeQuestionType("roleCapability")).toBe("businessUnderstanding")
    expect(toPracticeQuestionType("technicalOrBusiness")).toBe("technicalFoundation")
    expect(toPracticeQuestionType("resumeRisk")).toBe("behavioral")
  })

  it("does not replace a deleted practice role with the current role", () => {
    expect(
      resolvePracticeTrainingEntry(
        setupContext,
        selection,
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
        ...selection,
        targetRoleId: null,
        questionType: "businessUnderstanding",
      },
    })
  })

  it("reports every adjusted interview field with stable reasons", () => {
    const role = {
      id: "role_active",
      title: "Frontend Engineer",
      company: null,
      supportedRounds: ["technical"] as const,
    }
    const setup: InterviewSetup = {
      availability: { status: "available" },
      targetRoles: [{ ...role, supportedRounds: ["technical"] }],
      availableDifficulties: ["basic"],
      availableDurationMinutes: [15],
      defaultConfiguration: {
        targetRoleId: role.id,
        round: "technical",
        difficulty: "basic",
        durationMinutes: 15,
      },
    }

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
    expect(
      resolvePracticeTrainingEntry(
        setupContext,
        selection,
        {
          targetRoleId: selection.targetRoleId,
          questionType: "technicalFoundation",
          difficulty: "pressure",
        },
        { status: "available" },
      ),
    ).toEqual({
      status: "adjusted",
      adjustments: ["practiceQuestionTypeUnsupported", "difficultyUnavailable"],
      configuration: {
        ...selection,
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
