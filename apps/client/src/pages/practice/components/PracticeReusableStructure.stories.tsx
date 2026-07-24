import preview from "#storybook/preview"
import { expect } from "storybook/test"

import { createPracticeReviewStoryFixture } from "../stories/practice-story-fixtures"
import { PracticeReusableStructure } from "./PracticeReviewDetails"

function createArgs(variant: Parameters<typeof createPracticeReviewStoryFixture>[0]) {
  return {
    items: createPracticeReviewStoryFixture(variant).review.reusableAnswerStructure,
  }
}

const meta = preview.meta({
  component: PracticeReusableStructure,
  title: "Practice/PracticeReusableStructure",
})

export const Default = meta.story({
  args: createArgs("balanced"),
})

export const Empty = meta.story({
  args: createArgs("emptyDetails"),
  play: async ({ canvas }) => {
    await expect(
      canvas.getByTestId("practice-reusable-structure").querySelectorAll("li"),
    ).toHaveLength(0)
  },
})

export const LongSteps = meta.story({
  args: createArgs("longDetails"),
})

export const LongStepsInEnglish = meta.story({
  args: createArgs("longDetails"),
  globals: { locale: "en" },
})
