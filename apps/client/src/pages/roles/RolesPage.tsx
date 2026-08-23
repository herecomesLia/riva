import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect } from "react"

import { useAuthenticationInvalidation } from "@/hooks/use-authentication-invalidation"
import type { RolesPageResponse } from "@/models/roles"
import {
  applyJobDescriptionImportDraft,
  createJobDescriptionImportDraft,
} from "@/services/job-description-import"
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
import { RolesActionError } from "./roles-errors"

export const ROLES_QUERY_KEY = ["roles"] as const

export function RolesPage() {
  const queryClient = useQueryClient()
  const invalidateAuthentication = useAuthenticationInvalidation()
  const rolesQuery = useQuery({
    queryFn: getRolesPage,
    queryKey: ROLES_QUERY_KEY,
    retry: false,
  })

  const setRolesResponse = useCallback(
    (response: RolesPageResponse) => {
      queryClient.setQueryData(ROLES_QUERY_KEY, response)
      return response
    },
    [queryClient],
  )

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
  const startJobDescriptionParsingMutation = useMutation({
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

  const runImportDraftRequest = useCallback(
    async <Output,>(request: () => Promise<Output>) => {
      try {
        return await request()
      } catch (error) {
        invalidateAuthentication(error)
        throw error
      }
    },
    [invalidateAuthentication],
  )
  const createImportDraft = useCallback(
    (input: Parameters<typeof createJobDescriptionImportDraft>[0]) =>
      runImportDraftRequest(() => createJobDescriptionImportDraft(input)),
    [runImportDraftRequest],
  )
  const applyImportDraft = useCallback(
    (draftId: string) => runImportDraftRequest(() => applyJobDescriptionImportDraft(draftId)),
    [runImportDraftRequest],
  )
  const refreshRolesAfterImport = useCallback(
    async (roleId: string) => {
      try {
        const response = await getRolesPage()
        if (!response.roles.some((role) => role.id === roleId)) {
          throw new RolesActionError("requestFailed")
        }
        return setRolesResponse(response)
      } catch (error) {
        invalidateAuthentication(error)
        throw error
      }
    },
    [invalidateAuthentication, setRolesResponse],
  )

  const actions: RolesViewActions = {
    archiveTargetRole: (input) => runMutation(archiveMutation.mutateAsync, input),
    createTargetRole: (input) => runMutation(createMutation.mutateAsync, input),
    deleteTargetRole: (input) => runMutation(deleteMutation.mutateAsync, input),
    ...(rolesCapabilities.matchingAnalysis && {
      generateMatchingAnalysis: async (input) => {
        const response = await runMutation(generateMatchingAnalysisMutation.mutateAsync, input)
        setRolesResponse(response)
        return response
      },
    }),
    ...(rolesCapabilities.jobDescriptionAnalysis && {
      startJobDescriptionParsing: async (input) => {
        const response = await runMutation(startJobDescriptionParsingMutation.mutateAsync, input)
        setRolesResponse(response)
        return response
      },
    }),
    saveJobDescription: async (input) => {
      const savedResponse = await runMutation(saveJobDescriptionMutation.mutateAsync, input)
      setRolesResponse(savedResponse)

      const savedRole = savedResponse.roles.find((role) => role.id === input.roleId)
      if (!savedRole) throw new RolesActionError("requestFailed")
      if (savedRole.jobDescription.status !== "saved") return savedResponse

      const parsingResponse = await runMutation(startJobDescriptionParsingMutation.mutateAsync, {
        jobDescriptionVersion: savedRole.jobDescription.version,
        roleId: savedRole.id,
        version: savedRole.version,
      })
      setRolesResponse(parsingResponse)
      return parsingResponse
    },
    jobDescriptionImport: {
      applyDraft: applyImportDraft,
      createDraft: createImportDraft,
      refreshRoles: refreshRolesAfterImport,
    },
    setCurrentTargetRole: (input) => runMutation(setCurrentMutation.mutateAsync, input),
    ...(rolesCapabilities.jobDescriptionAnalysis && {
      updateJobDescriptionAnalysisModule: async (input) => {
        const response = await runMutation(
          updateJobDescriptionAnalysisModuleMutation.mutateAsync,
          input,
        )
        setRolesResponse(response)
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
