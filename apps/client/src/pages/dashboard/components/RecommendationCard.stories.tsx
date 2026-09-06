import preview from "#storybook/preview"

import { dashboardStoryFixture } from "../stories/dashboard-story-fixtures"

import { withRouter } from "#storybook/decorators/with-router"
import { RecommendationCard } from "./RecommendationCard"

const meta = preview.meta({
  component: RecommendationCard,
  decorators: [withRouter],
  parameters: {
    router: {
      initialEntries: ["/dashboard"],
    },
  },
  title: "Dashboard/RecommendationCard",
})

export const Default = meta.story({
  args: {
    state: { data: dashboardStoryFixture.recommendation!, status: "ready" },
  },
})

export const Loading = meta.story({
  args: {
    state: { status: "loading" },
  },
})

export const Empty = meta.story({
  args: {
    state: { data: null, status: "ready" },
  },
})
