import preview from "#storybook/preview"
import { fn } from "storybook/test"

import { withRouter } from "#storybook/decorators/with-router"

import {
  emptyHistoryRecordsStoryFixture,
  historyRecordsStoryFixture,
} from "../stories/history-story-fixtures"
import { defaultHistorySearch } from "../history-navigation"
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

const longTextRecordsStoryFixture = structuredClone(historyRecordsStoryFixture)
longTextRecordsStoryFixture.items[0].targetRole.title =
  "负责全球多区域复杂交易、风控与合规平台的高级产品架构负责人"
longTextRecordsStoryFixture.items[0].targetRole.company =
  "一家名称很长、覆盖多个国家和业务板块的金融科技集团"
longTextRecordsStoryFixture.items[0].reviewSummary =
  "回答覆盖了背景、关键约束、跨团队决策过程和结果，但复盘信息较长，需要在窄屏下自然换行，并确保查看详情入口和统计信息不会被挤出可视区域。"

export const Default = meta.story({
  args: {
    loading: false,
    onClearFilters: fn(),
    onPageChange: fn(),
    page: historyRecordsStoryFixture,
    search: defaultHistorySearch,
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

export const LongText = meta.story({
  args: {
    ...Default.input.args,
    page: longTextRecordsStoryFixture,
  },
})
