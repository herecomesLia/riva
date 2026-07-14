import preview from "#storybook/preview"

import { dashboardResponseMock } from "@/mocks/data/dashboard"
import type { DashboardResponse } from "@/models/dashboard"

import { PerformanceTrendCard } from "./PerformanceTrendCard"

const emptyPerformanceTrend = {
  mockInterview: [],
  targetedPractice: [],
} satisfies DashboardResponse["performanceTrend"]

const singleRecordTrend = {
  mockInterview: [],
  targetedPractice: [dashboardResponseMock.performanceTrend.targetedPractice[0]],
} satisfies DashboardResponse["performanceTrend"]

const meta = preview.meta({
  component: PerformanceTrendCard,
  title: "Pages/Dashboard/PerformanceTrendCard",
})

export const Default = meta.story({
  args: {
    state: { data: dashboardResponseMock.performanceTrend, status: "ready" },
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
