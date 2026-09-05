import { describe, expect, it } from "vitest"

import { createPracticeFaker } from "@/mocks/fakers/practice"
import {
  practiceEvaluationFixture,
  practiceFollowUps,
  practiceQuestionAlternates,
  practiceQuestionHelp,
  practiceQuestions,
  practiceReviewFixture,
  practiceSelectionFixture,
  practiceSetupFixture,
} from "@/mocks/fixtures/practice"
import type { QuestionType } from "@/models/practice-workflow"

const questionTypes: QuestionType[] = [
  "projectDeepDive",
  "behavioral",
  "businessUnderstanding",
  "motivation",
  "technicalFoundation",
]

describe("practiceFaker", () => {
  it("uses the fixed question for each type and preserves the selected difficulty", async () => {
    for (const questionType of questionTypes) {
      const faker = createPracticeFaker()
      const selection = {
        ...practiceSelectionFixture,
        targetRoleId: "target-role-id",
        questionType,
        difficulty: "pressure" as const,
      }

      await expect(faker.get()).resolves.toEqual(practiceSetupFixture)
      const generating = await faker.start(selection)
      await expect(faker.get()).resolves.toEqual(generating)

      const answering = await faker.pollQuestion()
      if (answering.status !== "answering") throw new Error("Expected an answering session.")
      expect(answering.question).toEqual({
        ...practiceQuestions[questionType],
        difficulty: selection.difficulty,
      })
      await expect(faker.get()).resolves.toEqual(answering)
      await expect(faker.pollQuestion()).resolves.toEqual(answering)
    }
  })

  it("preserves assistance, flags, and answers through the follow-up path", async () => {
    const faker = createPracticeFaker()
    const selection = {
      ...practiceSelectionFixture,
      targetRoleId: "target-role-id",
    }
    const questionHelp = practiceQuestionHelp.projectDeepDive
    const followUpFixture = practiceFollowUps.projectDeepDive!

    await faker.start(selection)
    await faker.pollQuestion()
    await faker.hint()
    await faker.framework()
    await faker.reference()
    await faker.save(true)
    await faker.weak(true)

    const assisted = await faker.get()
    if (assisted.status !== "answering") throw new Error("Expected an answering session.")
    expect(assisted.question).toMatchObject({
      hints: { status: "revealed", content: questionHelp.hints },
      framework: { status: "revealed", content: questionHelp.framework },
      referenceAnswer: {
        status: "revealed",
        content: questionHelp.reference,
        viewedBeforeSubmission: true,
      },
      isSaved: true,
      isWeak: true,
    })

    const followUp = await faker.answer("  Main answer  ")
    if (followUp.status !== "answeringFollowUp") {
      throw new Error("Expected a follow-up session.")
    }
    expect(followUp.mainAnswer).toEqual({ content: "Main answer" })
    expect(followUp.currentFollowUp).toEqual(followUpFixture.question)

    await faker.followHint()
    await faker.followFramework()
    await faker.followReference()
    const assistedFollowUp = await faker.get()
    if (assistedFollowUp.status !== "answeringFollowUp") {
      throw new Error("Expected a follow-up session.")
    }
    expect(assistedFollowUp.currentFollowUp).toMatchObject({
      hints: { status: "revealed", content: followUpFixture.hints },
      framework: { status: "revealed", content: followUpFixture.framework },
      referenceAnswer: {
        status: "revealed",
        content: followUpFixture.reference,
        viewedBeforeSubmission: true,
      },
    })

    const evaluating = await faker.answerFollowUp("  Follow-up answer  ")
    if (evaluating.status !== "evaluating") throw new Error("Expected evaluation.")
    expect(evaluating.followUps).toEqual([
      {
        question: assistedFollowUp.currentFollowUp,
        answer: { content: "Follow-up answer" },
      },
    ])
    expect(evaluating.followUpCompletion).toEqual({ status: "completed" })
  })

  it("supports both no-follow-up completion and ending a follow-up early", async () => {
    const motivationFaker = createPracticeFaker()
    await motivationFaker.start({
      ...practiceSelectionFixture,
      targetRoleId: "target-role-id",
      questionType: "motivation",
    })
    await motivationFaker.pollQuestion()

    const motivationResult = await motivationFaker.answer("  Motivation answer  ")
    if (motivationResult.status !== "evaluating") throw new Error("Expected evaluation.")
    expect(motivationResult).toMatchObject({
      mainAnswer: { content: "Motivation answer" },
      followUps: [],
      followUpCompletion: { status: "completed" },
    })

    const earlyEndFaker = createPracticeFaker()
    await earlyEndFaker.start({
      ...practiceSelectionFixture,
      targetRoleId: "target-role-id",
    })
    await earlyEndFaker.pollQuestion()
    const followUp = await earlyEndFaker.answer("Main answer")
    if (followUp.status !== "answeringFollowUp") {
      throw new Error("Expected a follow-up session.")
    }

    const earlyEndResult = await earlyEndFaker.endFollowUps()
    if (earlyEndResult.status !== "evaluating") throw new Error("Expected evaluation.")
    expect(earlyEndResult.followUps).toEqual([])
    expect(earlyEndResult.followUpCompletion).toEqual({
      status: "endedEarly",
      unanswered: followUp.currentFollowUp,
    })
  })

  it("reveals missing reference answers when evaluation reaches review", async () => {
    const faker = createPracticeFaker()
    await faker.start({ ...practiceSelectionFixture, targetRoleId: "target-role-id" })
    await faker.pollQuestion()
    await faker.answer("Main answer")
    await faker.answerFollowUp("Follow-up answer")

    const review = await faker.pollEvaluation()
    if (review.status !== "review") throw new Error("Expected review.")
    expect(review.evaluation).toEqual(practiceEvaluationFixture)
    expect(review.review).toEqual(practiceReviewFixture)
    expect(review.attemptNumber).toBe(1)
    expect(review.question.referenceAnswer).toEqual({
      status: "revealed",
      content: practiceQuestionHelp.projectDeepDive.reference,
      viewedBeforeSubmission: false,
    })
    expect(review.followUps[0]!.question.referenceAnswer).toEqual({
      status: "revealed",
      content: practiceFollowUps.projectDeepDive!.reference,
      viewedBeforeSubmission: false,
    })
    await expect(faker.pollEvaluation()).resolves.toEqual(review)

    const earlyEndFaker = createPracticeFaker()
    await earlyEndFaker.start({ ...practiceSelectionFixture, targetRoleId: "target-role-id" })
    await earlyEndFaker.pollQuestion()
    await earlyEndFaker.answer("Main answer")
    await earlyEndFaker.endFollowUps()
    const earlyEndReview = await earlyEndFaker.pollEvaluation()
    if (
      earlyEndReview.status !== "review" ||
      earlyEndReview.followUpCompletion.status !== "endedEarly"
    ) {
      throw new Error("Expected an early-ended follow-up review.")
    }
    expect(earlyEndReview.followUpCompletion.unanswered.referenceAnswer).toEqual({
      status: "revealed",
      content: practiceFollowUps.projectDeepDive!.reference,
      viewedBeforeSubmission: false,
    })
  })

  it("retries the same question without counting the discarded score", async () => {
    const faker = createPracticeFaker()
    await faker.start({
      ...practiceSelectionFixture,
      targetRoleId: "target-role-id",
      questionType: "motivation",
    })
    await faker.pollQuestion()
    await faker.answer("First answer")
    const firstReview = await faker.pollEvaluation()
    if (firstReview.status !== "review") throw new Error("Expected review.")

    const retry = await faker.retryQuestion()
    if (retry.status !== "answering") throw new Error("Expected answering.")
    expect(retry.question.id).toBe(firstReview.question.id)
    expect(retry.question.referenceAnswer).toMatchObject({
      status: "revealed",
      viewedBeforeSubmission: true,
    })

    await faker.answer("Final answer")
    const finalReview = await faker.pollEvaluation()
    if (finalReview.status !== "review") throw new Error("Expected review.")
    expect(finalReview.attemptNumber).toBe(2)

    const completed = await faker.endSession()
    expect(completed).toMatchObject({
      status: "completed",
      questionsCompleted: 1,
      retryCount: 1,
      finalAttemptAverageScore: practiceEvaluationFixture.overallScore,
    })
  })

  it("alternates fixed questions on skip and after review without changing selection", async () => {
    const faker = createPracticeFaker()
    const selection = {
      ...practiceSelectionFixture,
      targetRoleId: "target-role-id",
      difficulty: "pressure" as const,
    }
    await faker.start(selection)
    const primary = await faker.pollQuestion()
    if (primary.status !== "answering") throw new Error("Expected answering.")

    const skipped = await faker.skipQuestion()
    if (skipped.status !== "generatingQuestion") throw new Error("Expected generation.")
    expect(skipped.selection).toEqual(selection)
    expect(skipped.pendingQuestion).toMatchObject({
      ...practiceQuestionAlternates.projectDeepDive,
      difficulty: selection.difficulty,
    })
    const alternate = await faker.pollQuestion()
    if (alternate.status !== "answering") throw new Error("Expected answering.")

    await faker.answer("Main answer")
    await faker.answerFollowUp("Follow-up answer")
    await faker.pollEvaluation()
    const next = await faker.nextQuestion()
    if (next.status !== "generatingQuestion") throw new Error("Expected generation.")
    expect(next.selection).toEqual(selection)
    expect(next.pendingQuestion.id).toBe(primary.question.id)

    const nextAnswering = await faker.pollQuestion()
    if (nextAnswering.status !== "answering") throw new Error("Expected answering.")
    expect(nextAnswering.selection).toEqual(selection)
    expect(nextAnswering.question.difficulty).toBe(selection.difficulty)
  })

  it("completes with summaries and resets progress for the next session", async () => {
    const faker = createPracticeFaker()
    const selection = {
      ...practiceSelectionFixture,
      targetRoleId: "target-role-id",
      questionType: "motivation" as const,
    }
    const firstSession = await faker.start(selection)
    await faker.pollQuestion()
    await faker.answer("Answer")
    await faker.pollEvaluation()
    await faker.save(true)
    await faker.weak(true)

    const completed = await faker.endSession()
    expect(completed).toMatchObject({
      status: "completed",
      completionReason: "reviewCompleted",
      questionsCompleted: 1,
      retryCount: 0,
      savedQuestionCount: 1,
      weakQuestionCount: 1,
      finalAttemptAverageScore: practiceEvaluationFixture.overallScore,
    })

    const setup = await faker.nextSession()
    expect(setup).toEqual({ status: "setup", selection })
    const secondSession = await faker.start(selection)
    expect(secondSession.sessionId).not.toBe(firstSession.sessionId)
    await faker.pollQuestion()

    const endedEarly = await faker.endSession()
    expect(endedEarly).toMatchObject({
      status: "completed",
      completionReason: "userEndedEarly",
      questionsCompleted: 0,
      retryCount: 0,
      savedQuestionCount: 0,
      weakQuestionCount: 0,
      finalAttemptAverageScore: 0,
    })
  })
})
