import { useMutation, useQueryClient } from "@tanstack/react-query"

import type { CareerProfileResponse } from "@/api/generated/models"
import { rolesQueryKey } from "@/pages/roles/queries"
import {
  createCareerProfile,
  updateCareerProfile,
  extractCareerProfileFromText,
  retryCareerProfileExtraction,
  abortCareerProfileExtraction,
} from "@/services/profile"

import { ProfileView, type ProfileViewActions } from "./ProfileView"
import {
  careerProfileQueryKey,
  careerProfileExtractionStateQueryKey,
  useCareerProfileQueries,
} from "./hooks/useCareerProfileQueries"

export function ProfilePage() {
  const queryClient = useQueryClient()
  const { careerProfileQuery, careerProfileExtractionStateQuery } = useCareerProfileQueries()

  async function storeCareerProfile(profile: CareerProfileResponse) {
    queryClient.setQueryData(careerProfileQueryKey, profile)
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: rolesQueryKey, exact: true }),
      queryClient.invalidateQueries({ queryKey: careerProfileExtractionStateQueryKey }),
    ])
  }

  const createCareerProfileMutation = useMutation({
    mutationFn: createCareerProfile,
    onSuccess: storeCareerProfile,
  })
  const updateCareerProfileMutation = useMutation({
    mutationFn: updateCareerProfile,
    onSuccess: storeCareerProfile,
  })
  const extractCareerProfileFromTextMutation = useMutation({
    mutationFn: extractCareerProfileFromText,
  })
  const retryCareerProfileExtractionMutation = useMutation({
    mutationFn: retryCareerProfileExtraction,
  })
  const abortCareerProfileExtractionMutation = useMutation({
    mutationFn: abortCareerProfileExtraction,
  })

  async function runExtractionCommand(command: () => Promise<void>) {
    await queryClient.cancelQueries({ queryKey: careerProfileExtractionStateQueryKey })
    try {
      await command()
    } finally {
      await queryClient.invalidateQueries({ queryKey: careerProfileExtractionStateQueryKey })
    }
  }

  const actions: ProfileViewActions = {
    createCareerProfile: (input) => createCareerProfileMutation.mutateAsync(input),
    updateCareerProfile: (input) => updateCareerProfileMutation.mutateAsync(input),
    extractCareerProfileFromText: (input) =>
      runExtractionCommand(() => extractCareerProfileFromTextMutation.mutateAsync(input)),
    retryCareerProfileExtraction: () =>
      runExtractionCommand(() => retryCareerProfileExtractionMutation.mutateAsync()),
    abortCareerProfileExtraction: () =>
      runExtractionCommand(() => abortCareerProfileExtractionMutation.mutateAsync()),
    retryCareerProfileExtractionState: () =>
      queryClient.refetchQueries(
        { queryKey: careerProfileExtractionStateQueryKey },
        { throwOnError: true },
      ),
  }

  if (careerProfileQuery.data !== undefined) {
    return (
      <ProfileView
        variant="default"
        profile={careerProfileQuery.data}
        extractionState={careerProfileExtractionStateQuery.data}
        extractionStateError={
          careerProfileExtractionStateQuery.isError || careerProfileQuery.isError
        }
        actions={actions}
      />
    )
  }
  if (careerProfileQuery.isFetching) return <ProfileView variant="loading" />
  if (careerProfileQuery.isError) {
    return <ProfileView variant="error" onRetry={() => void careerProfileQuery.refetch()} />
  }
  return <ProfileView variant="loading" />
}
