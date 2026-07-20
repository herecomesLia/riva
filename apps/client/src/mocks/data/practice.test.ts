import { describe, expect, it } from "vitest"

import {
  createPracticeMockResponse,
  practiceResponseMock,
  type PracticeMockScenario,
} from "@/mocks/data/practice"
import type { PracticePageResponse, PracticeScoreDimension } from "@/models/practice"

const scenarios: PracticeMockScenario[] = [
  "setupReady",
  "noRoles",
  "noEligibleSavedQuestions",
  "noEligibleHistoryQuestions",
  "generatingQuestion",
  "answeringQuestion",
  "answeringFollowUp",
  "evaluatingAnswer",
  "reviewRetryRecommended",
  "reviewNextRecommended",
  "completedSession",
]

const scoreDimensions = new Set<PracticeScoreDimension>([
  "relevance",
  "structure",
  "specificity",
  "personalContribution",
  "resultsAndEvidence",
  "roleAlignment",
  "communication",
  "riskControl",
])

function expectConsistentPracticeResponse(response: PracticePageResponse) {
  const { setupContext, session } = response

  if (setupContext.defaultTargetRoleId !== null) {
    expect(
      setupContext.targetRoles.some((role) => role.id === setupContext.defaultTargetRoleId),
    ).toBe(true)
  }

  if (session.selection.targetRoleId !== null) {
    expect(
      setupContext.targetRoles.some((role) => role.id === session.selection.targetRoleId),
    ).toBe(true)
  }

  switch (session.status) {
    case "setup":
      expect("question" in session).toBe(false)
      expect("sessionId" in session).toBe(false)
      return
    case "generatingQuestion":
      expect("question" in session).toBe(false)
      expect(session.sessionId).toMatch(/^practice_session_/)
      return
    case "answering":
      expect(session.question.id).toMatch(/^practice_question_/)
      expect("mainAnswer" in session).toBe(false)
      expect("evaluation" in session).toBe(false)
      expect("review" in session).toBe(false)
      return
    case "answeringFollowUp":
      expect(session.mainAnswer.order).toBe(1)
      expect(session.currentFollowUp.status).toBe("awaitingAnswer")
      expect(session.currentFollowUp.answer).toBeNull()
      expect(session.currentFollowUp.question.order).toBe(session.followUpExchanges.length + 1)
      expect(session.followUpExchanges.every((exchange) => exchange.status === "answered")).toBe(
        true,
      )
      expect("evaluation" in session).toBe(false)
      return
    case "evaluating":
      expect(session.mainAnswer.content.trim()).not.toBe("")
      expect(session.followUpExchanges.every((exchange) => exchange.answer.content.trim())).toBe(
        true,
      )
      expect("evaluation" in session).toBe(false)
      expect("review" in session).toBe(false)
      return
    case "review": {
      const dimensions = session.evaluation.dimensionScores

      expect(dimensions).toHaveLength(scoreDimensions.size)
      expect(new Set(dimensions.map(({ dimension }) => dimension))).toEqual(scoreDimensions)
      expect(dimensions.every(({ score }) => score >= 0 && score <= 100)).toBe(true)
      expect(session.evaluation.overallScore).toBeGreaterThanOrEqual(0)
      expect(session.evaluation.overallScore).toBeLessThanOrEqual(100)
      expect(session.review.overallPerformance.trim()).not.toBe("")
      expect(session.review.highlights).not.toHaveLength(0)
      expect(session.review.mainIssues).not.toHaveLength(0)
      expect(session.review.improvementSuggestions).not.toHaveLength(0)
      expect(session.review.reusableAnswerStructure).not.toHaveLength(0)
      expect(session.review.exposedWeaknesses).not.toHaveLength(0)
      expect(session.review.shouldRetry).toBe(
        session.review.recommendation.action === "retryCurrent",
      )
      return
    }
    case "completed":
      expect(session.questionsCompleted).toBeGreaterThan(0)
      expect("question" in session).toBe(false)
      expect("mainAnswer" in session).toBe(false)
      expect("currentFollowUp" in session).toBe(false)
  }
}

describe("practice mock scenarios", () => {
  it.each(scenarios)("keeps the %s response internally consistent", (scenario) => {
    expectConsistentPracticeResponse(createPracticeMockResponse(scenario))
  })

  it("keeps answering state free of evaluation results", () => {
    const { session } = createPracticeMockResponse("answeringQuestion")

    expect(session.status).toBe("answering")
    expect("evaluation" in session).toBe(false)
    expect("review" in session).toBe(false)
  })

  it("keeps a main answer and an unanswered current follow-up in follow-up state", () => {
    const { session } = createPracticeMockResponse("answeringFollowUp")

    expect(session.status).toBe("answeringFollowUp")
    if (session.status !== "answeringFollowUp") return

    expect(session.mainAnswer.content).toBeTruthy()
    expect(session.currentFollowUp.answer).toBeNull()
  })

  it("does not expose review data while an answer is being evaluated", () => {
    const { session } = createPracticeMockResponse("evaluatingAnswer")

    expect(session.status).toBe("evaluating")
    expect("evaluation" in session).toBe(false)
    expect("review" in session).toBe(false)
  })

  it("keeps empty source scenarios aligned with their selected source", () => {
    const saved = createPracticeMockResponse("noEligibleSavedQuestions")
    const history = createPracticeMockResponse("noEligibleHistoryQuestions")

    expect(saved.session.selection.source).toBe("saved")
    expect(saved.setupContext.eligibleQuestionCounts.saved).toBe(0)
    expect(history.session.selection.source).toBe("history")
    expect(history.setupContext.eligibleQuestionCounts.history).toBe(0)
  })

  it("does not select a default role when no roles exist", () => {
    const response = createPracticeMockResponse("noRoles")

    expect(response.setupContext.targetRoles).toEqual([])
    expect(response.setupContext.defaultTargetRoleId).toBeNull()
    expect(response.session.selection.targetRoleId).toBeNull()
  })

  it("returns an independent deep copy for every request", () => {
    const first = createPracticeMockResponse()
    const second = createPracticeMockResponse()

    expect(first).toEqual(practiceResponseMock)
    expect(second).toEqual(practiceResponseMock)
    expect(first).not.toBe(second)
    expect(first.setupContext).not.toBe(second.setupContext)
    expect(first.setupContext.targetRoles).not.toBe(second.setupContext.targetRoles)
  })

  it("does not leak fixture mutations into later requests", () => {
    const first = createPracticeMockResponse("answeringQuestion")

    first.setupContext.targetRoles[0]!.title = "Mutated role"
    if (first.session.status !== "answering") {
      throw new Error("The answering fixture must use the answering state.")
    }
    first.session.question.assessedCapabilities[0] = "Mutated capability"

    const second = createPracticeMockResponse("answeringQuestion")

    expect(second.setupContext.targetRoles[0]?.title).toBe("Senior Frontend Engineer")
    expect(second.session.status).toBe("answering")
    if (second.session.status === "answering") {
      expect(second.session.question.assessedCapabilities[0]).toBe("问题分析")
    }
  })
})
