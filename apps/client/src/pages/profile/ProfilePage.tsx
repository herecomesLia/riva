import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import type { CareerProfileResponse } from "@/api/generated/models"
import { createProfile, getProfile, importResume, updateProfile } from "@/services/profile"

import { ProfileView, type ProfileViewActions } from "./ProfileView"

const profileQueryKey = ["profile"] as const

export function ProfilePage() {
  const queryClient = useQueryClient()
  const profileQuery = useQuery({
    queryFn: getProfile,
    queryKey: profileQueryKey,
    retry: false,
  })

  function storeProfile(profile: CareerProfileResponse) {
    queryClient.setQueryData(profileQueryKey, profile)
    return profile
  }

  const createMutation = useMutation({ mutationFn: createProfile, onSuccess: storeProfile })
  const updateMutation = useMutation({ mutationFn: updateProfile, onSuccess: storeProfile })
  const importMutation = useMutation({ mutationFn: importResume, onSuccess: storeProfile })

  const actions: ProfileViewActions = {
    createProfile: () => createMutation.mutateAsync(),
    importResume: (input) => importMutation.mutateAsync(input),
    updateProfile: (input) => updateMutation.mutateAsync(input),
  }

  if (profileQuery.data !== undefined) {
    return (
      <ProfileView
        actions={actions}
        content={{ status: "ready", data: profileQuery.data }}
        variant="default"
      />
    )
  }

  if (profileQuery.isFetching) {
    return <ProfileView content={{ status: "loading" }} variant="default" />
  }

  if (profileQuery.isError) {
    return <ProfileView onRetry={() => void profileQuery.refetch()} variant="error" />
  }

  return <ProfileView content={{ status: "loading" }} variant="default" />
}
