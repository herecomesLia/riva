import { useState } from "react"

import preview from "#storybook/preview"
import { expect, fn, screen } from "storybook/test"

import { withRouter } from "#storybook/decorators/with-router"
import type { RolesMockScenario } from "@/mocks/data/roles"

import {
  createLongMatchingAnalysisResponse,
  createRoleStoryResponse,
  createStaleWhileParsingResponse,
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
    profile: response.profile,
    role: response.roles[0]!,
    synchronizationError: false,
  }
}

export const ProfileMissing = meta.story({ args: argsFor("profileMissing") })
export const ProfileIncomplete = meta.story({ args: argsFor("profileIncomplete") })
export const JobDescriptionMissing = meta.story({
  args: argsFor("singleRoleWithoutJobDescription"),
})
export const JobDescriptionParsing = meta.story({ args: argsFor("roleWithJobDescriptionParsing") })
export const None = meta.story({
  args: { ...argsFor("roleWithParsedJobDescription"), onGenerate: fn() },
})
export const Generating = meta.story({ args: argsFor("matchingAnalysisGenerating") })
export const SynchronizationError = meta.story({
  args: {
    ...argsFor("matchingAnalysisGenerating"),
    onRetrySynchronization: fn(),
    synchronizationError: true,
  },
})

function SynchronizationRetryHarness() {
  const initial = createRoleStoryResponse("matchingAnalysisGenerating")
  const completed = createRoleStoryResponse("matchingAnalysisCurrent")
  const [response, setResponse] = useState(initial)
  const [synchronizationError, setSynchronizationError] = useState(true)
  return (
    <MatchingAnalysisCard
      onRetrySynchronization={() => {
        setSynchronizationError(false)
        setResponse(completed)
      }}
      profile={response.profile}
      role={response.roles[0]!}
      synchronizationError={synchronizationError}
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
  args: { ...argsFor("matchingAnalysisFailed"), onGenerate: fn() },
})
export const Stale = meta.story({
  args: { ...argsFor("matchingAnalysisStale"), onGenerate: fn() },
})
export const Current = meta.story({ args: argsFor("matchingAnalysisCurrent") })

const staleWhileParsing = createStaleWhileParsingResponse()

export const StaleWhileJobDescriptionParsing = meta.story({
  args: {
    profile: staleWhileParsing.profile,
    role: staleWhileParsing.roles[0]!,
    synchronizationError: false,
  },
})

const longMatchingAnalysis = createLongMatchingAnalysisResponse()

export const LongMatchingAnalysis = meta.story({
  args: {
    profile: longMatchingAnalysis.profile,
    role: longMatchingAnalysis.roles[0]!,
    synchronizationError: false,
  },
})

function AnalysisFlowHarness({ initialScenario }: { initialScenario: RolesMockScenario }) {
  const [response, setResponse] = useState(() => createRoleStoryResponse(initialScenario))
  const completed = createRoleStoryResponse("matchingAnalysisCurrent")
  const role = response.roles[0]!

  return (
    <MatchingAnalysisCard
      onGenerate={() => setResponse(completed)}
      profile={response.profile}
      role={role}
      synchronizationError={false}
    />
  )
}

export const Generate = meta.story({
  render: () => <AnalysisFlowHarness initialScenario="roleWithParsedJobDescription" />,
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
