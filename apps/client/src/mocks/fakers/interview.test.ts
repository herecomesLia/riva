import { describe, expect, it } from "vitest"

import { createInterviewFaker } from "@/mocks/fakers/interview"
import { interviewFixture } from "@/mocks/fixtures/interview"
import type { InterviewConfiguration } from "@/models/interview-workflow"

const configuration: InterviewConfiguration = {
  roleId: "selected-role",
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

  it("finishes with conversation history and returns fixed review data with the user's answers", () => {
    const faker = createInterviewFaker()
    const opening = faker.start(configuration)
    faker.begin()
    faker.answer("我通过灰度实验验证方案。")
    const candidate = faker.answer("我对比了实验组与对照组，并检查同期变化。")
    if (candidate?.status !== "candidateQuestions") throw new Error("Expected candidate questions.")
    faker.ask("团队如何协作？")

    expect(faker.finish()).toEqual({
      status: "completed",
      sessionId: opening!.sessionId,
      history: candidate.history,
    })
    const review = faker.getReview()
    expect(review).toMatchObject({
      status: "complete",
      review: interviewFixture.review.review,
    })
    expect(review?.questionDetails).toEqual([
      {
        ...interviewFixture.review.questionDetails[0],
        answer: "我通过灰度实验验证方案。",
        followUps: [
          {
            ...interviewFixture.review.questionDetails[0]!.followUps[0],
            answer: "我对比了实验组与对照组，并检查同期变化。",
          },
        ],
      },
    ])
  })

  it("allows early completion and immediately returns the complete review sample", () => {
    const faker = createInterviewFaker()
    faker.start(configuration)
    faker.begin()

    expect(faker.end()).toMatchObject({ status: "completed" })
    expect(faker.getReview()).toEqual(interviewFixture.review)
  })
})
