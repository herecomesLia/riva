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

export const Overview = meta.story({ render: () => <DetailsHarness /> })
export const JobDescription = meta.story({
  render: () => <DetailsHarness initialTab="job-description" />,
})
export const MatchingAnalysis = meta.story({
  render: () => <DetailsHarness initialTab="matching-analysis" />,
  play: async () => {
    await expect(screen.getByTestId("matching-analysis-result")).toBeVisible()
  },
})
