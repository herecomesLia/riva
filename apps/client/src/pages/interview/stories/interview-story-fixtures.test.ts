import { describe, expect, it } from "vitest"

import { interviewSetupResponseMock } from "@/mocks/data/interview"

import {
  createInterviewSessionStoryFixture,
  createInterviewSetupStoryFixture,
  createSparseInterviewReviewStoryFixture,
} from "./interview-story-fixtures"

describe("interview Story fixtures", () => {
  it("returns independent setup and session data for every Story", () => {
    const firstSetup = createInterviewSetupStoryFixture()
    firstSetup.targetRoles[0]!.title = "被 Story 修改的岗位"
    const secondSetup = createInterviewSetupStoryFixture()

    expect(secondSetup.targetRoles[0]?.title).toBe("高级前端工程师")
    expect(interviewSetupResponseMock.targetRoles[0]?.title).toBe("高级前端工程师")

    const firstSession = createInterviewSessionStoryFixture()
    firstSession.completedQuestions[0]!.answer.content = "被 Story 修改的回答"
    const secondSession = createInterviewSessionStoryFixture()

    expect(secondSession.completedQuestions[0]?.answer.content).not.toBe("被 Story 修改的回答")
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

    expect(secondReview.review.mainStrengths[0]).toBe("岗位匹配信息集中")
    const secondReference = secondReview.questionDetails[0]?.referenceAnswer
    if (secondReference?.status !== "ready") throw new Error("Expected ready reference answer.")
    expect(secondReference.content.exampleAnswer).not.toBe("被 Story 修改的参考答案")
  })
})
