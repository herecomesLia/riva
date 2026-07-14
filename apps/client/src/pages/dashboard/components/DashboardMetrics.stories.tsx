import preview from "#storybook/preview"

import { dashboardResponseMock } from "@/mocks/data/dashboard"
import type { DashboardResponse } from "@/models/dashboard"

import { DashboardMetrics } from "./DashboardMetrics"

const emptyMetrics = {
  mockInterviewScore: { currentValue: null, previousValue: null },
  practiceTimeMinutes: { currentValue: null, previousValue: null },
  roleFit: { currentValue: null, previousValue: null },
  targetedPracticeScore: { currentValue: null, previousValue: null },
} satisfies DashboardResponse["metrics"]

const mixedMetrics = {
  ...dashboardResponseMock.metrics,
  mockInterviewScore: { currentValue: 7.4, previousValue: null },
  practiceTimeMinutes: { currentValue: 45, previousValue: 49 },
  roleFit: { currentValue: 76, previousValue: 65.8 },
  targetedPracticeScore: { currentValue: 7.5, previousValue: 7.5 },
} satisfies DashboardResponse["metrics"]

const meta = preview.meta({
  component: DashboardMetrics,
  title: "Pages/Dashboard/DashboardMetrics",
})

export const Default = meta.story({
  args: {
    state: { data: dashboardResponseMock.metrics, status: "ready" },
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
