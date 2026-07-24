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
    firstReview.review.mainStrengths[0] = "被 Story 修改的优势"
    const secondReview = createSparseInterviewReviewStoryFixture()

    expect(secondReview.review.mainStrengths[0]).toBe("能够把复杂技术问题讲清楚")
  })
})
