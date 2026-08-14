import { describe, expect, it } from "vitest"

import { createPracticeMockResponse } from "@/mocks/data/practice"
import type { PracticeCompletedEarlyState } from "@/models/practice"

import {
  synchronizeFollowUpGenerationResponse,
  synchronizePracticeEvaluationResponse,
  synchronizePracticeMutationResponse,
  synchronizeQuestionGenerationResponse,
} from "./practice-cache"

describe("practice mutation cache contract", () => {
  it("merges an active-only real mutation response while preserving setup context", () => {
    const current = createPracticeMockResponse("answeringQuestion")
    const followUp = createPracticeMockResponse("answeringFirstFollowUp").session
    if (current.session.status !== "answering" || followUp.status !== "answeringFollowUp") return
    const response = { ...structuredClone(followUp), status: "generatingFollowUp" as const }
    response.sessionId = current.session.sessionId
    response.question.id = current.session.question.id
    response.version = current.session.version + 1

    const next = synchronizePracticeMutationResponse(current, response, {
      kind: "submitPrimaryAnswer",
      input: {
        content: "主回答",
        questionId: current.session.question.id,
        sessionId: current.session.sessionId,
        version: current.session.version,
      },
    })

    expect(next?.session).toBe(response)
    expect(next?.setupContext).toBe(current.setupContext)
  })

  it("accepts only an ended-early follow-up stop response with the same submitted snapshot", () => {
    const current = createPracticeMockResponse("answeringFirstFollowUp")
    const response = createPracticeMockResponse("evaluatingFollowUpEndedEarly")
    if (
      current.session.status !== "answeringFollowUp" ||
      response.session.status !== "evaluating"
    ) {
      return
    }

    const input = {
      followUpQuestionId: current.session.currentFollowUp.question.id,
      questionId: current.session.question.id,
      sessionId: current.session.sessionId,
      version: current.session.version,
    }
    response.session.sessionId = input.sessionId
    response.session.version = input.version + 1
    response.session.attemptId = current.session.attemptId
    response.session.attemptNumber = current.session.attemptNumber
    response.session.question = structuredClone(current.session.question)
    response.session.mainAnswer = structuredClone(current.session.mainAnswer)
    response.session.followUpExchanges = structuredClone(current.session.followUpExchanges)
    response.session.followUpCompletion = {
      status: "endedEarly",
      unansweredQuestion: structuredClone(current.session.currentFollowUp.question),
    }

    const next = synchronizePracticeMutationResponse(current, response.session, {
      kind: "endFollowUps",
      input,
    })
    expect(next?.session).toBe(response.session)

    const wrongVersion = structuredClone(response.session)
    wrongVersion.version = input.version + 2
    expect(
      synchronizePracticeMutationResponse(current, wrongVersion, {
        kind: "endFollowUps",
        input,
      }),
    ).toBe(current)

    const wrongAttempt = structuredClone(response.session)
    wrongAttempt.attemptId = "another-attempt"
    expect(
      synchronizePracticeMutationResponse(current, wrongAttempt, {
        kind: "endFollowUps",
        input,
      }),
    ).toBe(current)

    const wrongQuestion = structuredClone(response.session)
    wrongQuestion.question.id = "another-question"
    expect(
      synchronizePracticeMutationResponse(current, wrongQuestion, {
        kind: "endFollowUps",
        input,
      }),
    ).toBe(current)

    const wrongMainAnswer = structuredClone(response.session)
    wrongMainAnswer.mainAnswer.id = "another-main-answer"
    expect(
      synchronizePracticeMutationResponse(current, wrongMainAnswer, {
        kind: "endFollowUps",
        input,
      }),
    ).toBe(current)

    const wrongCompletion = structuredClone(response.session)
    wrongCompletion.followUpCompletion = {
      status: "completed",
      reason: "allAnswered",
    }
    expect(
      synchronizePracticeMutationResponse(current, wrongCompletion, {
        kind: "endFollowUps",
        input,
      }),
    ).toBe(current)

    const wrongUnansweredId = structuredClone(response.session)
    if (wrongUnansweredId.followUpCompletion.status !== "endedEarly") return
    wrongUnansweredId.followUpCompletion.unansweredQuestion.id = "another-follow-up"
    expect(
      synchronizePracticeMutationResponse(current, wrongUnansweredId, {
        kind: "endFollowUps",
        input,
      }),
    ).toBe(current)

    const wrongUnansweredOrder = structuredClone(response.session)
    if (wrongUnansweredOrder.followUpCompletion.status !== "endedEarly") return
    wrongUnansweredOrder.followUpCompletion.unansweredQuestion.order = 2
    expect(
      synchronizePracticeMutationResponse(current, wrongUnansweredOrder, {
        kind: "endFollowUps",
        input,
      }),
    ).toBe(current)
  })

  it("accepts only the exact review-to-generating-next-question transition", () => {
    const current = createPracticeMockResponse("reviewBalanced")
    const response = createPracticeMockResponse("generatingQuestion")
    if (current.session.status !== "review" || response.session.status !== "generatingQuestion")
      return

    const input = {
      questionId: current.session.question.id,
      sessionId: current.session.sessionId,
      version: current.session.version,
    }
    response.session.sessionId = input.sessionId
    response.session.version = input.version + 1

    const next = synchronizePracticeMutationResponse(current, response.session, {
      kind: "continueToNextQuestion",
      input,
    })
    expect(next?.session).toBe(response.session)
    expect(next?.setupContext).toBe(current.setupContext)

    const wrongStatus = structuredClone(current.session)
    wrongStatus.version = input.version + 1
    expect(
      synchronizePracticeMutationResponse(current, wrongStatus, {
        kind: "continueToNextQuestion",
        input,
      }),
    ).toBe(current)

    const wrongVersion = structuredClone(response.session)
    wrongVersion.version = input.version + 2
    expect(
      synchronizePracticeMutationResponse(current, wrongVersion, {
        kind: "continueToNextQuestion",
        input,
      }),
    ).toBe(current)

    const sameVersion = structuredClone(response.session)
    sameVersion.version = input.version
    expect(
      synchronizePracticeMutationResponse(current, sameVersion, {
        kind: "continueToNextQuestion",
        input,
      }),
    ).toBe(current)

    const wrongSession = structuredClone(response.session)
    wrongSession.sessionId = "another-session"
    expect(
      synchronizePracticeMutationResponse(current, wrongSession, {
        kind: "continueToNextQuestion",
        input,
      }),
    ).toBe(current)

    const wrongQuestion = structuredClone(input)
    wrongQuestion.questionId = "another-question"
    expect(
      synchronizePracticeMutationResponse(current, response.session, {
        kind: "continueToNextQuestion",
        input: wrongQuestion,
      }),
    ).toBe(current)
  })

  it("accepts review-to-answering retry with a new attempt and the same question", () => {
    const current = createPracticeMockResponse("reviewBalanced")
    const response = createPracticeMockResponse("answeringQuestion")
    const generating = createPracticeMockResponse("generatingQuestion")
    if (
      current.session.status !== "review" ||
      response.session.status !== "answering" ||
      generating.session.status !== "generatingQuestion"
    ) {
      return
    }

    const input = {
      questionId: current.session.question.id,
      sessionId: current.session.sessionId,
      version: current.session.version,
    }
    response.session.sessionId = input.sessionId
    response.session.version = input.version + 1
    response.session.attemptId = "retry-attempt"
    response.session.attemptNumber = current.session.attemptNumber + 1
    response.session.question = structuredClone(current.session.question)

    const next = synchronizePracticeMutationResponse(current, response.session, {
      kind: "retryCurrentQuestion",
      input,
    })

    expect(next?.session).toBe(response.session)
    expect(next?.setupContext).toBe(current.setupContext)
    expect(next?.session).toMatchObject({
      attemptId: "retry-attempt",
      attemptNumber: 2,
      question: { id: input.questionId },
      status: "answering",
      version: input.version + 1,
    })
    expect(response.session.attemptId).not.toBe(current.session.attemptId)

    const wrongStatus = structuredClone(current.session)
    wrongStatus.version = input.version + 1
    expect(
      synchronizePracticeMutationResponse(current, wrongStatus, {
        kind: "retryCurrentQuestion",
        input,
      }),
    ).toBe(current)

    const wrongVersion = structuredClone(response.session)
    wrongVersion.version = input.version + 2
    expect(
      synchronizePracticeMutationResponse(current, wrongVersion, {
        kind: "retryCurrentQuestion",
        input,
      }),
    ).toBe(current)

    const wrongSession = structuredClone(response.session)
    wrongSession.sessionId = "another-session"
    expect(
      synchronizePracticeMutationResponse(current, wrongSession, {
        kind: "retryCurrentQuestion",
        input,
      }),
    ).toBe(current)

    const wrongQuestion = structuredClone(response.session)
    wrongQuestion.question.id = "another-question"
    expect(
      synchronizePracticeMutationResponse(current, wrongQuestion, {
        kind: "retryCurrentQuestion",
        input,
      }),
    ).toBe(current)

    generating.session.sessionId = input.sessionId
    generating.session.version = input.version + 1
    expect(
      synchronizePracticeMutationResponse(current, generating.session, {
        kind: "retryCurrentQuestion",
        input,
      }),
    ).toBe(current)
  })

  it("accepts a start response from setup with a self-consistent requested selection", () => {
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

    const next = synchronizePracticeMutationResponse(current, response.session, {
      kind: "startSession",
      input,
    })

    expect(next?.session).toBe(response.session)
    expect(next?.setupContext).toBe(current.setupContext)

    response.session.version = 2
    const replay = synchronizePracticeMutationResponse(current, response.session, {
      kind: "startSession",
      input,
    })
    expect(replay?.session).toBe(response.session)

    response.session.version = 0
    expect(
      synchronizePracticeMutationResponse(current, response.session, {
        kind: "startSession",
        input,
      }),
    ).toBe(current)

    const answering = createPracticeMockResponse("answeringQuestion")
    if (answering.session.status !== "answering") return
    answering.session.sessionId = response.session.sessionId
    answering.session.version = 2
    answering.session.selection = structuredClone(input)
    const answeringPage = synchronizePracticeMutationResponse(current, answering.session, {
      kind: "startSession",
      input,
    })
    expect(answeringPage?.session.status).toBe("answering")

    const mismatched = structuredClone(answering.session)
    mismatched.selection.questionType = "behavioral"
    expect(
      synchronizePracticeMutationResponse(current, mismatched, {
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

  it("accepts only an early-completed snapshot that preserves the unanswered attempt", () => {
    const current = createPracticeMockResponse("answeringQuestion")
    const response = createPracticeMockResponse("completedSession")
    if (current.session.status !== "answering" || response.session.status !== "completed") return

    const earlySession: PracticeCompletedEarlyState = {
      ...response.session,
      attemptId: current.session.attemptId,
      attemptNumber: current.session.attemptNumber,
      completionReason: "userEndedEarly",
      finalAttemptAverageScore: 0,
      markedWeakQuestionCount: 0,
      nextStepSuggestion: null,
      questionsCompleted: 0,
      retryCount: 0,
      savedQuestionCount: 0,
      selection: structuredClone(current.session.selection),
      unfinishedAttempt: {
        attemptId: current.session.attemptId,
        attemptNumber: current.session.attemptNumber,
        question: structuredClone(current.session.question),
        selection: structuredClone(current.session.selection),
      },
      version: current.session.version + 1,
    }
    response.session = earlySession
    const input = {
      questionId: current.session.question.id,
      sessionId: current.session.sessionId,
      version: current.session.version,
    }

    expect(
      synchronizePracticeMutationResponse(current, response, {
        kind: "endQuestionSession",
        input,
      }),
    ).toBe(response)

    response.session = {
      ...earlySession,
      unfinishedAttempt: {
        ...earlySession.unfinishedAttempt,
        question: { ...earlySession.unfinishedAttempt.question, id: "another-question" },
      },
    }
    expect(
      synchronizePracticeMutationResponse(current, response, {
        kind: "endQuestionSession",
        input,
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
    if (
      current.session.status !== "generatingQuestion" ||
      pending.session.status !== "generatingQuestion" ||
      answering.session.status !== "answering"
    ) {
      return
    }
    const request = { sessionId: current.session.sessionId, version: current.session.version }
    answering.session.sessionId = request.sessionId
    answering.session.version = request.version + 1

    const pendingPage = synchronizeQuestionGenerationResponse(current, pending.session, request)
    expect(pendingPage?.session).toBe(pending.session)
    expect(pendingPage?.setupContext).toBe(current.setupContext)

    const answeringPage = synchronizeQuestionGenerationResponse(current, answering.session, request)
    expect(answeringPage?.session).toBe(answering.session)
    expect(answeringPage?.setupContext).toBe(current.setupContext)

    answering.session.version = request.version + 2
    expect(synchronizeQuestionGenerationResponse(current, answering.session, request)).toBe(current)
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

  it("preserves an ended-early evaluation snapshot through polling into review", () => {
    const current = createPracticeMockResponse("evaluatingFollowUpEndedEarly")
    const review = createPracticeMockResponse("reviewBalanced")
    if (current.session.status !== "evaluating" || review.session.status !== "review") return

    review.session.sessionId = current.session.sessionId
    review.session.version = current.session.version + 1
    review.session.attemptId = current.session.attemptId
    review.session.attemptNumber = current.session.attemptNumber
    review.session.question = structuredClone(current.session.question)
    review.session.mainAnswer = structuredClone(current.session.mainAnswer)
    review.session.followUpExchanges = structuredClone(current.session.followUpExchanges)
    review.session.followUpCompletion = structuredClone(current.session.followUpCompletion)
    const request = {
      questionId: current.session.question.id,
      sessionId: current.session.sessionId,
      version: current.session.version,
    }

    expect(synchronizePracticeEvaluationResponse(current, review, request)?.session).toBe(
      review.session,
    )

    const wrongCompletion = structuredClone(review)
    if (wrongCompletion.session.status !== "review") return
    wrongCompletion.session.followUpCompletion = {
      status: "completed",
      reason: "allAnswered",
    }
    expect(synchronizePracticeEvaluationResponse(current, wrongCompletion, request)).toBe(current)

    const changedAnswerChain = structuredClone(review)
    if (changedAnswerChain.session.status !== "review") return
    changedAnswerChain.session.followUpExchanges = [
      {
        ...changedAnswerChain.session.followUpExchanges[0]!,
        answer: {
          ...changedAnswerChain.session.followUpExchanges[0]!.answer,
          id: "another-answer",
        },
      },
    ]
    expect(synchronizePracticeEvaluationResponse(current, changedAnswerChain, request)).toBe(
      current,
    )
  })

  it("merges active-only evaluation polling responses into the page cache", () => {
    const current = createPracticeMockResponse("evaluatingAnswer")
    const response = createPracticeMockResponse("reviewBalanced").session
    if (current.session.status !== "evaluating" || response.status !== "review") return
    response.sessionId = current.session.sessionId
    response.version = current.session.version + 1
    response.question.id = current.session.question.id

    const next = synchronizePracticeEvaluationResponse(current, response, {
      questionId: current.session.question.id,
      sessionId: current.session.sessionId,
      version: current.session.version,
    })

    expect(next?.session).toBe(response)
    expect(next?.setupContext).toBe(current.setupContext)
  })

  it("accepts the complete follow-up generation transition chain", () => {
    const current = createPracticeMockResponse("answeringFirstFollowUp")
    if (current.session.status !== "answeringFollowUp") return
    const generating = {
      ...structuredClone(current.session),
      status: "generatingFollowUp" as const,
      version: current.session.version + 1,
    }
    const currentGeneratingPage = { ...current, session: generating }
    const request = {
      sessionId: generating.sessionId,
      version: generating.version,
    }
    const pending = synchronizeFollowUpGenerationResponse(
      currentGeneratingPage,
      generating,
      request,
    )
    expect(pending?.session).toBe(generating)

    const answering = structuredClone(current.session)
    answering.version = generating.version + 1
    const answeringNext = synchronizeFollowUpGenerationResponse(
      currentGeneratingPage,
      answering,
      request,
    )
    expect(answeringNext?.session).toBe(answering)

    const evaluating = createPracticeMockResponse("evaluatingAnswer").session
    if (evaluating.status !== "evaluating") return
    evaluating.sessionId = generating.sessionId
    evaluating.question.id = generating.question.id
    evaluating.version = generating.version + 1
    evaluating.followUpExchanges = generating.followUpExchanges
    const evaluatingNext = synchronizeFollowUpGenerationResponse(
      currentGeneratingPage,
      evaluating,
      request,
    )
    expect(evaluatingNext?.session).toBe(evaluating)
  })

  it("rejects stale, jumped, or cross-question follow-up generation responses", () => {
    const current = createPracticeMockResponse("answeringFirstFollowUp")
    if (current.session.status !== "answeringFollowUp") return
    const generating = {
      ...structuredClone(current.session),
      status: "generatingFollowUp" as const,
      version: current.session.version + 1,
    }
    const currentGeneratingPage = { ...current, session: generating }
    const request = { sessionId: generating.sessionId, version: generating.version }
    const response = structuredClone(current.session)
    response.version = request.version + 2

    expect(synchronizeFollowUpGenerationResponse(currentGeneratingPage, response, request)).toBe(
      currentGeneratingPage,
    )

    const wrongQuestion = structuredClone(response)
    wrongQuestion.question.id = "another_question"
    expect(
      synchronizeFollowUpGenerationResponse(currentGeneratingPage, wrongQuestion, request),
    ).toBe(currentGeneratingPage)

    const wrongSession = structuredClone(response)
    wrongSession.sessionId = "another_session"
    expect(
      synchronizeFollowUpGenerationResponse(currentGeneratingPage, wrongSession, request),
    ).toBe(currentGeneratingPage)
  })
})
