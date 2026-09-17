import { describe, expect, it } from "vitest"

import type { InterviewSetup } from "@/models/interview-workflow"
import { practiceFixture } from "@/mocks/fixtures/practice"
import type { ActiveSelection, PracticeSetupContext } from "@/models/practice-workflow"
import {
  resolveInterviewTrainingEntry,
  resolvePracticeTrainingEntry,
  toPracticeQuestionType,
} from "@/models/training-entry"

const selection: ActiveSelection = {
  ...practiceFixture.selection,
  roleId: "role_active",
}
const setupContext: PracticeSetupContext = {
  roles: [
    {
      id: selection.roleId,
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
    expect(toPracticeQuestionType("roleCapability")).toBe("business_understanding")
    expect(toPracticeQuestionType("technicalOrBusiness")).toBe("technical_basics")
    expect(toPracticeQuestionType("resumeRisk")).toBe("behavioral")
  })

  it("does not replace a deleted practice role with the current role", () => {
    expect(
      resolvePracticeTrainingEntry(
        setupContext,
        selection,
        {
          roleId: "role_missing",
          questionType: "business_understanding",
        },
        { status: "unavailable", reason: "roleDeleted" },
      ),
    ).toEqual({
      status: "roleUnavailable",
      reason: "roleDeleted",
      configuration: {
        ...selection,
        roleId: null,
        questionType: "business_understanding",
      },
    })
  })

  it("reports every adjusted interview field with stable reasons", () => {
    const role = {
      id: "role_active",
      title: "Frontend Engineer",
      company: null,
      supportedInterviewTypes: ["professional"] as const,
    }
    const setup: InterviewSetup = {
      availability: { status: "available" },
      roles: [{ ...role, supportedInterviewTypes: ["professional"] }],
      availableDifficulties: ["basic"],
      availableDurationMinutes: [15],
      defaultConfiguration: {
        roleId: role.id,
        interviewType: "professional",
        difficulty: "basic",
        durationMinutes: 15,
      },
    }

    expect(
      resolveInterviewTrainingEntry(
        setup,
        {
          roleId: role.id,
          interviewType: "hr",
          difficulty: "pressure",
          durationMinutes: 45,
        },
        { status: "available" },
      ),
    ).toEqual({
      status: "adjusted",
      adjustments: ["interviewTypeUnsupported", "difficultyUnavailable", "durationUnavailable"],
      configuration: {
        roleId: role.id,
        interviewType: "professional",
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
          roleId: selection.roleId,
          questionType: "technical_basics",
          difficulty: "hard",
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
})
