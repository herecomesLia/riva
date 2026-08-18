import { describe, expect, it } from "vitest"

import { mapTrainingPlanToEntry } from "@/app/training-planning-entry"

const roleId = "11111111-1111-4111-8111-111111111111"

describe("training planner entry mapping", () => {
  it("opens targeted practice as a personalized planner entry", () => {
    const entry = mapTrainingPlanToEntry(
      {
        action: "targetedPractice",
        reason: "Practice the evidence gap.",
        focusAreas: ["results"],
        questionType: "projectDeepDive",
        difficulty: "pressure",
        prioritizeWeaknesses: true,
      },
      roleId,
    )

    expect(entry).toEqual({
      action: "targetedPractice",
      to: "/practice",
      search: {
        entry: "planner",
        targetRoleId: roleId,
        questionType: "projectDeepDive",
        difficulty: "pressure",
        source: "personalized",
        prioritizeWeaknesses: true,
      },
    })
  })

  it("preserves mock interview duration in the planner entry", () => {
    const entry = mapTrainingPlanToEntry(
      {
        action: "mockInterview",
        reason: "Combine risk and pressure response.",
        focusAreas: ["risk control"],
        round: "comprehensive",
        difficulty: "pressure",
        durationMinutes: 45,
      },
      roleId,
    )

    expect(entry).toEqual({
      action: "mockInterview",
      to: "/interview",
      search: {
        entry: "planner",
        targetRoleId: roleId,
        round: "comprehensive",
        difficulty: "pressure",
        durationMinutes: 45,
      },
    })
  })
})
