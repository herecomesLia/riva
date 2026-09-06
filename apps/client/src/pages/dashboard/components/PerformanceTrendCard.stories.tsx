import preview from "#storybook/preview"

import { dashboardStoryFixture } from "../stories/dashboard-story-fixtures"
import type { DashboardResponse } from "@/models/dashboard"

import { PerformanceTrendCard } from "./PerformanceTrendCard"

const emptyPerformanceTrend = {
  mockInterview: [],
  targetedPractice: [],
} satisfies DashboardResponse["performanceTrend"]

const singleRecordTrend = {
  mockInterview: [],
  targetedPractice: [dashboardStoryFixture.performanceTrend.targetedPractice[0]],
} satisfies DashboardResponse["performanceTrend"]

const meta = preview.meta({
  component: PerformanceTrendCard,
  title: "Dashboard/PerformanceTrendCard",
})

export const Default = meta.story({
  args: {
    state: { data: dashboardStoryFixture.performanceTrend, status: "ready" },
  },
})

export const Loading = meta.story({
  args: {
    state: { status: "loading" },
  },
})

export const Empty = meta.story({
  args: {
    state: { data: emptyPerformanceTrend, status: "ready" },
  },
})

export const SingleRecord = meta.story({
  args: {
    state: { data: singleRecordTrend, status: "ready" },
  },
})
