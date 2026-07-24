import { describe, expect, it } from "vitest"

import { createPracticeMockResponse } from "@/mocks/data/practice"

import {
  synchronizePracticeEvaluationResponse,
  synchronizePracticeMutationResponse,
  synchronizeQuestionGenerationResponse,
} from "./practice-cache"

describe("practice mutation cache contract", () => {
  it("accepts a start response only from setup with version one and the requested selection", () => {
    const current = createPracticeMockResponse("setupReady")
    const response = createPracticeMockResponse("generatingQuestion")
    if (current.session.status !== "setup" || response.session.status !== "generatingQuestion")
      return
    response.session.version = 1
    response.session.selection = {
      targetRoleId:
        current.session.selection.targetRoleId ?? response.session.selection.targetRoleId,
      questionType: current.session.selection.questionType,
      difficulty: current.session.selection.difficulty,
      source: current.session.selection.source,
      prioritizeWeaknesses: current.session.selection.prioritizeWeaknesses,
    }
    const input = response.session.selection

    expect(
      synchronizePracticeMutationResponse(current, response, {
        kind: "startSession",
        input,
      }),
    ).toBe(response)

    response.session.version = 2
    expect(
      synchronizePracticeMutationResponse(current, response, {
        kind: "startSession",
        input,
      }),
    ).toBe(current)
  })

  it("accepts prepare-next only while the requested completed snapshot is current", () => {
    const current = createPracticeMockResponse("completedSession")
    const response = createPracticeMockResponse("setupReady")
    if (current.session.status !== "completed" || response.session.status !== "setup") return
    const input = { sessionId: current.session.sessionId, version: current.session.version }

    expect(
      synchronizePracticeMutationResponse(current, response, {
        kind: "prepareNextSession",
        input,
      }),
    ).toBe(response)

    const newer = structuredClone(current)
    if (newer.session.status !== "completed") return
    newer.session.version += 1
    expect(
      synchronizePracticeMutationResponse(newer, response, {
        kind: "prepareNextSession",
        input,
      }),
    ).toBe(newer)
  })

  it("accepts an exact-next in-place question snapshot", () => {
    const current = createPracticeMockResponse("answeringQuestion")
    const response = structuredClone(current)
    if (current.session.status !== "answering" || response.session.status !== "answering") return
    response.session.version += 1
    response.session.question.isSaved = true
    const input = {
      sessionId: current.session.sessionId,
      version: current.session.version,
      questionId: current.session.question.id,
      isSaved: true,
    }

    expect(
      synchronizePracticeMutationResponse(current, response, {
        kind: "questionFlagUpdate",
        input,
      }),
    ).toBe(response)
    expect(current.session.question.isSaved).toBe(false)
  })

  it("accepts only the exact next completed snapshot for a review-ending mutation", () => {
    const current = createPracticeMockResponse("reviewBalanced")
    const completed = createPracticeMockResponse("completedSession")
    if (current.session.status !== "review" || completed.session.status !== "completed") return
    const request = { sessionId: current.session.sessionId, version: current.session.version }
    completed.session.sessionId = request.sessionId
    completed.session.version = request.version + 1

    expect(
      synchronizePracticeMutationResponse(current, completed, {
        kind: "endReviewSession",
        input: request,
      }),
    ).toBe(completed)

    completed.session.version = request.version
    expect(
      synchronizePracticeMutationResponse(current, completed, {
        kind: "endReviewSession",
        input: request,
      }),
    ).toBe(current)
    completed.session.version = request.version + 2
    expect(
      synchronizePracticeMutationResponse(current, completed, {
        kind: "endReviewSession",
        input: request,
      }),
    ).toBe(current)
  })

  it("rejects an illegal answering-to-review mutation transition", () => {
    const current = createPracticeMockResponse("answeringQuestion")
    const response = createPracticeMockResponse("reviewBalanced")
    if (current.session.status !== "answering" || response.session.status !== "review") return
    response.session.sessionId = current.session.sessionId
    response.session.version = current.session.version + 1
    response.session.question.id = current.session.question.id
    const input = {
      sessionId: current.session.sessionId,
      version: current.session.version,
      questionId: current.session.question.id,
    }

    expect(
      synchronizePracticeMutationResponse(current, response, {
        kind: "questionUpdate",
        input,
      }),
    ).toBe(current)
  })

  it("does not let an old review response overwrite a newer answering retry", () => {
    const oldReview = createPracticeMockResponse("reviewBalanced")
    const current = createPracticeMockResponse("retryingCurrentQuestion")
    const staleResponse = createPracticeMockResponse("reviewBalanced")
    if (
      oldReview.session.status !== "review" ||
      current.session.status !== "answering" ||
      staleResponse.session.status !== "review"
    ) {
      return
    }
    current.session.sessionId = oldReview.session.sessionId
    current.session.version = oldReview.session.version + 1
    current.session.question.id = oldReview.session.question.id
    staleResponse.session.sessionId = oldReview.session.sessionId
    staleResponse.session.version = oldReview.session.version + 1
    staleResponse.session.question.id = oldReview.session.question.id
    const input = {
      sessionId: oldReview.session.sessionId,
      version: oldReview.session.version,
      questionId: oldReview.session.question.id,
      isSaved: true,
    }

    expect(
      synchronizePracticeMutationResponse(current, staleResponse, {
        kind: "questionFlagUpdate",
        input,
      }),
    ).toBe(current)
  })

  it("requires the response question ID to match the requested question", () => {
    const current = createPracticeMockResponse("answeringQuestion")
    const response = structuredClone(current)
    if (current.session.status !== "answering" || response.session.status !== "answering") return
    response.session.version = current.session.version + 1
    response.session.question.id = "another_question"
    const input = {
      sessionId: current.session.sessionId,
      version: current.session.version,
      questionId: current.session.question.id,
    }

    expect(
      synchronizePracticeMutationResponse(current, response, {
        kind: "questionUpdate",
        input,
      }),
    ).toBe(current)
  })

  it("requires a follow-up update to preserve the requested follow-up question", () => {
    const current = createPracticeMockResponse("answeringFirstFollowUp")
    const response = structuredClone(current)
    if (
      current.session.status !== "answeringFollowUp" ||
      response.session.status !== "answeringFollowUp"
    ) {
      return
    }
    response.session.version = current.session.version + 1
    response.session.currentFollowUp.question.id = "another_follow_up"
    const input = {
      sessionId: current.session.sessionId,
      version: current.session.version,
      questionId: current.session.question.id,
      followUpQuestionId: current.session.currentFollowUp.question.id,
    }

    expect(
      synchronizePracticeMutationResponse(current, response, {
        kind: "followUpUpdate",
        input,
      }),
    ).toBe(current)
  })
})

