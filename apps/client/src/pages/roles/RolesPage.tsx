import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"

import { useAuthenticationInvalidation } from "@/hooks/use-authentication-invalidation"
import type { RolesPageResponse } from "@/models/roles"
import {
  archiveTargetRole,
  createTargetRole,
  deleteTargetRole,
  generateMatchingAnalysis,
  getRolesPage,
  saveJobDescription,
  rolesCapabilities,
  setCurrentTargetRole,
  startJobDescriptionParsing,
  updateJobDescriptionAnalysisModule,
  updateRolePreparationStatus,
  updateTargetRole,
} from "@/services/roles"
import { ApiError } from "@/services/api"

import { RolesView, type RolesViewActions } from "./RolesView"
import {
  ROLES_QUERY_KEY,
  useJobDescriptionSynchronization,
} from "./hooks/useJobDescriptionSynchronization"
import { useMatchingAnalysisSynchronization } from "./hooks/useMatchingAnalysisSynchronization"
import { RolesActionError } from "./roles-errors"

export function RolesPage() {
  const queryClient = useQueryClient()
  const invalidateAuthentication = useAuthenticationInvalidation()
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
  const preparationMutation = useMutation({
    mutationFn: updateRolePreparationStatus,
    onSuccess: setRolesResponse,
  })
  const archiveMutation = useMutation({
    mutationFn: archiveTargetRole,
    onSuccess: setRolesResponse,
  })
  const deleteMutation = useMutation({ mutationFn: deleteTargetRole, onSuccess: setRolesResponse })
  const generateMatchingAnalysisMutation = useMutation({ mutationFn: generateMatchingAnalysis })
  const saveJobDescriptionMutation = useMutation({ mutationFn: saveJobDescription })
  const retryJobDescriptionParsingMutation = useMutation({
    mutationFn: startJobDescriptionParsing,
  })
  const updateJobDescriptionAnalysisModuleMutation = useMutation({
    mutationFn: updateJobDescriptionAnalysisModule,
  })

  useEffect(() => {
    invalidateAuthentication(rolesQuery.error)
  }, [invalidateAuthentication, rolesQuery.error])

  async function runMutation<Input>(
    mutate: (input: Input) => Promise<RolesPageResponse>,
    input: Input,
  ) {
    try {
      return await mutate(input)
    } catch (error) {
      if (
        error instanceof ApiError &&
        (error.code === "target_role_version_conflict" || error.code === "target_role_not_found")
      ) {
        await queryClient.refetchQueries({ exact: true, queryKey: ROLES_QUERY_KEY })
      }
      if (invalidateAuthentication(error)) throw error
      throw new RolesActionError(
        error instanceof ApiError && error.code === "target_role_version_conflict"
          ? "versionConflict"
          : "requestFailed",
      )
    }
  }

  const actions: RolesViewActions = {
    archiveTargetRole: (input) => runMutation(archiveMutation.mutateAsync, input),
    createTargetRole: (input) => runMutation(createMutation.mutateAsync, input),
    deleteTargetRole: (input) => runMutation(deleteMutation.mutateAsync, input),
    ...(rolesCapabilities.matchingAnalysis && {
      generateMatchingAnalysis: async (input) => {
        const response = await runMutation(generateMatchingAnalysisMutation.mutateAsync, input)
        setRolesResponse(response)
        clearMatchingAnalysisSynchronizationError(input.roleId)
        return response
      },
    }),
    ...(rolesCapabilities.jobDescriptionAnalysis && {
      retryJobDescriptionParsing: async (input) => {
        const response = await runMutation(retryJobDescriptionParsingMutation.mutateAsync, input)
        setRolesResponse(response)
        clearSynchronizationError(input.roleId)
        return response
      },
      retryJobDescriptionSynchronization: async (input) => {
        const response = restartSynchronization(input)
        if (!response) throw new RolesActionError("requestFailed")
        return response
      },
    }),
    ...(rolesCapabilities.matchingAnalysis && {
      retryMatchingAnalysisSynchronization: async (input) => {
        const response = restartMatchingAnalysisSynchronization(input)
        if (!response) throw new RolesActionError("requestFailed")
        return response
      },
    }),
    saveJobDescription: async (input) => {
      const response = await runMutation(saveJobDescriptionMutation.mutateAsync, input)
      setRolesResponse(response)
      clearSynchronizationError(input.roleId)
      return response
    },
    setCurrentTargetRole: (input) => runMutation(setCurrentMutation.mutateAsync, input),
    ...(rolesCapabilities.jobDescriptionAnalysis && {
      updateJobDescriptionAnalysisModule: async (input) => {
        const response = await runMutation(
          updateJobDescriptionAnalysisModuleMutation.mutateAsync,
          input,
        )
        setRolesResponse(response)
        clearMatchingAnalysisSynchronizationError(input.roleId)
        return response
      },
    }),
    updateRolePreparationStatus: (input) => runMutation(preparationMutation.mutateAsync, input),
    updateTargetRole: (input) => runMutation(updateMutation.mutateAsync, input),
  }

  if (rolesQuery.data !== undefined) {
    return (
      <RolesView
        actions={actions}
        content={{ status: "ready", data: rolesQuery.data }}
        jobDescriptionSynchronizationErrorRoleIds={synchronizationErrorRoleIds}
        matchingAnalysisSynchronizationErrorRoleIds={matchingAnalysisSynchronizationErrorRoleIds}
        matchingAnalysisAvailable={rolesCapabilities.matchingAnalysis}
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
