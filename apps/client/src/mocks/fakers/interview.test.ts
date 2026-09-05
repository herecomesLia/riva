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
})
