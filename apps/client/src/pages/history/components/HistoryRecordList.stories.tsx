import preview from "#storybook/preview"
import { fn } from "storybook/test"

import { withRouter } from "#storybook/decorators/with-router"

import {
  emptyHistoryRecordsStoryFixture,
  historyRecordsStoryFixture,
} from "../stories/history-story-fixtures"
import { HistoryRecordList } from "./HistoryRecordList"

const meta = preview.meta({
  component: HistoryRecordList,
  decorators: [withRouter],
  parameters: {
    router: {
      initialEntries: ["/history"],
    },
  },
  title: "History/HistoryRecordList",
})

export const Default = meta.story({
  args: {
    loading: false,
    onClearFilters: fn(),
    onPageChange: fn(),
    page: historyRecordsStoryFixture,
  },
})

export const Loading = meta.story({
  args: {
    ...Default.input.args,
    loading: true,
    page: null,
  },
})

export const NeverTrained = meta.story({
  args: {
    ...Default.input.args,
    emptyReason: "neverTrained",
    page: emptyHistoryRecordsStoryFixture,
  },
})

export const FilteredEmpty = meta.story({
  args: {
    ...Default.input.args,
    emptyReason: "noMatches",
    page: emptyHistoryRecordsStoryFixture,
  },
})
