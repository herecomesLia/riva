import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { ApiError } from "@/api/error"
import type { TargetRoleResponse } from "@/api/generated/models"
import type { RolesData } from "@/models/target-role-workflow"

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
  toJdState,
} from "@/services/roles"

import { RolesView, type RolesViewActions } from "./RolesView"
import {
  ROLES_QUERY_KEY,
  useJdExtractionSynchronization,
  useMatchingAnalysisSynchronization,
} from "./hooks/useRoleSynchronization"
import { RolesActionError } from "./roles-errors"

export function RolesPage() {
  const queryClient = useQueryClient()
  const rolesQuery = useQuery({ queryFn: getRoles, queryKey: ROLES_QUERY_KEY, retry: false })
  const {
    clearSynchronizationError,
    pauseSynchronization,
    restartSynchronization,
    synchronizationErrorRoleIds,
  } = useJdExtractionSynchronization(rolesQuery.data)
  const {
    clearSynchronizationError: clearMatchSynchronizationError,
    restartSynchronization: restartMatchSynchronization,
    synchronizationErrorRoleIds: matchSynchronizationErrorRoleIds,
  } = useMatchingAnalysisSynchronization(rolesQuery.data)

  const refreshRoles = () => queryClient.invalidateQueries({ queryKey: ROLES_QUERY_KEY })
  const cacheCreatedRole = (role: TargetRoleResponse) => {
    queryClient.setQueryData<RolesData>(ROLES_QUERY_KEY, (current) =>
      current
        ? {
            ...current,
            roles: [
              {
                ...role,
                jdState: toJdState({ status: "idle", error: null }, role.jd),
                matchState: { status: "none" },
              },
              ...current.roles.filter((item) => item.id !== role.id),
            ],
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
    onSuccess: refreshRoles,
  })
  const updateJdMutation = useMutation({
    mutationFn: ({ roleId, input }: { roleId: string; input: Parameters<typeof updateJd>[1] }) =>
      updateJd(roleId, input),
    onSuccess: refreshRoles,
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

  async function runExtractionCommand(
    roleId: string,
    command: () => Promise<void>,
    phase: "queued" | "aborting",
  ) {
    pauseSynchronization(roleId)
    await queryClient.cancelQueries({ queryKey: ROLES_QUERY_KEY })
    try {
      await runMutation(command, undefined)
      queryClient.setQueryData<RolesData>(ROLES_QUERY_KEY, (current) =>
        current
          ? {
              ...current,
              roles: current.roles.map((role) =>
                role.id === roleId
                  ? {
                      ...role,
                      jdState: { status: "extracting", phase },
                      matchState:
                        phase === "queued"
                          ? role.matchState.status === "current"
                            ? { status: "stale", result: role.matchState.result }
                            : role.matchState.status === "generating"
                              ? { status: "none" }
                              : role.matchState
                          : role.matchState,
                    }
                  : role,
              ),
            }
          : current,
      )
      clearMatchSynchronizationError(roleId)
      await refreshRoles()
    } finally {
      restartSynchronization(roleId)
    }
  }

  const actions: RolesViewActions = {
    archiveRole: (roleId) => runMutation(archiveMutation.mutateAsync, roleId),
    createRole: (input) => runMutation(createMutation.mutateAsync, input),
    deleteRole: (roleId) => runMutation(deleteMutation.mutateAsync, roleId),
    match: async (roleId) => {
      const result = await runMutation(matchMutation.mutateAsync, roleId)
      clearMatchSynchronizationError(roleId)
      return result
    },
    retryJdSynchronization: async (roleId) => {
      if (!restartSynchronization(roleId)) throw new RolesActionError("requestFailed")
    },
    retryMatchSynchronization: async (roleId) => {
      if (!restartMatchSynchronization(roleId)) throw new RolesActionError("requestFailed")
    },
    recognizeRole: (input) => runMutation(recognizeMutation.mutateAsync, input),
    restoreRole: (roleId) => runMutation(restoreMutation.mutateAsync, roleId),
    extractJd: (roleId, text) =>
      runExtractionCommand(roleId, () => extractMutation.mutateAsync({ roleId, text }), "queued"),
    retryJdExtraction: (roleId) =>
      runExtractionCommand(roleId, () => retryExtractionMutation.mutateAsync(roleId), "queued"),
    abortJdExtraction: (roleId) =>
      runExtractionCommand(roleId, () => abortExtractionMutation.mutateAsync(roleId), "aborting"),
    setActiveRole: (roleId) => runMutation(setActiveMutation.mutateAsync, roleId),
    updateJd: async (roleId, input) => {
      const result = await runMutation(updateJdMutation.mutateAsync, { roleId, input })
      clearSynchronizationError(roleId)
      clearMatchSynchronizationError(roleId)
      return result
    },
    updateRole: (roleId, input) => runMutation(updateMutation.mutateAsync, { roleId, input }),
  }

  if (rolesQuery.data !== undefined) {
    return (
      <RolesView
        actions={actions}
        content={{ status: "ready", data: rolesQuery.data }}
        jdSynchronizationErrorRoleIds={synchronizationErrorRoleIds}
        matchSynchronizationErrorRoleIds={matchSynchronizationErrorRoleIds}
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
