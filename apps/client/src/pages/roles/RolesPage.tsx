import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ApiError } from "@/api/error"
import type { TargetRoleResponse, TargetRoleListResponse } from "@/api/generated/models"

import {
  archiveRole,
  createRole,
  deleteRole,
  getRoles,
  match,
  extractJd,
  retryJdExtraction,
  abortJdExtraction,
  recognizeRole,
  restoreRole,
  setActiveRole,
  updateJd,
  updateRole,
} from "@/services/roles"

import { RolesView, type RolesViewActions } from "./RolesView"
import {
  ROLES_QUERY_KEY,
  jdTaskQueryKey,
  matchingQueryKey,
  useRoleQueries,
} from "./hooks/useRoleQueries"
import { RolesActionError } from "./roles-errors"

export function RolesPage() {
  const queryClient = useQueryClient()
  const rolesQuery = useQuery({ queryFn: getRoles, queryKey: ROLES_QUERY_KEY, retry: false })
  const resources = useRoleQueries(rolesQuery.data?.targetRoles ?? [])
  const refreshRoles = () =>
    queryClient.invalidateQueries({ queryKey: ROLES_QUERY_KEY, exact: true })
  const refreshRoleResources = async (roleId: string) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: jdTaskQueryKey(roleId) }),
      queryClient.invalidateQueries({ queryKey: matchingQueryKey(roleId) }),
    ])
  }
  const cacheCreatedRole = (role: TargetRoleResponse) => {
    queryClient.setQueryData<TargetRoleListResponse>(ROLES_QUERY_KEY, (current) =>
      current
        ? {
            ...current,
            targetRoles: [role, ...current.targetRoles.filter((item) => item.id !== role.id)],
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
    mutationFn: ({ roleId, text }: { roleId: string; text: string }) => extractJd(roleId, text),
  })
  const retryExtractionMutation = useMutation({
    mutationFn: retryJdExtraction,
  })
  const abortExtractionMutation = useMutation({
    mutationFn: abortJdExtraction,
  })
  const matchMutation = useMutation({
    mutationFn: (roleId: string) => match(roleId),
    onMutate: (roleId) => queryClient.cancelQueries({ queryKey: matchingQueryKey(roleId) }),
    onSuccess: (analysis, roleId) => queryClient.setQueryData(matchingQueryKey(roleId), analysis),
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
    await queryClient.cancelQueries({ queryKey: jdTaskQueryKey(roleId) })
    try {
      await runMutation(command, undefined)
    } finally {
      await refreshRoleResources(roleId)
    }
  }

  const actions: RolesViewActions = {
    archiveRole: (roleId) => runMutation(archiveMutation.mutateAsync, roleId),
    createRole: (input) => runMutation(createMutation.mutateAsync, input),
    deleteRole: (roleId) => runMutation(deleteMutation.mutateAsync, roleId),
    match: (roleId) => runMutation(matchMutation.mutateAsync, roleId),
    retryJdSynchronization: (roleId) =>
      queryClient.refetchQueries({ queryKey: jdTaskQueryKey(roleId) }, { throwOnError: true }),
    retryMatchSynchronization: (roleId) =>
      queryClient.refetchQueries({ queryKey: matchingQueryKey(roleId) }, { throwOnError: true }),
    recognizeRole: (input) => runMutation(recognizeMutation.mutateAsync, input),
    restoreRole: (roleId) => runMutation(restoreMutation.mutateAsync, roleId),
    extractJd: (roleId, text) =>
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
