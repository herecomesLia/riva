import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ApiError } from "@/api/error"
import type {
  RoleResponse,
  RoleListResponse,
  TaskStatusResponse,
  TaskFailureResponse,
} from "@/api/generated/models"

import {
  archiveRole,
  createRole,
  deleteRole,
  listRoles,
  startRoleMatching,
  abortRoleMatching,
  extractJdFromText,
  retryJdExtraction,
  abortJdExtraction,
  recognizeRole,
  restoreRole,
  setActiveRole,
  updateJd,
  updateRole,
} from "@/services/roles"

import { RolesView, type RolesViewActions } from "./RolesView"
import { rolesQueryKey, jdExtractionStateQueryKey, roleMatchingStateQueryKey } from "./queries"
import { useJdExtractionStates } from "./hooks/useJdExtractionStates"
import { useRoleMatchingState } from "./hooks/useRoleMatchingState"
import { RolesActionError } from "./roles-errors"

export function RolesPage() {
  const queryClient = useQueryClient()
  const rolesQuery = useQuery({ queryFn: listRoles, queryKey: rolesQueryKey, retry: false })
  const resources = useJdExtractionStates(rolesQuery.data?.roles ?? [])
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null)
  const matchingQuery = useRoleMatchingState(selectedRoleId)
  const refreshRoles = () => queryClient.invalidateQueries({ queryKey: rolesQueryKey, exact: true })
  const refreshRoleResources = async (roleId: string) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: jdExtractionStateQueryKey(roleId) }),
      queryClient.invalidateQueries({ queryKey: roleMatchingStateQueryKey(roleId) }),
    ])
  }
  const cacheCreatedRole = (role: RoleResponse) => {
    queryClient.setQueryData<RoleListResponse>(rolesQueryKey, (current) =>
      current
        ? {
            ...current,
            roles: [role, ...current.roles.filter((item) => item.id !== role.id)],
          }
        : current,
    )
  }
  const createMutation = useMutation({
    mutationFn: (input: Parameters<typeof createRole>[0]) => createRole(input),
    onSuccess: async (role) => {
      cacheCreatedRole(role)
      await refreshRoles()
    },
  })
  const updateMutation = useMutation({
    mutationFn: ({ roleId, input }: { roleId: string; input: Parameters<typeof updateRole>[1] }) =>
      updateRole(roleId, input),
    onSuccess: refreshRoles,
  })
  const setActiveMutation = useMutation({
    mutationFn: (roleId: string) => setActiveRole(roleId),
    onSuccess: refreshRoles,
  })
  const archiveMutation = useMutation({
    mutationFn: (roleId: string) => archiveRole(roleId),
    onSuccess: refreshRoles,
  })
  const restoreMutation = useMutation({
    mutationFn: (roleId: string) => restoreRole(roleId),
    onSuccess: refreshRoles,
  })
  const deleteMutation = useMutation({
    mutationFn: (roleId: string) => deleteRole(roleId),
    onSuccess: refreshRoles,
  })
  const recognizeMutation = useMutation({
    mutationFn: (input: Parameters<typeof recognizeRole>[0]) => recognizeRole(input),
    onSuccess: cacheCreatedRole,
  })
  const extractMutation = useMutation({
    mutationFn: ({ roleId, text }: { roleId: string; text: string }) =>
      extractJdFromText(roleId, text),
  })
  const retryExtractionMutation = useMutation({
    mutationFn: retryJdExtraction,
  })
  const abortExtractionMutation = useMutation({
    mutationFn: abortJdExtraction,
  })
  const startRoleMatchingMutation = useMutation({
    mutationFn: (roleId: string) => startRoleMatching(roleId),
  })
  const abortRoleMatchingMutation = useMutation({
    mutationFn: (roleId: string) => abortRoleMatching(roleId),
  })
  const updateJdMutation = useMutation({
    mutationFn: ({ roleId, input }: { roleId: string; input: Parameters<typeof updateJd>[1] }) =>
      updateJd(roleId, input),
    onSuccess: async (_, { roleId }) => {
      await refreshRoles()
      await refreshRoleResources(roleId)
    },
  })

  async function runMutation<Input, Output>(
    mutate: (input: Input) => Promise<Output>,
    input: Input,
  ): Promise<Output> {
    try {
      return await mutate(input)
    } catch (error) {
      if (error instanceof ApiError && error.code === "resource.conflict") {
        await refreshRoles()
        throw new RolesActionError("stateConflict")
      }
      throw new RolesActionError("requestFailed")
    }
  }

  async function runExtractionCommand(roleId: string, command: () => Promise<void>) {
    await queryClient.cancelQueries({ queryKey: jdExtractionStateQueryKey(roleId) })
    try {
      await runMutation(command, undefined)
    } finally {
      await refreshRoleResources(roleId)
    }
  }

  async function runMatchingCommand(roleId: string, command: () => Promise<void>) {
    await queryClient.cancelQueries({ queryKey: roleMatchingStateQueryKey(roleId) })
    try {
      await runMutation(command, undefined)
    } finally {
      await queryClient.invalidateQueries({ queryKey: roleMatchingStateQueryKey(roleId) })
      // A short task can finish before its first state request observes it.
      if (
        queryClient.getQueryData<TaskStatusResponse | TaskFailureResponse>(
          roleMatchingStateQueryKey(roleId),
        )?.status === "idle"
      ) {
        await refreshRoles()
      }
    }
  }

  const actions: RolesViewActions = {
    archiveRole: (roleId) => runMutation(archiveMutation.mutateAsync, roleId),
    createRole: (input) => runMutation(createMutation.mutateAsync, input),
    deleteRole: (roleId) => runMutation(deleteMutation.mutateAsync, roleId),
    startRoleMatching: (roleId) =>
      runMatchingCommand(roleId, () => startRoleMatchingMutation.mutateAsync(roleId)),
    abortRoleMatching: (roleId) =>
      runMatchingCommand(roleId, () => abortRoleMatchingMutation.mutateAsync(roleId)),
    retryJdSynchronization: (roleId) =>
      queryClient.refetchQueries(
        { queryKey: jdExtractionStateQueryKey(roleId) },
        { throwOnError: true },
      ),
    retryMatchingState: (roleId) =>
      queryClient.refetchQueries(
        { queryKey: roleMatchingStateQueryKey(roleId) },
        { throwOnError: true },
      ),
    recognizeRole: (input) => runMutation(recognizeMutation.mutateAsync, input),
    restoreRole: (roleId) => runMutation(restoreMutation.mutateAsync, roleId),
    extractJdFromText: (roleId, text) =>
      runExtractionCommand(roleId, () => extractMutation.mutateAsync({ roleId, text })),
    retryJdExtraction: (roleId) =>
      runExtractionCommand(roleId, () => retryExtractionMutation.mutateAsync(roleId)),
    abortJdExtraction: (roleId) =>
      runExtractionCommand(roleId, () => abortExtractionMutation.mutateAsync(roleId)),
    setActiveRole: (roleId) => runMutation(setActiveMutation.mutateAsync, roleId),
    updateJd: (roleId, input) => runMutation(updateJdMutation.mutateAsync, { roleId, input }),
    updateRole: (roleId, input) => runMutation(updateMutation.mutateAsync, { roleId, input }),
  }

  if (rolesQuery.data !== undefined) {
    return (
      <RolesView
        actions={actions}
        content={{ status: "ready", data: rolesQuery.data }}
        {...resources}
        onSelectedRoleChange={setSelectedRoleId}
        matchingStatesByRoleId={selectedRoleId ? { [selectedRoleId]: matchingQuery.data } : {}}
        matchSynchronizationErrorRoleIds={
          selectedRoleId && matchingQuery.isError ? [selectedRoleId] : []
        }
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
