import { describe, expect, it } from "vitest"

import { createInterviewFaker } from "@/mocks/fakers/interview"
import { interviewFixture } from "@/mocks/fixtures/interview"
import type { InterviewConfiguration } from "@/models/interview-workflow"

const configuration: InterviewConfiguration = {
  targetRoleId: "selected-role",
  round: "manager",
  difficulty: "basic",
  durationMinutes: 15,
}

describe("interviewFaker", () => {
  it("starts with the selected configuration and fixed opening data", () => {
    const faker = createInterviewFaker()
    expect(faker.get()).toBeNull()

    const opening = faker.start(configuration)
    expect(opening).toMatchObject({
      status: "opening",
      configuration,
      openingMessage: interviewFixture.openingMessage,
      progress: interviewFixture.progress,
    })
    expect(faker.get()).toEqual(opening)
  })

  it("begins the fixed question once and preserves the configuration", () => {
    const faker = createInterviewFaker()
    faker.start(configuration)

    const question = faker.begin()
    expect(question).toMatchObject({
      status: "question",
      configuration,
      progress: interviewFixture.progress,
      prompt: interviewFixture.question,
      history: [],
    })
    expect(faker.begin()).toEqual(question)
    expect(faker.get()).toEqual(question)
  })

  it("keeps the main answer in history and opens the fixed follow-up", () => {
    const faker = createInterviewFaker()
    faker.start(configuration)
    faker.begin()

    expect(faker.answer("  用户主回答  ")).toMatchObject({
      status: "followUp",
      configuration,
      progress: { ...interviewFixture.progress, completedMainQuestions: 0 },
      history: [
        {
          kind: "question",
          questionOrder: interviewFixture.question.questionOrder,
          prompt: interviewFixture.question.content,
          answer: "  用户主回答  ",
        },
      ],
      prompt: interviewFixture.followUp,
    })
  })

  it("finishes the follow-up and appends candidate questions with fixed feedback", () => {
    const faker = createInterviewFaker()
    faker.start(configuration)
    faker.begin()
    faker.answer("用户主回答")

    expect(faker.answer("  用户追问回答  ")).toMatchObject({
      status: "candidateQuestions",
      configuration,
      progress: { ...interviewFixture.progress, completedMainQuestions: 1 },
      history: [
        {
          kind: "question",
          questionOrder: interviewFixture.question.questionOrder,
          prompt: interviewFixture.question.content,
          answer: "用户主回答",
        },
        {
          kind: "followUp",
          questionOrder: interviewFixture.followUp.questionOrder,
          prompt: interviewFixture.followUp.content,
          answer: "  用户追问回答  ",
        },
      ],
      prompt: interviewFixture.candidate.prompt,
      exchanges: [],
    })

    const firstExchange = {
      question: "  我想了解团队协作方式  ",
      interviewerAnswer: interviewFixture.candidate.interviewerAnswer,
      feedback: interviewFixture.candidate.feedback,
    }
    expect(faker.ask(firstExchange.question)).toMatchObject({
      status: "candidateQuestions",
      exchanges: [firstExchange],
    })
    const next = faker.ask("入职后的成功标准是什么？")
    expect(next).toMatchObject({
      status: "candidateQuestions",
      exchanges: [firstExchange, { ...firstExchange, question: "入职后的成功标准是什么？" }],
    })
    expect(faker.get()).toEqual(next)
  })
})
