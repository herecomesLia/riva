import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import type { JobProfileSnapshot } from "@/models/profile"
import {
  createManualJobProfile,
  getJobProfile,
  getResumeRecognitionStatus,
  getResumeUpdateStatus,
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

  async function refreshSnapshotBestEffort(fallback: JobProfileSnapshot) {
    try {
      return setSnapshot(await getJobProfile())
    } catch {
      try {
        return setSnapshot(await getJobProfile())
      } catch {
        return fallback
      }
    }
  }

  async function advanceInitialRecognition(
    profileId: string,
    resumeId: string,
    fallback: JobProfileSnapshot,
  ) {
    let latest = fallback
    try {
      latest = setSnapshot(await startInitialResumeRecognition(profileId, resumeId))
      await getResumeRecognitionStatus(profileId, resumeId)
    } catch {
      return refreshSnapshotBestEffort(latest)
    }
    return refreshSnapshotBestEffort(latest)
  }

  async function advanceUpdatedResumeRecognition(
    profileId: string,
    resumeUpdateId: string,
    fallback: JobProfileSnapshot,
  ) {
    let latest = fallback
    try {
      latest = setSnapshot(await startUpdatedResumeRecognition(profileId, resumeUpdateId))
      await getResumeUpdateStatus(profileId, resumeUpdateId)
    } catch {
      return refreshSnapshotBestEffort(latest)
    }
    return refreshSnapshotBestEffort(latest)
  }

  const saveMutation = useMutation({
    mutationFn: saveProfileSection,
    onSuccess: async (profile) => {
      setProfile(profile)
      const snapshot = queryClient.getQueryData<JobProfileSnapshot>(profileQueryKey)
      if (snapshot) await refreshSnapshotBestEffort(snapshot)
    },
  })
  const recognitionMutation = useMutation({
    mutationFn: ({ profileId, resumeId }: { profileId: string; resumeId: string }) => {
      const fallback = queryClient.getQueryData<JobProfileSnapshot>(profileQueryKey)
      if (!fallback) throw new Error("Job profile is not available.")
      return advanceInitialRecognition(profileId, resumeId, fallback)
    },
  })
  const uploadInitialMutation = useMutation({
    mutationFn: async (input) => {
      const snapshot = setSnapshot(await uploadInitialResume(input))
      const profile = snapshot.profile
      if (!profile?.resume) throw new Error("Resume upload returned no profile.")
      return advanceInitialRecognition(profile.profileId, profile.resume.id, snapshot)
    },
  })
  const uploadUpdatedMutation = useMutation({
    mutationFn: async (input) => {
      const snapshot = setSnapshot(await uploadUpdatedResume(input))
      const profile = snapshot.profile
      const resumeUpdate = snapshot.resumeUpdate
      if (!profile || !resumeUpdate) throw new Error("Resume update returned no result.")
      return advanceUpdatedResumeRecognition(profile.profileId, resumeUpdate.id, snapshot)
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
