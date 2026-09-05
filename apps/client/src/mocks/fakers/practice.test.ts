import { describe, expect, it } from "vitest"

import { createPracticeFaker } from "@/mocks/fakers/practice"
import { practiceFixture } from "@/mocks/fixtures/practice"
import type { ActiveSelection } from "@/models/practice-workflow"

const selection: ActiveSelection = {
  ...practiceFixture.selection,
  targetRoleId: "target-role-id",
  questionType: "motivation",
  difficulty: "pressure",
  source: "history",
  prioritizeWeaknesses: true,
}

describe("practiceFaker", () => {
  it("preserves selection from setup through generation of the fixed question", async () => {
    const faker = createPracticeFaker()
    await expect(faker.get()).resolves.toEqual({
      status: "setup",
      selection: practiceFixture.selection,
    })
    const generating = await faker.start(selection)
    expect(generating).toMatchObject({ status: "generatingQuestion", selection })
    await expect(faker.get()).resolves.toEqual(generating)
    const answering = await faker.pollQuestion()
    expect(answering).toMatchObject({
      status: "answering",
      assistedRetry: false,
      selection,
      question: practiceFixture.question,
    })
    await expect(faker.get()).resolves.toEqual(answering)
  })

  it("preserves assistance, answers, flags and reference visibility through review", async () => {
    const faker = createPracticeFaker()
    await faker.start(selection)
    await faker.pollQuestion()
    await faker.hint()
    await faker.framework()
    await faker.reference()
    await faker.save(true)
    await faker.weak(true)
    expect(await faker.answer("  Main answer  ")).toMatchObject({
      status: "answeringFollowUp",
      currentFollowUp: practiceFixture.followUp.question,
    })
    await faker.followHint()
    await faker.followFramework()
    await faker.followReference()
    expect(await faker.answerFollowUp("  Follow-up answer  ")).toMatchObject({
      status: "evaluating",
    })
    const review = await faker.pollEvaluation()
    expect(review).toMatchObject({
      status: "review",
      evaluation: practiceFixture.evaluation,
      review: practiceFixture.review,
      mainAnswer: { content: "Main answer" },
      question: {
        isSaved: true,
        isWeak: true,
        hints: { status: "revealed", content: practiceFixture.questionHelp.hints },
        framework: { status: "revealed", content: practiceFixture.questionHelp.framework },
        referenceAnswer: {
          status: "revealed",
          content: practiceFixture.questionHelp.reference,
          viewedBeforeSubmission: true,
        },
      },
      followUps: [
        {
          answer: { content: "Follow-up answer" },
          question: {
            hints: { status: "revealed", content: practiceFixture.followUp.hints },
            framework: { status: "revealed", content: practiceFixture.followUp.framework },
            referenceAnswer: {
              status: "revealed",
              content: practiceFixture.followUp.reference,
              viewedBeforeSubmission: true,
            },
          },
        },
      ],
    })

    await faker.nextQuestion()
    await faker.pollQuestion()
    await faker.answer("Another answer")
    await faker.endFollowUps()
    expect(await faker.pollEvaluation()).toMatchObject({
      status: "review",
      question: { referenceAnswer: { status: "revealed", viewedBeforeSubmission: false } },
      followUpCompletion: {
        status: "endedEarly",
        unanswered: {
          referenceAnswer: {
            status: "revealed",
            content: practiceFixture.followUp.reference,
            viewedBeforeSubmission: false,
          },
        },
      },
    })
  })

  it("supports skip, retry and next with fixed review data", async () => {
    const faker = createPracticeFaker()
    await faker.start(selection)
    await faker.pollQuestion()
    expect(await faker.skipQuestion()).toMatchObject({ status: "generatingQuestion", selection })
    await faker.pollQuestion()
    await faker.answer("First answer")
    await faker.answerFollowUp("First follow-up")
    expect(await faker.pollEvaluation()).toMatchObject({
      status: "review",
      attemptNumber: 1,
      followUps: [
        {
          question: { referenceAnswer: { status: "revealed", viewedBeforeSubmission: false } },
        },
      ],
    })
    expect(await faker.retryQuestion()).toMatchObject({
      status: "answering",
      assistedRetry: true,
      question: {
        referenceAnswer: { status: "revealed", viewedBeforeSubmission: true },
      },
    })
    await faker.answer("Retry answer")
    await faker.answerFollowUp("Retry follow-up")
    expect(await faker.pollEvaluation()).toMatchObject({
      status: "review",
      attemptNumber: practiceFixture.attemptNumber,
    })
    expect(await faker.nextQuestion()).toMatchObject({ status: "generatingQuestion", selection })
    await faker.pollQuestion()
    await faker.answer("Next answer")
    await faker.answerFollowUp("Next follow-up")
    expect(await faker.pollEvaluation()).toMatchObject({
      status: "review",
      attemptNumber: practiceFixture.attemptNumber,
    })
  })

  it("provides completion samples and preserves selection for the next session", async () => {
    const faker = createPracticeFaker()
    await faker.start(selection)
    await faker.pollQuestion()
    await faker.answer("Answer")
    await faker.answerFollowUp("Follow-up")
    await faker.pollEvaluation()
    await faker.save(true)
    await faker.weak(true)
    expect(await faker.endSession()).toMatchObject({
      status: "completed",
      ...practiceFixture.completion,
    })
    expect(await faker.nextSession()).toEqual({ status: "setup", selection })
    await faker.start(selection)
    await faker.pollQuestion()
    expect(await faker.endSession()).toMatchObject({
      status: "completed",
      ...practiceFixture.completion,
    })
  })
})
