import { describe, expect, it } from "vitest"

import { createPracticeMockResponse } from "@/mocks/data/practice"
import type { PracticeCompletedEarlyState, PracticeReferenceAnswerState } from "@/models/practice"

import {
  synchronizeFollowUpGenerationResponse,
  synchronizePracticeReferenceAnswerResponse,
  synchronizePracticeEvaluationResponse,
  synchronizePracticeMutationResponse,
  synchronizeQuestionGenerationResponse,
} from "./practice-cache"

describe("practice mutation cache contract", () => {
  it.each([
    ["questionHintReveal", "answerHints"],
    ["questionFrameworkReveal", "answerFramework"],
  ] as const)("accepts an exact main %s response and same-value reveal", (kind, field) => {
    const current = createPracticeMockResponse("answeringQuestion")
    if (current.session.status !== "answering") return
    const input = {
      questionId: current.session.question.id,
      sessionId: current.session.sessionId,
      version: current.session.version,
    }
    const response = structuredClone(current)
    if (response.session.status !== "answering") return
    response.session.version = input.version + 1
    response.session.question[field] = {
      content: field === "answerHints" ? ["Use a result metric."] : ["Context", "Action", "Result"],
      status: "revealed",
    }

    const next = synchronizePracticeMutationResponse(current, response, { kind, input })
    expect(next?.session).toBe(response.session)
    expect(next?.session).toMatchObject({
      question: { [field]: { status: "revealed" } },
      version: input.version + 1,
    })

    const sameValue = structuredClone(response)
    if (sameValue.session.status !== "answering") return
    sameValue.session.version += 1
    const repeated = synchronizePracticeMutationResponse(response, sameValue, {
      kind,
      input: { ...input, version: response.session.version },
    })
    expect(repeated?.session).toBe(sameValue.session)
  })

  it("rejects main guidance responses that change anything besides the requested field", () => {
    const current = createPracticeMockResponse("answeringQuestion")
    if (current.session.status !== "answering") return
    const input = {
      questionId: current.session.question.id,
      sessionId: current.session.sessionId,
      version: current.session.version,
    }
    const response = structuredClone(current)
    if (response.session.status !== "answering") return
    response.session.version += 1
    response.session.question.answerHints = {
      content: ["Use a result metric."],
      status: "revealed",
    }

    const targetStillHidden = structuredClone(response)
    if (targetStillHidden.session.status !== "answering") return
    targetStillHidden.session.question.answerHints = {
      content: null,
      status: "notRequested",
    }
    expect(
      synchronizePracticeMutationResponse(current, targetStillHidden, {
        kind: "questionHintReveal",
        input,
      }),
    ).toBe(current)

    const nonTargetChanged = structuredClone(response)
    if (nonTargetChanged.session.status !== "answering") return
    nonTargetChanged.session.question.answerFramework = {
      content: ["Changed unexpectedly"],
      status: "revealed",
    }
    expect(
      synchronizePracticeMutationResponse(current, nonTargetChanged, {
        kind: "questionHintReveal",
        input,
      }),
    ).toBe(current)

    const changedQuestion = structuredClone(response)
    if (changedQuestion.session.status !== "answering") return
    changedQuestion.session.question.prompt = "Changed unexpectedly"
    expect(
      synchronizePracticeMutationResponse(current, changedQuestion, {
        kind: "questionHintReveal",
        input,
      }),
    ).toBe(current)

    const wrongVersion = structuredClone(response)
    if (wrongVersion.session.status !== "answering") return
    wrongVersion.session.version += 1
    expect(
      synchronizePracticeMutationResponse(current, wrongVersion, {
        kind: "questionHintReveal",
        input,
      }),
    ).toBe(current)
  })

  it.each([
    ["followUpHintReveal", "answerHints"],
    ["followUpFrameworkReveal", "answerFramework"],
  ] as const)("accepts an exact current follow-up %s response", (kind, field) => {
    const current = createPracticeMockResponse("answeringFollowUp")
    if (current.session.status !== "answeringFollowUp") return
    const input = {
      followUpQuestionId: current.session.currentFollowUp.question.id,
      questionId: current.session.question.id,
      sessionId: current.session.sessionId,
      version: current.session.version,
    }
    const response = structuredClone(current)
    if (response.session.status !== "answeringFollowUp") return
    response.session.version += 1
    response.session.currentFollowUp.question[field] = {
      content: field === "answerHints" ? ["Name the metric."] : ["Baseline", "Result"],
      status: "revealed",
    }

    const next = synchronizePracticeMutationResponse(current, response, { kind, input })
    expect(next?.session).toBe(response.session)
    expect(next?.session).toMatchObject({
      currentFollowUp: { question: { [field]: { status: "revealed" } } },
      version: input.version + 1,
    })
  })

  it("rejects a follow-up reveal that mutates history or leaves the target hidden", () => {
    const current = createPracticeMockResponse("answeringFollowUp")
    if (current.session.status !== "answeringFollowUp") return
    const input = {
      followUpQuestionId: current.session.currentFollowUp.question.id,
      questionId: current.session.question.id,
      sessionId: current.session.sessionId,
      version: current.session.version,
    }
    const response = structuredClone(current)
    if (response.session.status !== "answeringFollowUp") return
    response.session.version += 1
    response.session.currentFollowUp.question.answerHints = {
      content: ["Name the metric."],
      status: "revealed",
    }

    const historyChanged = structuredClone(response)
    if (historyChanged.session.status !== "answeringFollowUp") return
    historyChanged.session.followUpExchanges.push({
      ...historyChanged.session.followUpExchanges[0]!,
      answer: {
        ...historyChanged.session.followUpExchanges[0]!.answer,
        content: "Changed history",
      },
    })
    expect(
      synchronizePracticeMutationResponse(current, historyChanged, {
        kind: "followUpHintReveal",
        input,
      }),
    ).toBe(current)

    const targetStillHidden = structuredClone(response)
    if (targetStillHidden.session.status !== "answeringFollowUp") return
    targetStillHidden.session.currentFollowUp.question.answerHints = {
      content: null,
      status: "notRequested",
    }
    expect(
      synchronizePracticeMutationResponse(current, targetStillHidden, {
        kind: "followUpHintReveal",
        input,
      }),
    ).toBe(current)

    const wrongAttempt = structuredClone(response)
    if (wrongAttempt.session.status !== "answeringFollowUp") return
    wrongAttempt.session.attemptId = "another-attempt"
    expect(
      synchronizePracticeMutationResponse(current, wrongAttempt, {
        kind: "followUpHintReveal",
        input,
      }),
    ).toBe(current)
  })

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

  it.each(["saved", "history"] as const)(
    "accepts %s continue responses that are already answering",
    (source) => {
      const current = createPracticeMockResponse("reviewBalanced")
      const response = createPracticeMockResponse("answeringQuestion")
      if (current.session.status !== "review" || response.session.status !== "answering") return

      const input = {
        questionId: current.session.question.id,
        sessionId: current.session.sessionId,
        version: current.session.version,
      }
      current.session.selection = { ...current.session.selection, source }
      response.session.sessionId = input.sessionId
      response.session.version = input.version + 1
      response.session.selection = structuredClone(current.session.selection)
      response.session.attemptNumber = current.session.attemptNumber + 1

      const next = synchronizePracticeMutationResponse(current, response.session, {
        kind: "continueToNextQuestion",
        input,
      })

      expect(next?.session).toBe(response.session)
      expect(next?.session).toMatchObject({ status: "answering", version: input.version + 1 })
    },
  )

  it.each(["saved", "history"] as const)(
    "accepts %s skip responses that are already answering",
    (source) => {
      const current = createPracticeMockResponse("answeringQuestion")
      const response = createPracticeMockResponse("answeringQuestion")
      if (current.session.status !== "answering" || response.session.status !== "answering") return

      const input = {
        questionId: current.session.question.id,
        sessionId: current.session.sessionId,
        version: current.session.version,
      }
      current.session.selection = { ...current.session.selection, source }
      response.session.sessionId = input.sessionId
      response.session.version = input.version + 1
      response.session.selection = structuredClone(current.session.selection)
      response.session.attemptId = "saved-replacement-attempt"

      const next = synchronizePracticeMutationResponse(current, response.session, {
        kind: "skipQuestion",
        input,
      })

      expect(next?.session).toBe(response.session)
      expect(next?.session).toMatchObject({ status: "answering", version: input.version + 1 })
    },
  )

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

  it("accepts a review weak-flag response only when the review snapshot is unchanged", () => {
    const current = createPracticeMockResponse("reviewBalanced")
    if (current.session.status !== "review") return
    const input = {
      sessionId: current.session.sessionId,
      version: current.session.version,
      questionId: current.session.question.id,
      isMarkedWeak: true,
    }
    const response = structuredClone(current)
    if (response.session.status !== "review") return
    response.session.version = input.version + 1
    response.session.question.isMarkedWeak = true

    expect(
      synchronizePracticeMutationResponse(current, response.session, {
        kind: "questionFlagUpdate",
        input,
      }),
    ).toMatchObject({ session: response.session })
    expect(
      synchronizePracticeMutationResponse(current, response.session, {
        kind: "questionFlagUpdate",
        input,
      })?.session,
    ).toBe(response.session)

    const changedEvaluation = structuredClone(response)
    if (changedEvaluation.session.status !== "review") return
    changedEvaluation.session.evaluation.overallScore += 1
    expect(
      synchronizePracticeMutationResponse(current, changedEvaluation.session, {
        kind: "questionFlagUpdate",
        input,
      }),
    ).toBe(current)

    const changedNonTargetFlag = structuredClone(response)
    if (changedNonTargetFlag.session.status !== "review") return
    changedNonTargetFlag.session.question.isSaved = true
    expect(
      synchronizePracticeMutationResponse(current, changedNonTargetFlag.session, {
        kind: "questionFlagUpdate",
        input,
      }),
    ).toBe(current)

    const wrongTarget = structuredClone(response)
    if (wrongTarget.session.status !== "review") return
    wrongTarget.session.question.isMarkedWeak = false
    expect(
      synchronizePracticeMutationResponse(current, wrongTarget.session, {
        kind: "questionFlagUpdate",
        input,
      }),
    ).toBe(current)
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
        kind: "questionReferenceAnswerRequest",
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
        kind: "questionReferenceAnswerRequest",
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
        kind: "followUpReferenceAnswerRequest",
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

describe("practice reference answer cache contract", () => {
  const mainReferenceInput = (sessionId: string, version: number, questionId: string) => ({
    questionId,
    sessionId,
    version,
  })

  const followUpReferenceInput = (
    sessionId: string,
    version: number,
    questionId: string,
    followUpQuestionId: string,
  ) => ({
    followUpQuestionId,
    questionId,
    sessionId,
    version,
  })

  it("does not let stale main reference polling roll back a newer session version", () => {
    const current = createPracticeMockResponse("answeringQuestion")
    if (current.session.status !== "answering") return
    current.session.version = 4
    current.session.question.referenceAnswer = {
      content: null,
      status: "generating",
      viewedBeforeSubmission: false,
    }

    const staleResponse = structuredClone(current)
    if (staleResponse.session.status !== "answering") return
    staleResponse.session.version = 3
    staleResponse.session.question.referenceAnswer = {
      content: {
        answer: "旧的参考答案。",
        commonMistakes: ["忽略结果。"],
        generatedAt: "2026-08-14T09:30:00Z",
        keyPoints: ["说明行动。", "说明结果。"],
        kind: "personalizedExample",
      },
      status: "revealed",
      viewedBeforeSubmission: true,
    }

    expect(
      synchronizePracticeReferenceAnswerResponse(
        current,
        staleResponse,
        mainReferenceInput(current.session.sessionId, 3, current.session.question.id),
      ),
    ).toBe(current)
  })

  it("does not let stale follow-up reference polling roll back a newer session version", () => {
    const current = createPracticeMockResponse("answeringFollowUp")
    if (current.session.status !== "answeringFollowUp") return
    current.session.version = 4
    current.session.currentFollowUp.question.referenceAnswer = {
      content: null,
      status: "generating",
      viewedBeforeSubmission: false,
    }

    const staleResponse = structuredClone(current)
    if (staleResponse.session.status !== "answeringFollowUp") return
    staleResponse.session.version = 3
    staleResponse.session.currentFollowUp.question.referenceAnswer = {
      content: {
        addressedGap: "旧的证据缺口。",
        answer: "旧的追问参考答案。",
        commonMistakes: ["没有量化结果。"],
        generatedAt: "2026-08-14T09:30:00Z",
        keyPoints: ["说明基线。", "说明变化。"],
        kind: "personalizedSupplement",
      },
      status: "revealed",
      viewedBeforeSubmission: true,
    }

    expect(
      synchronizePracticeReferenceAnswerResponse(
        current,
        staleResponse,
        followUpReferenceInput(
          current.session.sessionId,
          3,
          current.session.question.id,
          current.session.currentFollowUp.question.id,
        ),
      ),
    ).toBe(current)
  })

  it("enforces monotonic main reference answer progression", () => {
    const current = createPracticeMockResponse("answeringQuestion")
    if (current.session.status !== "answering") return
    current.session.question.referenceAnswer = {
      content: null,
      status: "generating",
      viewedBeforeSubmission: false,
    }
    const request = mainReferenceInput(
      current.session.sessionId,
      current.session.version,
      current.session.question.id,
    )

    const revealed = structuredClone(current)
    if (revealed.session.status !== "answering") return
    revealed.session.question.referenceAnswer = {
      content: {
        answer: "稳定的参考答案。",
        commonMistakes: ["没有结果。"],
        generatedAt: "2026-08-14T09:30:00Z",
        keyPoints: ["行动。", "结果。"],
        kind: "personalizedExample",
      },
      status: "revealed",
      viewedBeforeSubmission: true,
    }
    expect(synchronizePracticeReferenceAnswerResponse(current, revealed, request)?.session).toBe(
      revealed.session,
    )

    const unavailable = structuredClone(current)
    if (unavailable.session.status !== "answering") return
    unavailable.session.question.referenceAnswer = {
      content: null,
      status: "unavailable",
      viewedBeforeSubmission: false,
    }
    expect(synchronizePracticeReferenceAnswerResponse(current, unavailable, request)?.session).toBe(
      unavailable.session,
    )

    const revealedCurrent = structuredClone(revealed)
    const backward = structuredClone(revealedCurrent)
    if (backward.session.status !== "answering") return
    backward.session.question.referenceAnswer = {
      content: null,
      status: "generating",
      viewedBeforeSubmission: false,
    }
    expect(synchronizePracticeReferenceAnswerResponse(revealedCurrent, backward, request)).toBe(
      revealedCurrent,
    )

    const changedRevealed = structuredClone(revealedCurrent)
    if (changedRevealed.session.status !== "answering") return
    if (changedRevealed.session.question.referenceAnswer.status !== "revealed") return
    changedRevealed.session.question.referenceAnswer.content.answer = "另一份参考答案。"
    expect(
      synchronizePracticeReferenceAnswerResponse(revealedCurrent, changedRevealed, request),
    ).toBe(revealedCurrent)

    const unavailableCurrent = structuredClone(unavailable)
    const unavailableBackward = structuredClone(unavailableCurrent)
    if (unavailableBackward.session.status !== "answering") return
    unavailableBackward.session.question.referenceAnswer = {
      content: null,
      status: "notRequested",
      viewedBeforeSubmission: false,
    }
    expect(
      synchronizePracticeReferenceAnswerResponse(unavailableCurrent, unavailableBackward, request),
    ).toBe(unavailableCurrent)
  })

  it.each([
    ["questionHintReveal", "answerHints"],
    ["questionFrameworkReveal", "answerFramework"],
  ] as const)("accepts main %s while the reference answer completes", (kind, field) => {
    const current = createPracticeMockResponse("answeringQuestion")
    if (current.session.status !== "answering") return
    current.session.question.referenceAnswer = {
      content: null,
      status: "generating",
      viewedBeforeSubmission: false,
    }
    const response = structuredClone(current)
    if (response.session.status !== "answering") return
    response.session.version += 1
    response.session.question[field] = {
      content: field === "answerHints" ? ["补充结果。"] : ["背景", "行动", "结果"],
      status: "revealed",
    }
    response.session.question.referenceAnswer = {
      content: {
        answer: "后台完成的参考答案。",
        commonMistakes: ["只讲职责。"],
        generatedAt: "2026-08-14T09:30:00Z",
        keyPoints: ["个人行动。", "可验证结果。"],
        kind: "personalizedExample",
      },
      status: "revealed",
      viewedBeforeSubmission: true,
    }

    const next = synchronizePracticeMutationResponse(current, response, {
      kind,
      input: {
        questionId: current.session.question.id,
        sessionId: current.session.sessionId,
        version: current.session.version,
      },
    })
    expect(next?.session).toBe(response.session)
  })

  it("accepts a main save response while the reference answer completes", () => {
    const current = createPracticeMockResponse("answeringQuestion")
    if (current.session.status !== "answering") return
    current.session.question.referenceAnswer = {
      content: null,
      status: "generating",
      viewedBeforeSubmission: false,
    }
    const response = structuredClone(current)
    if (response.session.status !== "answering") return
    response.session.version += 1
    response.session.question.isSaved = true
    response.session.question.referenceAnswer = {
      content: {
        answer: "后台完成的参考答案。",
        commonMistakes: ["缺少指标。"],
        generatedAt: "2026-08-14T09:30:00Z",
        keyPoints: ["行动。", "结果。"],
        kind: "technicalReference",
      },
      status: "revealed",
      viewedBeforeSubmission: true,
    }

    expect(
      synchronizePracticeMutationResponse(current, response, {
        kind: "questionFlagUpdate",
        input: {
          isSaved: true,
          questionId: current.session.question.id,
          sessionId: current.session.sessionId,
          version: current.session.version,
        },
      })?.session,
    ).toBe(response.session)
  })

  it("accepts a review weak-flag response while the main reference answer completes", () => {
    const current = createPracticeMockResponse("reviewBalanced")
    if (current.session.status !== "review") return
    current.session.question.referenceAnswer = {
      content: null,
      status: "generating",
      viewedBeforeSubmission: false,
    }
    const response = structuredClone(current)
    if (response.session.status !== "review") return
    response.session.version += 1
    response.session.question.isMarkedWeak = true
    response.session.question.referenceAnswer = {
      content: {
        answer: "后台完成的复习参考答案。",
        commonMistakes: ["没有复盘结果。"],
        generatedAt: "2026-08-14T09:30:00Z",
        keyPoints: ["找出问题。", "给出改进。"],
        kind: "personalizedExample",
      },
      status: "revealed",
      viewedBeforeSubmission: true,
    }

    expect(
      synchronizePracticeMutationResponse(current, response, {
        kind: "questionFlagUpdate",
        input: {
          isMarkedWeak: true,
          questionId: current.session.question.id,
          sessionId: current.session.sessionId,
          version: current.session.version,
        },
      })?.session,
    ).toBe(response.session)
  })

  it("accepts a follow-up hint while main, history, and current references complete", () => {
    const current = createPracticeMockResponse("answeringFollowUp")
    if (current.session.status !== "answeringFollowUp") return
    current.session.question.referenceAnswer = {
      content: null,
      status: "generating",
      viewedBeforeSubmission: false,
    }
    const historicalExchange = current.session.followUpExchanges[0]
    if (!historicalExchange) return
    historicalExchange.question.referenceAnswer = {
      content: null,
      status: "generating",
      viewedBeforeSubmission: false,
    }
    current.session.currentFollowUp.question.referenceAnswer = {
      content: null,
      status: "generating",
      viewedBeforeSubmission: false,
    }
    const response = structuredClone(current)
    if (response.session.status !== "answeringFollowUp") return
    response.session.version += 1
    response.session.currentFollowUp.question.answerHints = {
      content: ["补充结果。"],
      status: "revealed",
    }
    response.session.question.referenceAnswer = {
      content: {
        answer: "主问题参考答案。",
        commonMistakes: ["没有结果。"],
        generatedAt: "2026-08-14T09:30:00Z",
        keyPoints: ["行动。", "结果。"],
        kind: "personalizedExample",
      },
      status: "revealed",
      viewedBeforeSubmission: true,
    }
    response.session.followUpExchanges[0]!.question.referenceAnswer = {
      content: {
        addressedGap: "历史追问证据。",
        answer: "历史追问参考答案。",
        commonMistakes: ["没有基线。"],
        generatedAt: "2026-08-14T09:30:00Z",
        keyPoints: ["基线。", "变化。"],
        kind: "personalizedSupplement",
      },
      status: "revealed",
      viewedBeforeSubmission: true,
    }
    response.session.currentFollowUp.question.referenceAnswer = {
      content: {
        addressedGap: "当前追问证据。",
        answer: "当前追问参考答案。",
        commonMistakes: ["只重复主回答。"],
        generatedAt: "2026-08-14T09:30:00Z",
        keyPoints: ["基线。", "结果。"],
        kind: "personalizedSupplement",
      },
      status: "revealed",
      viewedBeforeSubmission: true,
    }

    const next = synchronizePracticeMutationResponse(current, response, {
      kind: "followUpHintReveal",
      input: {
        followUpQuestionId: current.session.currentFollowUp.question.id,
        questionId: current.session.question.id,
        sessionId: current.session.sessionId,
        version: current.session.version,
      },
    })
    expect(next?.session).toBe(response.session)

    const changedAnswer = structuredClone(response)
    if (changedAnswer.session.status !== "answeringFollowUp") return
    changedAnswer.session.mainAnswer.content = "改动后的主回答。"
    expect(
      synchronizePracticeMutationResponse(current, changedAnswer, {
        kind: "followUpHintReveal",
        input: {
          followUpQuestionId: current.session.currentFollowUp.question.id,
          questionId: current.session.question.id,
          sessionId: current.session.sessionId,
          version: current.session.version,
        },
      }),
    ).toBe(current)
  })

  it("accepts follow-up reference polling with same-version reference hydration", () => {
    const current = createPracticeMockResponse("answeringFollowUp")
    if (current.session.status !== "answeringFollowUp") return
    current.session.question.referenceAnswer = {
      content: null,
      status: "generating",
      viewedBeforeSubmission: false,
    }
    const historicalExchange = current.session.followUpExchanges[0]
    if (!historicalExchange) return
    historicalExchange.question.referenceAnswer = {
      content: null,
      status: "generating",
      viewedBeforeSubmission: false,
    }
    current.session.currentFollowUp.question.referenceAnswer = {
      content: null,
      status: "generating",
      viewedBeforeSubmission: false,
    }
    const response = structuredClone(current)
    if (response.session.status !== "answeringFollowUp") return
    response.session.question.referenceAnswer = {
      content: {
        answer: "主问题参考答案。",
        commonMistakes: ["没有结果。"],
        generatedAt: "2026-08-14T09:30:00Z",
        keyPoints: ["行动。", "结果。"],
        kind: "technicalReference",
      },
      status: "revealed",
      viewedBeforeSubmission: true,
    }
    response.session.followUpExchanges[0]!.question.referenceAnswer = {
      content: {
        addressedGap: "历史追问证据。",
        answer: "历史追问参考答案。",
        commonMistakes: ["没有基线。"],
        generatedAt: "2026-08-14T09:30:00Z",
        keyPoints: ["基线。", "变化。"],
        kind: "technicalReference",
      },
      status: "revealed",
      viewedBeforeSubmission: true,
    }
    response.session.currentFollowUp.question.referenceAnswer = {
      content: {
        addressedGap: "当前追问证据。",
        answer: "当前追问参考答案。",
        commonMistakes: ["只重复主回答。"],
        generatedAt: "2026-08-14T09:30:00Z",
        keyPoints: ["基线。", "结果。"],
        kind: "personalizedSupplement",
      },
      status: "revealed",
      viewedBeforeSubmission: true,
    }

    const next = synchronizePracticeReferenceAnswerResponse(
      current,
      response,
      followUpReferenceInput(
        current.session.sessionId,
        current.session.version,
        current.session.question.id,
        current.session.currentFollowUp.question.id,
      ),
    )
    expect(next?.session).toBe(response.session)

    const changedPrompt = structuredClone(response)
    if (changedPrompt.session.status !== "answeringFollowUp") return
    changedPrompt.session.question.prompt = "不允许改变的主问题。"
    expect(
      synchronizePracticeReferenceAnswerResponse(
        current,
        changedPrompt,
        followUpReferenceInput(
          current.session.sessionId,
          current.session.version,
          current.session.question.id,
          current.session.currentFollowUp.question.id,
        ),
      ),
    ).toBe(current)
  })

  it("accepts main request transitions to generating, revealed, or unavailable", () => {
    const referenceAnswers: PracticeReferenceAnswerState[] = [
      { content: null, status: "generating" as const, viewedBeforeSubmission: false },
      {
        content: {
          answer: "A grounded answer.",
          commonMistakes: ["Inventing a metric."],
          generatedAt: "2026-08-14T09:30:00Z",
          keyPoints: ["State the decision.", "Connect the evidence."],
          kind: "personalizedExample" as const,
        },
        status: "revealed" as const,
        viewedBeforeSubmission: true,
      },
      { content: null, status: "unavailable" as const, viewedBeforeSubmission: false },
    ]
    for (const referenceAnswer of referenceAnswers) {
      const current = createPracticeMockResponse("answeringQuestion")
      if (current.session.status !== "answering") return
      const input = mainReferenceInput(
        current.session.sessionId,
        current.session.version,
        current.session.question.id,
      )
      const response = structuredClone(current)
      if (response.session.status !== "answering") return
      response.session.version += 1
      response.session.question.referenceAnswer = referenceAnswer

      const next = synchronizePracticeMutationResponse(current, response, {
        kind: "questionReferenceAnswerRequest",
        input,
      })
      expect(next?.session).toBe(response.session)
    }
  })

  it("accepts main polling while generating and then revealed or unavailable", () => {
    const current = createPracticeMockResponse("answeringQuestion")
    if (current.session.status !== "answering") return
    current.session.question.referenceAnswer = {
      content: null,
      status: "generating",
      viewedBeforeSubmission: false,
    }
    const request = mainReferenceInput(
      current.session.sessionId,
      current.session.version,
      current.session.question.id,
    )

    const referenceAnswers: PracticeReferenceAnswerState[] = [
      { content: null, status: "generating" as const, viewedBeforeSubmission: false },
      { content: null, status: "unavailable" as const, viewedBeforeSubmission: false },
    ]
    for (const referenceAnswer of referenceAnswers) {
      const response = structuredClone(current)
      if (response.session.status !== "answering") return
      response.session.question.referenceAnswer = referenceAnswer
      expect(synchronizePracticeReferenceAnswerResponse(current, response, request)?.session).toBe(
        response.session,
      )
    }

    const revealed = structuredClone(current)
    if (revealed.session.status !== "answering") return
    revealed.session.question.referenceAnswer = {
      content: {
        answer: "A grounded answer.",
        commonMistakes: ["Inventing a metric."],
        generatedAt: "2026-08-14T09:30:00Z",
        keyPoints: ["State the decision.", "Connect the evidence."],
        kind: "technicalReference",
      },
      status: "revealed",
      viewedBeforeSubmission: true,
    }
    expect(synchronizePracticeReferenceAnswerResponse(current, revealed, request)?.session).toBe(
      revealed.session,
    )

    const wrongVersion = structuredClone(revealed)
    if (wrongVersion.session.status !== "answering") return
    wrongVersion.session.version += 1
    expect(synchronizePracticeReferenceAnswerResponse(current, wrongVersion, request)).toBe(current)

    const changedQuestion = structuredClone(revealed)
    if (changedQuestion.session.status !== "answering") return
    changedQuestion.session.question.prompt = "A changed question prompt."
    expect(synchronizePracticeReferenceAnswerResponse(current, changedQuestion, request)).toBe(
      current,
    )

    const changedGuidance = structuredClone(revealed)
    if (changedGuidance.session.status !== "answering") return
    changedGuidance.session.question.answerHints = {
      content: ["A changed hint."],
      status: "revealed",
    }
    expect(synchronizePracticeReferenceAnswerResponse(current, changedGuidance, request)).toBe(
      current,
    )

    const changedFlags = structuredClone(revealed)
    if (changedFlags.session.status !== "answering") return
    changedFlags.session.question.isSaved = !changedFlags.session.question.isSaved
    expect(synchronizePracticeReferenceAnswerResponse(current, changedFlags, request)).toBe(current)

    const changedAttempt = structuredClone(revealed)
    if (changedAttempt.session.status !== "answering") return
    changedAttempt.session.attemptId = "another_attempt"
    expect(synchronizePracticeReferenceAnswerResponse(current, changedAttempt, request)).toBe(
      current,
    )

    const notRequested = structuredClone(revealed)
    if (notRequested.session.status !== "answering") return
    notRequested.session.question.referenceAnswer = {
      content: null,
      status: "notRequested",
      viewedBeforeSubmission: false,
    }
    expect(synchronizePracticeReferenceAnswerResponse(current, notRequested, request)).toBe(current)
  })

  it("keeps follow-up reference lineage isolated from history", () => {
    const current = createPracticeMockResponse("answeringFollowUp")
    if (current.session.status !== "answeringFollowUp") return
    current.session.currentFollowUp.question.referenceAnswer = {
      content: null,
      status: "generating",
      viewedBeforeSubmission: false,
    }
    const request = followUpReferenceInput(
      current.session.sessionId,
      current.session.version,
      current.session.question.id,
      current.session.currentFollowUp.question.id,
    )
    const response = structuredClone(current)
    if (response.session.status !== "answeringFollowUp") return
    response.session.currentFollowUp.question.referenceAnswer = {
      content: {
        addressedGap: "Connect the decision to the result.",
        answer: "Tie the decision to the measurable result.",
        commonMistakes: ["Claiming team impact as personal impact."],
        generatedAt: "2026-08-14T09:30:00Z",
        keyPoints: ["Name the baseline.", "Connect the result."],
        kind: "personalizedSupplement",
      },
      status: "revealed",
      viewedBeforeSubmission: true,
    }

    const next = synchronizePracticeReferenceAnswerResponse(current, response, request)
    expect(next?.session).toBe(response.session)
    expect(next?.session).toMatchObject({
      followUpExchanges: current.session.followUpExchanges,
      currentFollowUp: {
        question: {
          referenceAnswer: { status: "revealed" },
        },
      },
    })

    const changedHistory = structuredClone(response)
    if (changedHistory.session.status !== "answeringFollowUp") return
    const historicalExchange = changedHistory.session.followUpExchanges[0]
    if (!historicalExchange) return
    historicalExchange.answer.content = "Changed historical answer"
    expect(synchronizePracticeReferenceAnswerResponse(current, changedHistory, request)).toBe(
      current,
    )
  })
})
