import preview from "#storybook/preview"
import { fn } from "storybook/test"

import { historyOverviewStoryFixture } from "../stories/history-story-fixtures"
import { HistoryFilters } from "./HistoryFilters"

const meta = preview.meta({
  component: HistoryFilters,
  title: "History/HistoryFilters",
})

export const Default = meta.story({
  args: {
    filters: {
      kind: "all",
      roleId: "all",
      timeRange: "all",
    },
    loading: false,
    onChange: fn(),
    roles: historyOverviewStoryFixture.roles,
  },
})

export const Loading = meta.story({
  args: {
    ...Default.input.args,
    loading: true,
    roles: [],
  },
})
