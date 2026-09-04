import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import {
  archiveRole,
  createRole,
  deleteRole,
  getRoles,
  match,
  parseJd,
  recognizeRole,
  restoreRole,
  setActiveRole,
  updateJd,
  updateRole,
} from "@/services/roles"

import { RolesView, type RolesViewActions } from "./RolesView"
import {
  ROLES_QUERY_KEY,
  useJobDescriptionSynchronization,
} from "./hooks/useJobDescriptionSynchronization"
import { useMatchingAnalysisSynchronization } from "./hooks/useMatchingAnalysisSynchronization"
import { RolesActionError } from "./roles-errors"

export function RolesPage() {
  const queryClient = useQueryClient()
  const rolesQuery = useQuery({ queryFn: getRoles, queryKey: ROLES_QUERY_KEY, retry: false })
  const { clearSynchronizationError, restartSynchronization, synchronizationErrorRoleIds } =
    useJobDescriptionSynchronization(rolesQuery.data)
  const {
    clearSynchronizationError: clearMatchSynchronizationError,
    restartSynchronization: restartMatchSynchronization,
    synchronizationErrorRoleIds: matchSynchronizationErrorRoleIds,
  } = useMatchingAnalysisSynchronization(rolesQuery.data)

  const refreshRoles = () => queryClient.invalidateQueries({ queryKey: ROLES_QUERY_KEY })
  const createMutation = useMutation({
    mutationFn: (input: Parameters<typeof createRole>[0]) => createRole(input),
    onSuccess: refreshRoles,
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
    onSuccess: refreshRoles,
  })
  const parseMutation = useMutation({
    mutationFn: ({ roleId, text }: { roleId: string; text: string }) => parseJd(roleId, text),
    onSuccess: refreshRoles,
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
    } catch {
      throw new RolesActionError("requestFailed")
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
    parseJd: async (roleId, text) => {
      const result = await runMutation(parseMutation.mutateAsync, { roleId, text })
      clearSynchronizationError(roleId)
      return result
    },
    setActiveRole: (roleId) => runMutation(setActiveMutation.mutateAsync, roleId),
    updateJd: async (roleId, input) => {
      const result = await runMutation(updateJdMutation.mutateAsync, { roleId, input })
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
