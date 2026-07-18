import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

import type {
  GetJobDescriptionParsingStatusInput,
  RolesPageResponse,
  TargetRole,
} from "@/models/roles"
import {
  archiveTargetRole,
  createTargetRole,
  deleteTargetRole,
  getJobDescriptionParsingStatus,
  getRolesPage,
  saveJobDescription,
  setCurrentTargetRole,
  startJobDescriptionParsing,
  updateRolePreparationStatus,
  updateTargetRole,
} from "@/services/roles"

import { RolesView, type RolesViewActions } from "./RolesView"
import { RolesActionError } from "./roles-errors"

const rolesQueryKey = ["roles"] as const

export function RolesPage() {
  const queryClient = useQueryClient()
  const [jobDescriptionSynchronizationErrorRoleIds, setJobDescriptionSynchronizationErrorRoleIds] =
    useState<string[]>([])
  const rolesQuery = useQuery({
    queryFn: getRolesPage,
    queryKey: rolesQueryKey,
    retry: false,
  })

  function setRolesResponse(response: RolesPageResponse) {
    queryClient.setQueryData(rolesQueryKey, response)
    return response
  }

  const createMutation = useMutation({ mutationFn: createTargetRole, onSuccess: setRolesResponse })
  const updateMutation = useMutation({ mutationFn: updateTargetRole, onSuccess: setRolesResponse })
  const setCurrentMutation = useMutation({
    mutationFn: setCurrentTargetRole,
    onSuccess: setRolesResponse,
  })
  const preparationMutation = useMutation({
    mutationFn: updateRolePreparationStatus,
    onSuccess: setRolesResponse,
  })
  const archiveMutation = useMutation({
    mutationFn: archiveTargetRole,
    onSuccess: setRolesResponse,
  })
  const deleteMutation = useMutation({ mutationFn: deleteTargetRole, onSuccess: setRolesResponse })
  const saveJobDescriptionMutation = useMutation({ mutationFn: saveJobDescription })
  const retryJobDescriptionParsingMutation = useMutation({
    mutationFn: startJobDescriptionParsing,
  })
  const jobDescriptionStatusMutation = useMutation({
    mutationFn: getJobDescriptionParsingStatus,
  })

  function setJobDescriptionSynchronizationError(roleId: string, hasError: boolean) {
    setJobDescriptionSynchronizationErrorRoleIds((current) =>
      hasError
        ? current.includes(roleId)
          ? current
          : [...current, roleId]
        : current.filter((candidate) => candidate !== roleId),
    )
  }

  function mergeRoleSnapshot(role: TargetRole) {
    const current = queryClient.getQueryData<RolesPageResponse>(rolesQueryKey)
    if (!current || !current.roles.some((candidate) => candidate.id === role.id)) return current
    return setRolesResponse({
      ...current,
      roles: current.roles.map((candidate) => (candidate.id === role.id ? role : candidate)),
    })
  }

  function isCurrentParsingOperation(input: GetJobDescriptionParsingStatusInput) {
    const current = queryClient.getQueryData<RolesPageResponse>(rolesQueryKey)
    const role = current?.roles.find((candidate) => candidate.id === input.roleId)
    return (
      role?.version === input.version &&
      role.jobDescription.status === "parsing" &&
      role.jobDescription.version === input.jobDescriptionVersion
    )
  }

  async function synchronizeJobDescription(input: GetJobDescriptionParsingStatusInput) {
    try {
      const role = await jobDescriptionStatusMutation.mutateAsync(input)
      const response = mergeRoleSnapshot(role)
      if (role.jobDescription.version === input.jobDescriptionVersion) {
        setJobDescriptionSynchronizationError(input.roleId, false)
      }
      if (!response) throw new Error("Target role is no longer available.")
      return response
    } catch (error) {
      if (isCurrentParsingOperation(input)) {
        setJobDescriptionSynchronizationError(input.roleId, true)
      }
      throw error
    }
  }

  function startBackgroundJobDescriptionSynchronization(
    response: RolesPageResponse,
    roleId: string,
  ) {
    const role = response.roles.find((candidate) => candidate.id === roleId)
    if (role?.jobDescription.status !== "parsing") return
    const input = {
      roleId: role.id,
      version: role.version,
      jobDescriptionVersion: role.jobDescription.version,
    }
    void synchronizeJobDescription(input).catch(() => undefined)
  }

  async function runMutation<Input>(
    mutate: (input: Input) => Promise<RolesPageResponse>,
    input: Input,
  ) {
    try {
      return await mutate(input)
    } catch (error) {
      throw new RolesActionError(
        error instanceof Error && error.message === "Target role version is out of date."
          ? "versionConflict"
          : "requestFailed",
      )
    }
  }

  const actions: RolesViewActions = {
    archiveTargetRole: (input) => runMutation(archiveMutation.mutateAsync, input),
    createTargetRole: (input) => runMutation(createMutation.mutateAsync, input),
    deleteTargetRole: (input) => runMutation(deleteMutation.mutateAsync, input),
    retryJobDescriptionParsing: async (input) => {
      const response = await runMutation(retryJobDescriptionParsingMutation.mutateAsync, input)
      setRolesResponse(response)
      setJobDescriptionSynchronizationError(input.roleId, false)
      startBackgroundJobDescriptionSynchronization(response, input.roleId)
      return response
    },
    retryJobDescriptionSynchronization: async (input) => {
      try {
        return await synchronizeJobDescription(input)
      } catch {
        throw new RolesActionError("requestFailed")
      }
    },
    saveJobDescription: async (input) => {
      const response = await runMutation(saveJobDescriptionMutation.mutateAsync, input)
      setRolesResponse(response)
      setJobDescriptionSynchronizationError(input.roleId, false)
      startBackgroundJobDescriptionSynchronization(response, input.roleId)
      return response
    },
    setCurrentTargetRole: (input) => runMutation(setCurrentMutation.mutateAsync, input),
    updateRolePreparationStatus: (input) => runMutation(preparationMutation.mutateAsync, input),
    updateTargetRole: (input) => runMutation(updateMutation.mutateAsync, input),
  }

  if (rolesQuery.data !== undefined) {
    return (
      <RolesView
        actions={actions}
        content={{ status: "ready", data: rolesQuery.data }}
        jobDescriptionSynchronizationErrorRoleIds={jobDescriptionSynchronizationErrorRoleIds}
        variant="default"
      />
    )
  }

  if (rolesQuery.isFetching) {
    return <RolesView content={{ status: "loading" }} variant="default" />
  }

  if (rolesQuery.isError) {
    return <RolesView onRetry={() => void rolesQuery.refetch()} variant="error" />
  }

  return <RolesView content={{ status: "loading" }} variant="default" />
}
