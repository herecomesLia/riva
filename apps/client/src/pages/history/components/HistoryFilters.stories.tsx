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
      targetRoleId: "all",
      timeRange: "all",
    },
    loading: false,
    onChange: fn(),
    targetRoles: historyOverviewStoryFixture.targetRoles,
  },
})

export const Loading = meta.story({
  args: {
    ...Default.input.args,
    loading: true,
    targetRoles: [],
  },
})
