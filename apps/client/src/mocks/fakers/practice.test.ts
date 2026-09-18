import { describe, expect, it } from "vitest"

import { createPracticeFaker } from "@/mocks/fakers/practice"
import { practiceFixture } from "@/mocks/fixtures/practice"
import type { ActiveSelection } from "@/models/practice-workflow"

const selection: ActiveSelection = {
  ...practiceFixture.selection,
  roleId: "role-id",
  questionType: "motivation",
  difficulty: "hard",
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
    const answering = await faker.pollTask()
    expect(answering).toMatchObject({
      status: "answering",
      selection,
      question: practiceFixture.question,
    })
    await expect(faker.get()).resolves.toEqual(answering)
  })

  it("preserves complete question content, answers through review", async () => {
    const faker = createPracticeFaker()
    await faker.start(selection)
    await faker.pollTask()
    expect(await faker.answer("  Main answer  ")).toMatchObject({
      status: "processing",
      mainAnswer: { content: "Main answer" },
    })
    expect(await faker.pollTask()).toMatchObject({
      status: "answeringFollowUp",
      currentFollowUp: practiceFixture.followUp.question,
    })
    await faker.answerFollowUp("  Follow-up answer  ")
    expect(await faker.pollTask()).toMatchObject({
      status: "review",
      question: { ...practiceFixture.question },
      mainAnswer: { content: "Main answer" },
      followUps: [
        { question: practiceFixture.followUp.question, answer: { content: "Follow-up answer" } },
      ],
      evaluation: practiceFixture.evaluation,
      review: practiceFixture.review,
    })
    await faker.nextQuestion()
    await faker.pollTask()
    await faker.answer("Another answer")
    await faker.pollTask()
    await faker.endFollowUps()
    expect(await faker.pollTask()).toMatchObject({
      status: "review",
      question: practiceFixture.question,
    })
  })

  it("supports skip, retry and next with fixed review data", async () => {
    const faker = createPracticeFaker()
    await faker.start(selection)
    await faker.pollTask()
    expect(await faker.skipQuestion()).toMatchObject({ status: "generatingQuestion", selection })
    await faker.pollTask()
    await faker.answer("First answer")
    await faker.pollTask()
    await faker.answerFollowUp("First follow-up")
    expect(await faker.pollTask()).toMatchObject({
      status: "review",
      followUps: [
        { question: practiceFixture.followUp.question, answer: { content: "First follow-up" } },
      ],
    })
    expect(await faker.retryQuestion()).toMatchObject({
      status: "answering",
      question: practiceFixture.question,
    })
    await faker.answer("Retry answer")
    await faker.pollTask()
    await faker.answerFollowUp("Retry follow-up")
    expect(await faker.pollTask()).toMatchObject({
      status: "review",
    })
    expect(await faker.nextQuestion()).toMatchObject({ status: "generatingQuestion", selection })
    await faker.pollTask()
    await faker.answer("Next answer")
    await faker.pollTask()
    await faker.answerFollowUp("Next follow-up")
    expect(await faker.pollTask()).toMatchObject({
      status: "review",
    })
  })

  it("provides completion samples and preserves selection for the next session", async () => {
    const faker = createPracticeFaker()
    await faker.start(selection)
    await faker.pollTask()
    await faker.answer("Answer")
    await faker.pollTask()
    await faker.answerFollowUp("Follow-up")
    await faker.pollTask()
    expect(await faker.endSession()).toMatchObject({
      status: "completed",
      ...practiceFixture.completion,
    })
    expect(await faker.nextSession()).toEqual({ status: "setup", selection })
    await faker.start(selection)
    await faker.pollTask()
    expect(await faker.endSession()).toMatchObject({
      status: "answering",
    })
  })
})
