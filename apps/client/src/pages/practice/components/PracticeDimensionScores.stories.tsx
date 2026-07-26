import preview from "#storybook/preview"
import { expect } from "storybook/test"

import { createPracticeReviewStoryFixture } from "../stories/practice-story-fixtures"
import { PracticeDimensionScores } from "./PracticeDimensionScores"

function createArgs(variant: Parameters<typeof createPracticeReviewStoryFixture>[0]) {
  return { scores: createPracticeReviewStoryFixture(variant).evaluation.dimensionScores }
}

const meta = preview.meta({
  component: PracticeDimensionScores,
  title: "Practice/PracticeDimensionScores",
})

export const AllDimensions = meta.story({
  args: createArgs("balanced"),
  play: async ({ canvas }) => {
    await expect(
      canvas.getByTestId("practice-dimension-scores").querySelectorAll("dd"),
    ).toHaveLength(8)
  },
})

export const FewerDimensions = meta.story({
  args: createArgs("fewDimensions"),
  play: async ({ canvas }) => {
    await expect(
      canvas.getByTestId("practice-dimension-scores").querySelectorAll("dd"),
    ).toHaveLength(3)
  },
})

export const LongExplanations = meta.story({
  args: createArgs("longDimensions"),
})

export const LongExplanationsInEnglish = meta.story({
  args: createArgs("longDimensions"),
  globals: { locale: "en" },
})
