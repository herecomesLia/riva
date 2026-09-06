import preview from "#storybook/preview"

import { dashboardStoryFixture } from "../stories/dashboard-story-fixtures"
import type { DashboardResponse } from "@/models/dashboard"

import { DashboardMetrics } from "./DashboardMetrics"

const emptyMetrics = {
  mockInterviewScore: { currentValue: null, previousValue: null },
  practiceTimeMinutes: { currentValue: null, previousValue: null },
  roleFit: { currentValue: null, previousValue: null },
  targetedPracticeScore: { currentValue: null, previousValue: null },
} satisfies DashboardResponse["metrics"]

const mixedMetrics = {
  ...dashboardStoryFixture.metrics,
  mockInterviewScore: { currentValue: 74, previousValue: null },
  practiceTimeMinutes: { currentValue: 45, previousValue: 49 },
  roleFit: { currentValue: 76, previousValue: 65.8 },
  targetedPracticeScore: { currentValue: 75, previousValue: 75 },
} satisfies DashboardResponse["metrics"]

const meta = preview.meta({
  component: DashboardMetrics,
  title: "Dashboard/DashboardMetrics",
})

export const Default = meta.story({
  args: {
    state: { data: dashboardStoryFixture.metrics, status: "ready" },
  },
})

export const Loading = meta.story({
  args: {
    state: { status: "loading" },
  },
})

export const Empty = meta.story({
  args: {
    state: { data: emptyMetrics, status: "ready" },
  },
})

export const Mixed = meta.story({
  args: {
    state: { data: mixedMetrics, status: "ready" },
  },
})
