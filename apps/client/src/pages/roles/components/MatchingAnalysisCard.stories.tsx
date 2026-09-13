import { useState } from "react"

import preview from "#storybook/preview"
import { expect, fn, screen } from "storybook/test"

import { withRouter } from "#storybook/decorators/with-router"

import {
  createLongMatchingAnalysisResponse,
  createRoleStoryResponse,
  createStaleWhileExtractingResponse,
} from "../stories/role-story-fixtures"
import { MatchingAnalysisCard } from "./MatchingAnalysisCard"

const meta = preview.meta({
  component: MatchingAnalysisCard,
  decorators: [withRouter],
  parameters: { router: { initialEntries: ["/roles"] } },
  title: "Roles/MatchingAnalysisCard",
})

function argsFor(scenario: Parameters<typeof createRoleStoryResponse>[0]) {
  const response = createRoleStoryResponse(scenario)
  return {
    matching: response.roles[0]!.matching,
    matchingState: response.matchingStatesByRoleId[response.roles[0]!.id],
    isMatchingStateError: false,
  }
}

export const None = meta.story({
  args: { ...argsFor("roleWithExtractedJobDescription"), onStartMatching: fn() },
})
export const Generating = meta.story({ args: argsFor("matchingAnalysisGenerating") })
export const SynchronizationError = meta.story({
  args: {
    ...argsFor("matchingAnalysisGenerating"),
    onRetryMatchingState: fn(),
    isMatchingStateError: true,
  },
})

function SynchronizationRetryHarness() {
  const initial = createRoleStoryResponse("matchingAnalysisGenerating")
  const completed = createRoleStoryResponse("matchingAnalysisCurrent")
  const [response, setResponse] = useState(initial)
  const [isMatchingStateError, setSynchronizationError] = useState(true)
  return (
    <MatchingAnalysisCard
      onRetryMatchingState={() => {
        setSynchronizationError(false)
        setResponse(completed)
      }}
      matching={response.roles[0]!.matching}
      matchingState={response.matchingStatesByRoleId[response.roles[0]!.id]}
      isMatchingStateError={isMatchingStateError}
    />
  )
}

export const SynchronizationRetry = meta.story({
  render: () => <SynchronizationRetryHarness />,
  play: async ({ userEvent }) => {
    await userEvent.click(screen.getByRole("button", { name: /重新同步状态|synchronize status/i }))
    await expect(screen.getByTestId("matching-analysis-result")).toBeVisible()
  },
})
export const Failed = meta.story({
  args: { ...argsFor("matchingAnalysisFailed"), onStartMatching: fn() },
})
export const Stale = meta.story({
  args: { ...argsFor("matchingAnalysisStale"), onStartMatching: fn() },
})
export const Current = meta.story({ args: argsFor("matchingAnalysisCurrent") })

const staleWhileExtracting = createStaleWhileExtractingResponse()

export const StaleWhileJobDescriptionExtracting = meta.story({
  args: {
    matching: staleWhileExtracting.roles[0]!.matching,
    matchingState: staleWhileExtracting.matchingStatesByRoleId[staleWhileExtracting.roles[0]!.id],
    isMatchingStateError: false,
  },
})

const longMatchingAnalysis = createLongMatchingAnalysisResponse()

export const LongMatchingAnalysis = meta.story({
  args: {
    matching: longMatchingAnalysis.roles[0]!.matching,
    matchingState: longMatchingAnalysis.matchingStatesByRoleId[longMatchingAnalysis.roles[0]!.id],
    isMatchingStateError: false,
  },
})

function AnalysisFlowHarness({
  initialScenario,
}: {
  initialScenario: Parameters<typeof createRoleStoryResponse>[0]
}) {
  const [response, setResponse] = useState(() => createRoleStoryResponse(initialScenario))
  const completed = createRoleStoryResponse("matchingAnalysisCurrent")
  const role = response.roles[0]!

  return (
    <MatchingAnalysisCard
      onStartMatching={() => setResponse(completed)}
      matching={response.roles[0]!.matching}
      matchingState={response.matchingStatesByRoleId[role.id]}
      isMatchingStateError={false}
    />
  )
}

export const Generate = meta.story({
  render: () => <AnalysisFlowHarness initialScenario="roleWithExtractedJobDescription" />,
  play: async ({ userEvent }) => {
    await userEvent.click(
      screen.getByRole("button", { name: /生成匹配分析|generate match analysis/i }),
    )
    await expect(screen.getByTestId("matching-analysis-result")).toBeVisible()
  },
})

export const RegenerateStale = meta.story({
  render: () => <AnalysisFlowHarness initialScenario="matchingAnalysisStale" />,
  play: async ({ userEvent }) => {
    await userEvent.click(screen.getByRole("button", { name: /重新生成分析|regenerate analysis/i }))
    await expect(screen.getByTestId("matching-analysis-result")).toBeVisible()
  },
})

export const RetryFailed = meta.story({
  render: () => <AnalysisFlowHarness initialScenario="matchingAnalysisFailed" />,
  play: async ({ userEvent }) => {
    await userEvent.click(screen.getByRole("button", { name: /重试生成|retry generation/i }))
    await expect(screen.getByTestId("matching-analysis-result")).toBeVisible()
  },
})

export const OldResultRunning = meta.story({
  args: {
    ...argsFor("matchingAnalysisStale"),
    matchingState: { status: "running", error: null },
    onAbortMatching: fn(),
  },
})
export const OldResultFailed = meta.story({
  args: {
    ...argsFor("matchingAnalysisStale"),
    matchingState: { status: "failed", error: { code: "llm_unavailable", message: "Unavailable" } },
    onStartMatching: fn(),
  },
})
export const OldResultAborting = meta.story({
  args: {
    ...argsFor("matchingAnalysisStale"),
    matchingState: { status: "aborting", error: null },
    onAbortMatching: fn(),
  },
})
