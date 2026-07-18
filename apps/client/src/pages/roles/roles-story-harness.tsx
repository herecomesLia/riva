import { useState } from "react"

import type { RolesPageResponse } from "@/models/roles"

import { RolesView, type RolesViewActions } from "./RolesView"

export function RolesStoryHarness({
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
      const independentResponse = structuredClone(response)
      setData(independentResponse)
      return independentResponse
    }) as RolesViewActions[Key]
  }

  const actions: RolesViewActions = {
    archiveTargetRole: wrap("archiveTargetRole"),
    createTargetRole: wrap("createTargetRole"),
    deleteTargetRole: wrap("deleteTargetRole"),
    setCurrentTargetRole: wrap("setCurrentTargetRole"),
    updateRolePreparationStatus: wrap("updateRolePreparationStatus"),
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