describe("practice polling cache contract", () => {
  it("accepts only pending or exact-next answering generation snapshots", () => {
    const current = createPracticeMockResponse("generatingQuestion")
    const pending = structuredClone(current)
    const answering = createPracticeMockResponse("answeringQuestion")
    const illegal = createPracticeMockResponse("reviewBalanced")
    if (
      current.session.status !== "generatingQuestion" ||
      pending.session.status !== "generatingQuestion" ||
      answering.session.status !== "answering" ||
      illegal.session.status !== "review"
    ) {
      return
    }
    const request = { sessionId: current.session.sessionId, version: current.session.version }
    answering.session.sessionId = request.sessionId
    answering.session.version = request.version + 1
    illegal.session.sessionId = request.sessionId
    illegal.session.version = request.version + 1

    expect(synchronizeQuestionGenerationResponse(current, pending, request)).toBe(pending)
    expect(synchronizeQuestionGenerationResponse(current, answering, request)).toBe(answering)
    expect(synchronizeQuestionGenerationResponse(current, illegal, request)).toBe(current)
    answering.session.version = request.version + 2
    expect(synchronizeQuestionGenerationResponse(current, answering, request)).toBe(current)
  })

  it("accepts only pending or exact-next review evaluation snapshots", () => {
    const current = createPracticeMockResponse("evaluatingAnswer")
    const pending = structuredClone(current)
    const review = createPracticeMockResponse("reviewBalanced")
    const illegal = createPracticeMockResponse("answeringQuestion")
    if (
      current.session.status !== "evaluating" ||
      pending.session.status !== "evaluating" ||
      review.session.status !== "review" ||
      illegal.session.status !== "answering"
    ) {
      return
    }
    const request = {
      sessionId: current.session.sessionId,
      version: current.session.version,
      questionId: current.session.question.id,
    }
    review.session.sessionId = request.sessionId
    review.session.version = request.version + 1
    review.session.question.id = request.questionId
    illegal.session.sessionId = request.sessionId
    illegal.session.version = request.version + 1
    illegal.session.question.id = request.questionId

    expect(synchronizePracticeEvaluationResponse(current, pending, request)).toBe(pending)
    expect(synchronizePracticeEvaluationResponse(current, review, request)).toBe(review)
    expect(synchronizePracticeEvaluationResponse(current, illegal, request)).toBe(current)
    review.session.version = request.version + 2
    expect(synchronizePracticeEvaluationResponse(current, review, request)).toBe(current)
  })
})
