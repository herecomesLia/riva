import { useState } from "react"

import preview from "#storybook/preview"
import { expect, screen } from "storybook/test"

import { createRoleStoryResponse } from "../stories/role-story-fixtures"
import { RoleDetails, type TargetRoleTab } from "./RoleDetails"

const meta = preview.meta({
  component: RoleDetails,
  title: "Roles/RoleDetails",
})

function DetailsHarness({ initialTab = "overview" }: { initialTab?: TargetRoleTab }) {
  const [activeTab, setActiveTab] = useState<TargetRoleTab>(initialTab)
  const response = createRoleStoryResponse("matchingAnalysisCurrent")
  return (
    <RoleDetails
      activeTab={activeTab}
      onTabChange={setActiveTab}
      profileContext={response.profileContext}
      role={response.roles[0]!}
    />
  )
}

function ArchivedDetailsHarness() {
  const [activeTab, setActiveTab] = useState<TargetRoleTab>("overview")
  const response = createRoleStoryResponse("archivedRoles")
  const archivedRole = response.roles.find((role) => role.preparationStatus === "archived")!
  return (
    <RoleDetails
      activeTab={activeTab}
      onTabChange={setActiveTab}
      profileContext={response.profileContext}
      role={archivedRole}
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
