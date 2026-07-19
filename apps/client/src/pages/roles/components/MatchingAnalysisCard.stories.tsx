import { useState } from "react"

import preview from "#storybook/preview"
import { expect, fn, screen } from "storybook/test"

import { withRouter } from "#storybook/decorators/with-router"
import type { RolesPageResponse, TargetRole } from "@/models/roles"

import {
  createCurrentAnalysisResponse,
  createGeneratingAnalysisResponse,
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
    profileContext: response.profileContext,
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
  const current = createCurrentAnalysisResponse(initial)
  const [role, setRole] = useState<TargetRole>(initial.roles[0]!)
  const [synchronizationError, setSynchronizationError] = useState(true)
  return (
    <MatchingAnalysisCard
      onRetrySynchronization={() => {
        setSynchronizationError(false)
        setRole(current.roles[0]!)
      }}
      profileContext={initial.profileContext}
      role={role}
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
    profileContext: staleWhileParsing.profileContext,
    role: staleWhileParsing.roles[0]!,
    synchronizationError: false,
  },
})

export const LongMatchingAnalysis = meta.story({
  args: {
    profileContext: createLongMatchingAnalysisResponse().profileContext,
    role: createLongMatchingAnalysisResponse().roles[0]!,
    synchronizationError: false,
  },
})

function AnalysisFlowHarness({ initial }: { initial: RolesPageResponse }) {
  const [response, setResponse] = useState(initial)
  const role = response.roles[0]!
  const generate = () => {
    const generating = createGeneratingAnalysisResponse(response)
    setResponse(createCurrentAnalysisResponse(generating))
  }

  return (
    <MatchingAnalysisCard
      onGenerate={generate}
      profileContext={response.profileContext}
      role={role}
      synchronizationError={false}
    />
  )
}

export const Generate = meta.story({
  render: () => (
    <AnalysisFlowHarness initial={createRoleStoryResponse("roleWithParsedJobDescription")} />
  ),
  play: async ({ userEvent }) => {
    await userEvent.click(
      screen.getByRole("button", { name: /生成匹配分析|generate match analysis/i }),
    )
    await expect(screen.getByTestId("matching-analysis-result")).toBeVisible()
  },
})

export const RegenerateStale = meta.story({
  render: () => <AnalysisFlowHarness initial={createRoleStoryResponse("matchingAnalysisStale")} />,
  play: async ({ userEvent }) => {
    await userEvent.click(screen.getByRole("button", { name: /重新生成分析|regenerate analysis/i }))
    await expect(screen.getByTestId("matching-analysis-result")).toBeVisible()
  },
})

function RetryHarness() {
  const initial = createRoleStoryResponse("matchingAnalysisFailed")
  const [role, setRole] = useState<TargetRole>(initial.roles[0]!)
  return (
    <MatchingAnalysisCard
      onGenerate={() => {
        const generating = createGeneratingAnalysisResponse({ ...initial, roles: [role] })
        setRole(createCurrentAnalysisResponse(generating).roles[0]!)
      }}
      profileContext={initial.profileContext}
      role={role}
      synchronizationError={false}
    />
  )
}

export const RetryFailed = meta.story({
  render: () => <RetryHarness />,
  play: async ({ userEvent }) => {
    await userEvent.click(screen.getByRole("button", { name: /重试生成|retry generation/i }))
    await expect(screen.getByTestId("matching-analysis-result")).toBeVisible()
  },
})
