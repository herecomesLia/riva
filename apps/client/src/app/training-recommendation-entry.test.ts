import { describe, expect, it } from "vitest"

import { mapTrainingRecommendationToEntry } from "./training-recommendation-entry"

describe("mapTrainingRecommendationToEntry", () => {
  it("maps retry and targeted-practice recommendations to stable practice parameters", () => {
    expect(
      mapTrainingRecommendationToEntry(
        {
          action: "targetedPractice",
          reason: "Strengthen planning.",
          questionType: "technicalOrBusiness",
          difficulty: "pressure",
          focusAreas: ["planning"],
        },
        "role-1",
      ),
    ).toEqual({
      action: "targetedPractice",
      to: "/practice",
      search: {
        entry: "history",
        roleId: "role-1",
        questionType: "technical_basics",
        difficulty: "hard",
      },
    })
  })

  it("maps mock-interview recommendations without runtime identity fields", () => {
    const entry = mapTrainingRecommendationToEntry(
      {
        action: "mockInterview",
        reason: "Validate the skill.",
        interviewType: "professional",
        difficulty: "basic",
        focusAreas: [],
      },
      "role-1",
    )

    expect(entry).toEqual({
      action: "mockInterview",
      to: "/interview",
      search: {
        entry: "history",
        roleId: "role-1",
        interviewType: "professional",
        difficulty: "basic",
      },
    })
    expect(entry?.search).not.toHaveProperty("recordId")
    expect(entry?.search).not.toHaveProperty("sessionId")
    expect(entry?.search).not.toHaveProperty("version")
    expect(entry?.search).not.toHaveProperty("viewData")
  })

  it("omits an unsafe cross-mode question type instead of emitting an illegal parameter", () => {
    const entry = mapTrainingRecommendationToEntry(
      {
        action: "retryQuestion",
        reason: "Retry.",
        questionType: "unsupported" as never,
        difficulty: "basic",
        focusAreas: [],
      },
      "role-1",
    )

    expect(entry?.to).toBe("/practice")
    expect(entry?.search).not.toHaveProperty("questionType")
  })

  it("does not create an entry for no-action recommendations", () => {
    expect(
      mapTrainingRecommendationToEntry({ action: "none", reason: "Done." }, "role-1"),
    ).toBeNull()
  })
})
