import preview from "#storybook/preview"
import { expect } from "storybook/test"

import { createPracticeReviewStoryFixture } from "../stories/practice-story-fixtures"
import { PracticeReviewSummary } from "./PracticeReviewDetails"

function createArgs(variant: Parameters<typeof createPracticeReviewStoryFixture>[0]) {
  return { review: createPracticeReviewStoryFixture(variant).review }
}

const meta = preview.meta({
  component: PracticeReviewSummary,
  title: "Practice/PracticeReviewSummary",
})

export const Default = meta.story({
  args: createArgs("balanced"),
})

export const EmptySections = meta.story({
  args: createArgs("emptyDetails"),
  play: async ({ canvas }) => {
    await expect(canvas.getByTestId("practice-review-summary").querySelectorAll("li")).toHaveLength(
      0,
    )
  },
})

export const LongSections = meta.story({
  args: createArgs("longDetails"),
})

export const LongSectionsInEnglish = meta.story({
  args: createArgs("longDetails"),
  globals: { locale: "en" },
})
