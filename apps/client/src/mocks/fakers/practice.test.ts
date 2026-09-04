import { describe, expect, it } from "vitest"

import { createPracticeFaker } from "@/mocks/fakers/practice"
import {
  practiceQuestionFixture,
  practiceSelectionFixture,
  practiceSetupFixture,
} from "@/mocks/fixtures/practice"

describe("practiceFaker", () => {
  it("advances from setup to a fixed question on the first poll", async () => {
    const faker = createPracticeFaker()
    const selection = {
      ...practiceSelectionFixture,
      targetRoleId: "target-role-id",
      questionType: "behavioral" as const,
      difficulty: "pressure" as const,
    }

    await expect(faker.get()).resolves.toEqual(practiceSetupFixture)

    const generating = await faker.start(selection)
    expect(generating).toMatchObject({ status: "generatingQuestion", selection })
    await expect(faker.get()).resolves.toEqual(generating)

    const answering = await faker.pollQuestion()
    if (answering.status !== "answering") throw new Error("Expected an answering session.")
    expect(answering).toEqual({
      status: "answering",
      sessionId: generating.sessionId,
      selection,
      question: {
        ...practiceQuestionFixture,
        questionType: selection.questionType,
        difficulty: selection.difficulty,
      },
    })
    await expect(faker.get()).resolves.toEqual(answering)
    await expect(faker.pollQuestion()).resolves.toEqual(answering)
  })
})
