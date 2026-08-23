import preview from "#storybook/preview"

import { createRoleStoryResponse } from "../stories/role-story-fixtures"
import { TargetRoleProgressSummary } from "./TargetRoleProgressSummary"

const meta = preview.meta({
  component: TargetRoleProgressSummary,
  title: "Roles/TargetRoleProgressSummary",
})

function argsFor(scenario: Parameters<typeof createRoleStoryResponse>[0]) {
  const response = createRoleStoryResponse(scenario)
  const role = response.roles[0]!
  return { isCurrent: role.id === response.currentRoleId, role }
}

export const ParsedJobDescription = meta.story({
  args: argsFor("roleWithParsedJobDescription"),
})
export const Complete = meta.story({ args: argsFor("matchingAnalysisCurrent") })
export const JobDescriptionMissing = meta.story({
  args: argsFor("singleRoleWithoutJobDescription"),
})
export const JobDescriptionSaved = meta.story({ args: argsFor("roleWithSavedJobDescription") })
export const MatchingAnalysisStale = meta.story({ args: argsFor("matchingAnalysisStale") })
export const MatchingAnalysisCurrent = meta.story({ args: argsFor("matchingAnalysisCurrent") })

const archivedResponse = createRoleStoryResponse("archivedRoles")

export const ArchivedRole = meta.story({
  args: {
    isCurrent: false,
    role: archivedResponse.roles.find((role) => role.preparationStatus === "archived")!,
  },
})
