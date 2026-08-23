import { useState } from "react"

import preview from "#storybook/preview"
import { expect, fn, screen } from "storybook/test"

import { withRouter } from "#storybook/decorators/with-router"
import type { RolesMockScenario } from "@/mocks/data/roles"

import {
  createLongMatchingAnalysisResponse,
  createRoleStoryResponse,
  createStaleWhileSavedJobDescriptionResponse,
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
  }
}

export const ProfileMissing = meta.story({ args: argsFor("profileMissing") })
export const ProfileIncomplete = meta.story({ args: argsFor("profileIncomplete") })
export const JobDescriptionMissing = meta.story({
  args: argsFor("singleRoleWithoutJobDescription"),
})
export const None = meta.story({
  args: { ...argsFor("roleWithParsedJobDescription"), onGenerate: fn() },
})
export const Stale = meta.story({
  args: { ...argsFor("matchingAnalysisStale"), onGenerate: fn() },
})
export const Current = meta.story({ args: argsFor("matchingAnalysisCurrent") })

const staleWhileSavedJobDescription = createStaleWhileSavedJobDescriptionResponse()

export const StaleWhileSavedJobDescription = meta.story({
  args: {
    profileContext: staleWhileSavedJobDescription.profileContext,
    role: staleWhileSavedJobDescription.roles[0]!,
  },
})

const longMatchingAnalysis = createLongMatchingAnalysisResponse()

export const LongMatchingAnalysis = meta.story({
  args: {
    profileContext: longMatchingAnalysis.profileContext,
    role: longMatchingAnalysis.roles[0]!,
  },
})

function AnalysisFlowHarness({ initialScenario }: { initialScenario: RolesMockScenario }) {
  const [response, setResponse] = useState(() => createRoleStoryResponse(initialScenario))
  const completed = createRoleStoryResponse("matchingAnalysisCurrent")
  const role = response.roles[0]!

  return (
    <MatchingAnalysisCard
      onGenerate={() => setResponse(completed)}
      profileContext={response.profileContext}
      role={role}
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
