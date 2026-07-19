import { useState } from "react"

import type { RolesPageResponse } from "@/models/roles"

import { RolesView, type RolesViewActions } from "../RolesView"

export function RoleManagementStoryHarness({
  actions: actionOverrides,
  initialData,
  initialSelectedRoleId,
}: {
  actions: Partial<RolesViewActions>
  initialData: RolesPageResponse
  initialSelectedRoleId?: string
}) {
  const [data, setData] = useState(() => structuredClone(initialData))

  function wrap<Key extends keyof RolesViewActions>(key: Key): RolesViewActions[Key] {
    return (async (input: Parameters<RolesViewActions[Key]>[0]) => {
      const action = actionOverrides[key] as
        ((value: Parameters<RolesViewActions[Key]>[0]) => Promise<RolesPageResponse>) | undefined
      const response = action ? await action(input) : data
      const nextData = structuredClone(response)
      setData(nextData)
      return nextData
    }) as RolesViewActions[Key]
  }

  const actions: RolesViewActions = {
    archiveTargetRole: wrap("archiveTargetRole"),
    createTargetRole: wrap("createTargetRole"),
    deleteTargetRole: wrap("deleteTargetRole"),
    generateMatchingAnalysis: wrap("generateMatchingAnalysis"),
    retryJobDescriptionParsing: wrap("retryJobDescriptionParsing"),
    retryJobDescriptionSynchronization: wrap("retryJobDescriptionSynchronization"),
    retryMatchingAnalysisSynchronization: wrap("retryMatchingAnalysisSynchronization"),
    saveJobDescription: wrap("saveJobDescription"),
    setCurrentTargetRole: wrap("setCurrentTargetRole"),
    updateRolePreparationStatus: wrap("updateRolePreparationStatus"),
    updateJobDescriptionAnalysisModule: wrap("updateJobDescriptionAnalysisModule"),
    updateTargetRole: wrap("updateTargetRole"),
  }

  return (
    <RolesView
      actions={actions}
      content={{ status: "ready", data }}
      initialSelectedRoleId={initialSelectedRoleId}
      variant="default"
    />
  )
}
