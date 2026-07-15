import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import type { JobProfileSnapshot } from "@/models/profile"
import {
  createManualJobProfile,
  getJobProfile,
  resetInitialResumeImport,
  saveProfileSection,
  startInitialResumeRecognition,
  startUpdatedResumeRecognition,
  uploadInitialResume,
  uploadUpdatedResume,
} from "@/services/profile"

import { ProfileView, type ProfileViewActions } from "./ProfileView"

const profileQueryKey = ["profile"] as const

export function ProfilePage() {
  const queryClient = useQueryClient()
  const profileQuery = useQuery({
    queryFn: getJobProfile,
    queryKey: profileQueryKey,
    retry: false,
  })

  function setSnapshot(snapshot: JobProfileSnapshot) {
    queryClient.setQueryData(profileQueryKey, snapshot)
    return snapshot
  }

  function setProfile(profile: NonNullable<JobProfileSnapshot["profile"]>) {
    queryClient.setQueryData<JobProfileSnapshot>(profileQueryKey, (snapshot) =>
      snapshot ? { ...snapshot, profile } : snapshot,
    )
    return profile
  }

  const saveMutation = useMutation({
    mutationFn: saveProfileSection,
    onSuccess: setProfile,
  })
  const recognitionMutation = useMutation({
    mutationFn: ({ profileId, resumeId }: { profileId: string; resumeId: string }) =>
      startInitialResumeRecognition(profileId, resumeId),
    onSuccess: setSnapshot,
  })
  const uploadInitialMutation = useMutation({
    mutationFn: async (input: Parameters<typeof uploadInitialResume>[0]) => {
      const uploading = setSnapshot(await uploadInitialResume(input))
      const profile = uploading.profile
      if (!profile?.resume) throw new Error("Resume upload returned no profile.")
      return recognitionMutation.mutateAsync({
        profileId: profile.profileId,
        resumeId: profile.resume.id,
      })
    },
  })
  const uploadUpdatedMutation = useMutation({
    mutationFn: async (input: Parameters<typeof uploadUpdatedResume>[0]) => {
      const uploading = setSnapshot(await uploadUpdatedResume(input))
      const profile = uploading.profile
      const resumeUpdate = uploading.resumeUpdate
      if (!profile || !resumeUpdate) throw new Error("Resume update returned no result.")
      return setSnapshot(await startUpdatedResumeRecognition(profile.profileId, resumeUpdate.id))
    },
  })
  const manualProfileMutation = useMutation({
    mutationFn: createManualJobProfile,
    onSuccess: setSnapshot,
  })
  const resetInitialImportMutation = useMutation({
    mutationFn: ({ profileId, resumeId }: { profileId: string; resumeId: string }) =>
      resetInitialResumeImport(profileId, resumeId),
    onSuccess: setSnapshot,
  })

  const actions: ProfileViewActions = {
    createManualProfile: () => manualProfileMutation.mutateAsync(),
    resetInitialResumeImport: (profileId, resumeId) =>
      resetInitialImportMutation.mutateAsync({ profileId, resumeId }),
    retryRecognition: (profileId, resumeId) =>
      recognitionMutation.mutateAsync({ profileId, resumeId }),
    saveSection: (input) => saveMutation.mutateAsync(input),
    uploadInitialResume: (input) => uploadInitialMutation.mutateAsync(input),
    uploadUpdatedResume: (input) => uploadUpdatedMutation.mutateAsync(input),
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
