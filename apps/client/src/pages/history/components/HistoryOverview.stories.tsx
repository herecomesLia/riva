import preview from "#storybook/preview"

import {
  emptyHistoryOverviewStoryFixture,
  historyOverviewStoryFixture,
} from "../stories/history-story-fixtures"
import { HistoryOverview } from "./HistoryOverview"

const meta = preview.meta({
  component: HistoryOverview,
  title: "History/HistoryOverview",
})

export const Default = meta.story({
  args: {
    state: { status: "ready", data: historyOverviewStoryFixture },
  },
})

export const Loading = meta.story({
  args: {
    state: { status: "loading" },
  },
})

export const Empty = meta.story({
  args: {
    state: { status: "ready", data: emptyHistoryOverviewStoryFixture },
  },
})
