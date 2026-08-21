import { describe, expect, it } from "vitest"

import {
  createInterviewAgentPlanMock,
  defaultInterviewConfigurationMock,
  interviewSetupResponseMock,
} from "@/mocks/data/interview"

import {
  createInterviewSessionStoryFixture,
  createEnglishInterviewSessionStoryFixture,
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
    expect(interviewSetupResponseMock.targetRoles[0]?.title).toBe("Senior Frontend Engineer")

    const firstSession = createInterviewSessionStoryFixture()
    firstSession.completedQuestions[0]!.answer.content = "被 Story 修改的回答"
    const secondSession = createInterviewSessionStoryFixture()

    expect(secondSession.completedQuestions[0]?.answer.content).not.toBe("被 Story 修改的回答")
  })

  it("provides an explicit English session fixture without translating user input", () => {
    const fixture = createEnglishInterviewSessionStoryFixture()

    expect(fixture.language).toBe("en")
    expect(fixture.openingMessage).toContain("Welcome")
    expect(fixture.candidatePrompt).toContain("formal questions")
    expect(fixture.candidateExchange.question.content).toContain("岗位")
    expect(fixture.candidateExchange.interviewerAnswer).toContain("Focus on verifying")
    expect(fixture.history[0]?.answer).toContain("我")
  })

  it("derives product-ready and missing-JD Stories from shared Roles scenarios", () => {
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

    expect(secondReview.review.mainStrengths[0]).toBe("模块边界清楚")
    const secondReference = secondReview.questionDetails[0]?.referenceAnswer
    if (secondReference?.status !== "ready") throw new Error("Expected ready reference answer.")
    expect(secondReference.content.exampleAnswer).not.toBe("被 Story 修改的参考答案")
  })

  it("returns independent generating-reference and candidate-exchange fixtures", () => {
    const firstReview = createGeneratingReferenceReviewStoryFixture()
    firstReview.questionDetails[0]!.referenceAnswer = {
      status: "unavailable",
      reason: "generationFailed",
    }
    const secondReview = createGeneratingReferenceReviewStoryFixture()
    expect(secondReview.questionDetails[0]!.referenceAnswer.status).toBe("generating")

    const firstExchanges = createLongCandidateExchangesStoryFixture()
    firstExchanges[0]!.question.content = "被 Story 修改的问题"
    const secondExchanges = createLongCandidateExchangesStoryFixture()
    expect(secondExchanges[0]!.question.content).not.toBe("被 Story 修改的问题")
  })

  it("keeps the public Interview Mock outlet deeply isolated after the directory split", () => {
    const first = createInterviewAgentPlanMock({
      ...defaultInterviewConfigurationMock,
      scenario: "multipleFollowUps",
    })
    first.questions[0]!.question.prompt = "被调用方修改的问题"
    first.questions[1]!.followUps[0]!.prompt = "被调用方修改的追问"

    const second = createInterviewAgentPlanMock({
      ...defaultInterviewConfigurationMock,
      scenario: "multipleFollowUps",
    })
    expect(second.questions[0]!.question.prompt).not.toBe("被调用方修改的问题")
    expect(second.questions[1]!.followUps[0]!.prompt).not.toBe("被调用方修改的追问")
  })
})
