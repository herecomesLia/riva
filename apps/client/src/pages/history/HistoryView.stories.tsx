import preview from "#storybook/preview"
import { expect, fn } from "storybook/test"

import { withRouter } from "#storybook/decorators/with-router"

import { HistoryView } from "./HistoryView"
import {
  emptyHistoryOverviewStoryFixture,
  emptyHistoryRecordsStoryFixture,
  historyOverviewStoryFixture,
  historyRecordsStoryFixture,
} from "./stories/history-story-fixtures"

const defaultFilters = {
  kind: "all",
  targetRoleId: "all",
  timeRange: "all",
} as const

const meta = preview.meta({
  component: HistoryView,
  decorators: [withRouter],
  parameters: {
    router: {
      initialEntries: ["/history"],
    },
  },
  title: "Pages/History",
})

export const Default = meta.story({
  args: {
    filters: defaultFilters,
    onClearFilters: fn(),
    onFiltersChange: fn(),
    onPageChange: fn(),
    onRetry: fn(),
    state: {
      status: "ready",
      data: {
        overview: historyOverviewStoryFixture,
        records: historyRecordsStoryFixture,
      },
    },
  },
})

export const Loading = meta.story({
  args: {
    ...Default.input.args,
    state: { status: "loading" },
  },
})

export const Empty = meta.story({
  args: {
    ...Default.input.args,
    state: {
      status: "empty",
      reason: "neverTrained",
      data: {
        overview: emptyHistoryOverviewStoryFixture,
        records: emptyHistoryRecordsStoryFixture,
      },
    },
  },
})

const onClearFilters = fn()

export const FilteredEmpty = meta.story({
  args: {
    ...Default.input.args,
    filters: {
      kind: "mockInterview",
      targetRoleId: "role_product_manager_fintech",
      timeRange: "last7Days",
    },
    onClearFilters,
    state: {
      status: "empty",
      reason: "noMatches",
      data: {
        overview: historyOverviewStoryFixture,
        records: emptyHistoryRecordsStoryFixture,
      },
    },
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: /清除筛选|clear filters/i }))
    await expect(onClearFilters).toHaveBeenCalledTimes(1)
  },
})

const onRetry = fn()

export const Error = meta.story({
  args: {
    ...Default.input.args,
    onRetry,
    state: { status: "error" },
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: /重新加载|reload/i }))
    await expect(onRetry).toHaveBeenCalledTimes(1)
  },
})
