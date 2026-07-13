import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import type { JobProfileSnapshot } from "@/models/profile"
import {
  cancelResumeRecognitionReview,
  cancelResumeUpdate,
  confirmResumeUpdate,
  createManualJobProfile,
  getJobProfile,
  regenerateMatchingAnalysis,
  saveProfileSection,
  startInitialResumeRecognition,
  startUpdatedResumeRecognition,
  submitResumeRecognitionConfirmation,
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
      if (!profile || !resumeUpdate) throw new Error("Resume update returned no review.")
      return setSnapshot(
        await startUpdatedResumeRecognition({
          profileId: profile.profileId,
          resumeUpdateId: resumeUpdate.id,
        }),
      )
    },
  })
  const manualProfileMutation = useMutation({
    mutationFn: createManualJobProfile,
    onSuccess: setSnapshot,
  })
  const cancelRecognitionMutation = useMutation({
    mutationFn: ({ profileId, resumeId }: { profileId: string; resumeId: string }) =>
      cancelResumeRecognitionReview(profileId, resumeId),
    onSuccess: setSnapshot,
  })
  const confirmRecognitionMutation = useMutation({
    mutationFn: submitResumeRecognitionConfirmation,
    onSuccess: setProfile,
  })
  const confirmUpdateMutation = useMutation({
    mutationFn: confirmResumeUpdate,
    onSuccess: setProfile,
  })
  const cancelUpdateMutation = useMutation({
    mutationFn: cancelResumeUpdate,
    onSuccess: setSnapshot,
  })
  const analysisMutation = useMutation({
    mutationFn: regenerateMatchingAnalysis,
    onSuccess: (matchingAnalysis) => {
      queryClient.setQueryData<JobProfileSnapshot>(profileQueryKey, (snapshot) =>
        snapshot?.profile
          ? {
              ...snapshot,
              matchingAnalysis,
              profile: { ...snapshot.profile, matchingAnalysisStale: false },
            }
          : snapshot,
      )
    },
  })

  const actions: ProfileViewActions = {
    cancelRecognition: (profileId, resumeId) =>
      cancelRecognitionMutation.mutateAsync({ profileId, resumeId }),
    cancelResumeUpdate: (input) => cancelUpdateMutation.mutateAsync(input),
    confirmRecognition: (input) => confirmRecognitionMutation.mutateAsync(input),
    confirmResumeUpdate: (input) => confirmUpdateMutation.mutateAsync(input),
    createManualProfile: () => manualProfileMutation.mutateAsync(),
    regenerateMatchingAnalysis: (profileId) => analysisMutation.mutateAsync(profileId),
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
        pending={{
          analysis: analysisMutation.isPending,
          cancelUpdate: cancelUpdateMutation.isPending,
          confirmUpdate: confirmUpdateMutation.isPending,
        }}
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
