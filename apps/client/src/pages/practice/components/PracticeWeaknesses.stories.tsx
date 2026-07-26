import preview from "#storybook/preview"
import { expect } from "storybook/test"

import { createPracticeReviewStoryFixture } from "../stories/practice-story-fixtures"
import { PracticeWeaknesses } from "./PracticeReviewDetails"

function createArgs(variant: Parameters<typeof createPracticeReviewStoryFixture>[0]) {
  return { items: createPracticeReviewStoryFixture(variant).review.exposedWeaknesses }
}

const meta = preview.meta({
  component: PracticeWeaknesses,
  title: "Practice/PracticeWeaknesses",
})

export const Default = meta.story({
  args: createArgs("balanced"),
})

export const NoNewWeaknesses = meta.story({
  args: createArgs("emptyDetails"),
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/本题没有识别出新的薄弱项|no new weak areas/i)).toBeVisible()
  },
})

export const LongWeaknesses = meta.story({
  args: createArgs("longDetails"),
})

export const LongWeaknessesInEnglish = meta.story({
  args: createArgs("longDetails"),
  globals: { locale: "en" },
})
