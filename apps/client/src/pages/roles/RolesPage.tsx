import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import type { RolesPageResponse } from "@/models/roles"
import {
  archiveTargetRole,
  createTargetRole,
  deleteTargetRole,
  getRolesPage,
  setCurrentTargetRole,
  updateRolePreparationStatus,
  updateTargetRole,
} from "@/services/roles"

import { RolesView, type RolesViewActions } from "./RolesView"
import { RolesActionError } from "./roles-errors"

const rolesQueryKey = ["roles"] as const

export function RolesPage() {
  const queryClient = useQueryClient()
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
    setCurrentTargetRole: (input) => runMutation(setCurrentMutation.mutateAsync, input),
    updateRolePreparationStatus: (input) => runMutation(preparationMutation.mutateAsync, input),
    updateTargetRole: (input) => runMutation(updateMutation.mutateAsync, input),
  }

  if (rolesQuery.data !== undefined) {
    return (
      <RolesView
        actions={actions}
        content={{ status: "ready", data: rolesQuery.data }}
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
