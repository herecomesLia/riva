import preview from "#storybook/preview"

import { createRoleStoryResponse } from "../stories/role-story-fixtures"
import { TargetRoleProgressSummary } from "./TargetRoleProgressSummary"

const meta = preview.meta({
  component: TargetRoleProgressSummary,
  title: "Roles/TargetRoleProgressSummary",
})

function argsFor(scenario: Parameters<typeof createRoleStoryResponse>[0]) {
  const response = createRoleStoryResponse(scenario)
  const role = response.targetRoles[0]!
  return {
    isCurrent: role.id === response.activeTargetRoleId,
    role,
    jdTask: response.jdTasksByRoleId[role.id],
    analysis: response.matchingByRoleId[role.id],
  }
}

export const ExtractedJobDescription = meta.story({
  args: argsFor("roleWithExtractedJobDescription"),
})
export const Complete = meta.story({ args: argsFor("matchingAnalysisCurrent") })
export const JobDescriptionMissing = meta.story({
  args: argsFor("singleRoleWithoutJobDescription"),
})
export const JobDescriptionExtracting = meta.story({
  args: argsFor("roleWithJobDescriptionExtracting"),
})
export const MatchingAnalysisGenerating = meta.story({
  args: argsFor("matchingAnalysisGenerating"),
})
export const MatchingAnalysisFailed = meta.story({ args: argsFor("matchingAnalysisFailed") })
export const MatchingAnalysisStale = meta.story({ args: argsFor("matchingAnalysisStale") })
export const MatchingAnalysisCurrent = meta.story({ args: argsFor("matchingAnalysisCurrent") })

const archivedResponse = createRoleStoryResponse("archivedRoles")

export const ArchivedRole = meta.story({
  args: {
    isCurrent: false,
    jdTask: { status: "idle", error: null },
    analysis: { status: "none" },
    role: archivedResponse.targetRoles.find((role) => role.isArchived)!,
  },
})
