import preview from "#storybook/preview"
import { expect } from "storybook/test"

import { createPracticeReviewStoryFixture } from "../stories/practice-story-fixtures"
import { PracticeRecommendationCard } from "./PracticeRecommendationCard"

function createArgs(variant: Parameters<typeof createPracticeReviewStoryFixture>[0]) {
  return { recommendation: createPracticeReviewStoryFixture(variant).review.recommendation }
}

const meta = preview.meta({
  component: PracticeRecommendationCard,
  title: "Practice/PracticeRecommendationCard",
})

export const RetryCurrent = meta.story({
  args: createArgs("retryRecommendation"),
  play: async ({ canvas }) => {
    await expect(canvas.getByTestId("practice-recommendation")).toHaveTextContent(
      /建议重练当前题|retry the current question/i,
    )
  },
})

export const NextQuestion = meta.story({
  args: createArgs("nextRecommendation"),
  play: async ({ canvas }) => {
    await expect(canvas.getByTestId("practice-recommendation")).toHaveTextContent(
      /下一题推荐|next-question recommendation/i,
    )
  },
})

export const LongFocusAreas = meta.story({
  args: createArgs("longFocusAreas"),
})

export const LongFocusAreasInEnglish = meta.story({
  args: createArgs("longFocusAreas"),
  globals: {
    locale: "en",
    viewport: { isRotated: false, value: "mobile1" },
  },
})
