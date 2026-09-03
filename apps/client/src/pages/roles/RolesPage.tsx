import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import type { RolesPageResponse } from "@/models/roles"
import {
  archiveTargetRole,
  createTargetRole,
  deleteTargetRole,
  generateMatchingAnalysis,
  getRolesPage,
  saveJobDescription,
  recognizeTargetRole,
  restoreTargetRole,
  setCurrentTargetRole,
  updateJobDescriptionAnalysisModule,
  updateTargetRole,
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
  const rolesQuery = useQuery({
    queryFn: getRolesPage,
    queryKey: ROLES_QUERY_KEY,
    retry: false,
  })
  const { clearSynchronizationError, restartSynchronization, synchronizationErrorRoleIds } =
    useJobDescriptionSynchronization(rolesQuery.data)
  const {
    clearSynchronizationError: clearMatchingAnalysisSynchronizationError,
    restartSynchronization: restartMatchingAnalysisSynchronization,
    synchronizationErrorRoleIds: matchingAnalysisSynchronizationErrorRoleIds,
  } = useMatchingAnalysisSynchronization(rolesQuery.data)

  function setRolesResponse(response: RolesPageResponse) {
    queryClient.setQueryData(ROLES_QUERY_KEY, response)
    return response
  }

  const createMutation = useMutation({ mutationFn: createTargetRole, onSuccess: setRolesResponse })
  const updateMutation = useMutation({ mutationFn: updateTargetRole, onSuccess: setRolesResponse })
  const setCurrentMutation = useMutation({
    mutationFn: setCurrentTargetRole,
    onSuccess: setRolesResponse,
  })
  const archiveMutation = useMutation({
    mutationFn: archiveTargetRole,
    onSuccess: setRolesResponse,
  })
  const restoreMutation = useMutation({
    mutationFn: restoreTargetRole,
    onSuccess: setRolesResponse,
  })
  const deleteMutation = useMutation({ mutationFn: deleteTargetRole, onSuccess: setRolesResponse })
  const generateMatchingAnalysisMutation = useMutation({ mutationFn: generateMatchingAnalysis })
  const updateJobDescriptionAnalysisModuleMutation = useMutation({
    mutationFn: updateJobDescriptionAnalysisModule,
  })
  async function runMutation<Input>(
    mutate: (input: Input) => Promise<RolesPageResponse>,
    input: Input,
  ) {
    try {
      return await mutate(input)
    } catch (error) {
      throw new RolesActionError(
        error instanceof Error && error.message.endsWith("version is out of date.")
          ? "versionConflict"
          : "requestFailed",
      )
    }
  }

  const actions: RolesViewActions = {
    archiveTargetRole: (input) => runMutation(archiveMutation.mutateAsync, input),
    createTargetRole: (input) => runMutation(createMutation.mutateAsync, input),
    deleteTargetRole: (input) => runMutation(deleteMutation.mutateAsync, input),
    generateMatchingAnalysis: async (input) => {
      const response = await runMutation(generateMatchingAnalysisMutation.mutateAsync, input)
      setRolesResponse(response)
      clearMatchingAnalysisSynchronizationError(input.roleId)
      return response
    },
    retryJobDescriptionSynchronization: async (input) => {
      const response = restartSynchronization(input)
      if (!response) throw new RolesActionError("requestFailed")
      return response
    },
    retryMatchingAnalysisSynchronization: async (input) => {
      const response = restartMatchingAnalysisSynchronization(input)
      if (!response) throw new RolesActionError("requestFailed")
      return response
    },
    recognizeTargetRole: async (input) => {
      const response = await runMutation(recognizeTargetRole, input)
      setRolesResponse(response)
      return response
    },
    restoreTargetRole: (input) => runMutation(restoreMutation.mutateAsync, input),
    saveJobDescription: async (input) => {
      const response = await runMutation(saveJobDescription, input)
      setRolesResponse(response)
      clearSynchronizationError(input.roleId)
      return response
    },
    setCurrentTargetRole: (input) => runMutation(setCurrentMutation.mutateAsync, input),
    updateJobDescriptionAnalysisModule: async (input) => {
      const response = await runMutation(
        updateJobDescriptionAnalysisModuleMutation.mutateAsync,
        input,
      )
      setRolesResponse(response)
      clearMatchingAnalysisSynchronizationError(input.roleId)
      return response
    },
    updateTargetRole: (input) => runMutation(updateMutation.mutateAsync, input),
  }

  if (rolesQuery.data !== undefined) {
    return (
      <RolesView
        actions={actions}
        content={{ status: "ready", data: rolesQuery.data }}
        jobDescriptionSynchronizationErrorRoleIds={synchronizationErrorRoleIds}
        matchingAnalysisSynchronizationErrorRoleIds={matchingAnalysisSynchronizationErrorRoleIds}
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
