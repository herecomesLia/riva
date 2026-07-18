import { useState } from "react"

import type { RolesPageResponse } from "@/models/roles"

import { RolesView, type RolesViewActions } from "./RolesView"

export type RolesStoryTransitions = Partial<{
  [Key in keyof RolesViewActions]: (
    input: Parameters<RolesViewActions[Key]>[0],
    response: RolesPageResponse,
  ) => Promise<RolesPageResponse>
}>

export function RolesStoryHarness({
  actions: actionOverrides,
  initialData,
  initialSelectedRoleId,
  jobDescriptionSynchronizationErrorRoleIds = [],
  transitions = {},
}: {
  actions: Partial<RolesViewActions>
  initialData: RolesPageResponse
  initialSelectedRoleId?: string
  jobDescriptionSynchronizationErrorRoleIds?: string[]
  transitions?: RolesStoryTransitions
}) {
  const [data, setData] = useState(() => structuredClone(initialData))

  function wrap<Key extends keyof RolesViewActions>(key: Key): RolesViewActions[Key] {
    return (async (input: Parameters<RolesViewActions[Key]>[0]) => {
      const action = actionOverrides[key] as
        ((value: Parameters<RolesViewActions[Key]>[0]) => Promise<RolesPageResponse>) | undefined
      const response = action ? await action(input) : data
      const independentResponse = structuredClone(response)
      setData(independentResponse)
      const transition = transitions[key] as
        | ((
            value: Parameters<RolesViewActions[Key]>[0],
            valueResponse: RolesPageResponse,
          ) => Promise<RolesPageResponse>)
        | undefined
      if (!transition) return independentResponse

      const settledResponse = structuredClone(await transition(input, independentResponse))
      setData(settledResponse)
      return settledResponse
    }) as RolesViewActions[Key]
  }

  const actions: RolesViewActions = {
    archiveTargetRole: wrap("archiveTargetRole"),
    createTargetRole: wrap("createTargetRole"),
    deleteTargetRole: wrap("deleteTargetRole"),
    retryJobDescriptionParsing: wrap("retryJobDescriptionParsing"),
    retryJobDescriptionSynchronization: wrap("retryJobDescriptionSynchronization"),
    saveJobDescription: wrap("saveJobDescription"),
    setCurrentTargetRole: wrap("setCurrentTargetRole"),
    updateRolePreparationStatus: wrap("updateRolePreparationStatus"),
    updateTargetRole: wrap("updateTargetRole"),
  }

  return (
    <RolesView
      actions={actions}
      content={{ status: "ready", data }}
      initialSelectedRoleId={initialSelectedRoleId}
      jobDescriptionSynchronizationErrorRoleIds={jobDescriptionSynchronizationErrorRoleIds}
      variant="default"
    />
  )
}
