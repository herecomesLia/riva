import { describe, expect, it } from "vitest"

import { interviewFixture } from "@/mocks/fixtures/interview"

import {
  createInterviewSessionStoryFixture,
  createInterviewSetupStoryFixture,
  createGeneratingReferenceReviewStoryFixture,
  createLongCandidateExchangesStoryFixture,
  createSparseInterviewReviewStoryFixture,
} from "./interview-story-fixtures"

describe("interview Story fixtures", () => {
  it("returns independent setup and session data for every Story", () => {
    const firstSetup = createInterviewSetupStoryFixture()
    firstSetup.targetRoles[0]!.title = "被 Story 修改的岗位"
    const secondSetup = createInterviewSetupStoryFixture()

    expect(secondSetup.targetRoles[0]?.title).toBe("Senior Frontend Engineer")

    const firstSession = createInterviewSessionStoryFixture()
    firstSession.history[0]!.answer = "被 Story 修改的回答"
    const secondSession = createInterviewSessionStoryFixture()

    expect(secondSession.history[0]?.answer).not.toBe("被 Story 修改的回答")
  })

  it("provides product-ready and missing-JD display scenarios", () => {
    const allReady = createInterviewSetupStoryFixture("multipleRolesReady")
    expect(allReady.targetRoles.map(({ id }) => id)).toEqual([
      "role_frontend_bytedance",
      "role_product_manager_meituan",
    ])

    const defaultSetup = createInterviewSetupStoryFixture()
    expect(defaultSetup.targetRoles.map(({ id }) => id)).toEqual(["role_frontend_bytedance"])

    const missing = createInterviewSetupStoryFixture("jobDescriptionMissing")
    expect(missing.targetRoles).toEqual([])
    expect(missing.availability).toEqual({
      status: "blocked",
      reason: "jobDescriptionMissing",
    })
  })

  it("creates sparse review variants without mutating the formal review fixture", () => {
    const firstReview = createSparseInterviewReviewStoryFixture()
    if (firstReview.status !== "complete") throw new Error("Expected complete review.")
    firstReview.review.mainStrengths[0] = "被 Story 修改的优势"
    const firstReference = firstReview.questionDetails[0]?.referenceAnswer
    if (firstReference?.status !== "ready") throw new Error("Expected ready reference answer.")
    firstReference.content.exampleAnswer = "被 Story 修改的参考答案"
    const secondReview = createSparseInterviewReviewStoryFixture()
    if (secondReview.status !== "complete") throw new Error("Expected complete review.")

    expect(secondReview.review.mainStrengths[0]).toBe(
      interviewFixture.review.review.mainStrengths[0],
    )
    const secondReference = secondReview.questionDetails[0]?.referenceAnswer
    if (secondReference?.status !== "ready") throw new Error("Expected ready reference answer.")
    expect(secondReference.content.exampleAnswer).not.toBe("被 Story 修改的参考答案")
  })

  it("returns independent generating-reference and candidate-exchange fixtures", () => {
    const firstReview = createGeneratingReferenceReviewStoryFixture()
    firstReview.questionDetails[0]!.referenceAnswer = {
      status: "unavailable",
    }
    const secondReview = createGeneratingReferenceReviewStoryFixture()
    expect(secondReview.questionDetails[0]!.referenceAnswer.status).toBe("generating")

    const firstExchanges = createLongCandidateExchangesStoryFixture()
    firstExchanges[0]!.question = "被 Story 修改的问题"
    const secondExchanges = createLongCandidateExchangesStoryFixture()
    expect(secondExchanges[0]!.question).not.toBe("被 Story 修改的问题")
  })
})
