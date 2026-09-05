import { describe, expect, it } from "vitest"

import { createPracticeFaker } from "@/mocks/fakers/practice"
import {
  practiceFollowUps,
  practiceQuestionHelp,
  practiceQuestions,
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
})
