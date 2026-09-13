import { useState } from "react"

import preview from "#storybook/preview"
import { expect, screen } from "storybook/test"

import { createRoleStoryResponse } from "../stories/role-story-fixtures"
import { RoleDetails, type RoleTab } from "./RoleDetails"

const meta = preview.meta({
  component: RoleDetails,
  title: "Roles/RoleDetails",
})

function DetailsHarness({ initialTab = "overview" }: { initialTab?: RoleTab }) {
  const [activeTab, setActiveTab] = useState<RoleTab>(initialTab)
  const response = createRoleStoryResponse("matchingAnalysisCurrent")
  return (
    <RoleDetails
      activeTab={activeTab}
      activeRoleId={response.activeRoleId}
      onTabChange={setActiveTab}
      role={response.roles[0]!}
      jdTask={response.jdTasksByRoleId[response.roles[0]!.id]}
      matchingState={response.matchingStatesByRoleId[response.roles[0]!.id]}
    />
  )
}

function ArchivedDetailsHarness() {
  const [activeTab, setActiveTab] = useState<RoleTab>("overview")
  const response = createRoleStoryResponse("archivedRoles")
  const archivedRole = response.roles.find((role) => role.isArchived)!
  return (
    <RoleDetails
      activeTab={activeTab}
      activeRoleId={response.activeRoleId}
      onTabChange={setActiveTab}
      role={archivedRole}
      jdTask={response.jdTasksByRoleId[archivedRole.id]}
      matchingState={response.matchingStatesByRoleId[archivedRole.id]}
    />
  )
}

export const OverviewTab = meta.story({ render: () => <DetailsHarness /> })
export const JobDescriptionTab = meta.story({
  render: () => <DetailsHarness initialTab="job-description" />,
})
export const MatchingAnalysisTab = meta.story({
  render: () => <DetailsHarness initialTab="matching-analysis" />,
  play: async () => {
    await expect(screen.getByTestId("matching-analysis-result")).toBeVisible()
  },
})

export const ArchivedSelectedRole = meta.story({ render: () => <ArchivedDetailsHarness /> })
