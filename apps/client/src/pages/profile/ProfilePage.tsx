import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

import type { JobProfileSnapshot, ResumeUploadInput } from "@/models/profile"
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

type ProfileSynchronizationError = "initialRecognition" | "resumeUpdate"

export function ProfilePage() {
  const queryClient = useQueryClient()
  const [synchronizationError, setSynchronizationError] =
    useState<ProfileSynchronizationError | null>(null)
  const [showInitialImportFeedback, setShowInitialImportFeedback] = useState(false)
  const profileQuery = useQuery({
    queryFn: getJobProfile,
    queryKey: profileQueryKey,
    retry: false,
  })

  function setSnapshot(snapshot: JobProfileSnapshot) {
    queryClient.setQueryData(profileQueryKey, snapshot)
    return snapshot
  }

  async function refreshSnapshotBestEffort(fallback: JobProfileSnapshot) {
    try {
      return { snapshot: setSnapshot(await getJobProfile()), synchronized: true }
    } catch {
      try {
        return { snapshot: setSnapshot(await getJobProfile()), synchronized: true }
      } catch {
        return { snapshot: fallback, synchronized: false }
      }
    }
  }

  async function synchronizeRecognition(
    fallback: JobProfileSnapshot,
    task: ProfileSynchronizationError,
  ) {
    const result = await refreshSnapshotBestEffort(fallback)
    setSynchronizationError(result.synchronized ? null : task)
    return result.snapshot
  }

  function finishInitialImport(snapshot: JobProfileSnapshot) {
    if (
      snapshot.profile?.status === "active" &&
      snapshot.recognition?.processingStatus === "succeeded" &&
      snapshot.resumeUpdate === null
    ) {
      setShowInitialImportFeedback(true)
    }
    return snapshot
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
      return finishInitialImport(await synchronizeRecognition(latest, "initialRecognition"))
    }
    return finishInitialImport(await synchronizeRecognition(latest, "initialRecognition"))
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
      return synchronizeRecognition(latest, "resumeUpdate")
    }
    return synchronizeRecognition(latest, "resumeUpdate")
  }

  const saveMutation = useMutation({
    mutationFn: saveProfileSection,
    onSuccess: async (snapshot) => {
      setSnapshot(snapshot)
      const cachedSnapshot = queryClient.getQueryData<JobProfileSnapshot>(profileQueryKey)
      if (cachedSnapshot) await refreshSnapshotBestEffort(cachedSnapshot)
    },
  })
  const recognitionMutation = useMutation({
    mutationFn: ({ profileId, resumeId }: { profileId: string; resumeId: string }) => {
      const fallback = queryClient.getQueryData<JobProfileSnapshot>(profileQueryKey)
      if (!fallback) throw new Error("Job profile is not available.")
      setSynchronizationError(null)
      setShowInitialImportFeedback(false)
      return advanceInitialRecognition(profileId, resumeId, fallback)
    },
  })
  const uploadInitialMutation = useMutation({
    mutationFn: async (input: ResumeUploadInput) => {
      setSynchronizationError(null)
      setShowInitialImportFeedback(false)
      const snapshot = setSnapshot(await uploadInitialResume(input))
      const profile = snapshot.profile
      if (!profile?.resume) throw new Error("Resume upload returned no profile.")
      return advanceInitialRecognition(profile.profileId, profile.resume.id, snapshot)
    },
  })
  const uploadUpdatedMutation = useMutation({
    mutationFn: async (input: ResumeUploadInput) => {
      setSynchronizationError(null)
      setShowInitialImportFeedback(false)
      const snapshot = setSnapshot(await uploadUpdatedResume(input))
      const profile = snapshot.profile
      const resumeUpdate = snapshot.resumeUpdate
      if (!profile || !resumeUpdate) throw new Error("Resume update returned no result.")
      return advanceUpdatedResumeRecognition(profile.profileId, resumeUpdate.id, snapshot)
    },
  })
  const manualProfileMutation = useMutation({
    mutationFn: createManualJobProfile,
    onMutate: () => {
      setSynchronizationError(null)
      setShowInitialImportFeedback(false)
    },
    onSuccess: setSnapshot,
  })
  const resetInitialImportMutation = useMutation({
    mutationFn: ({ profileId, resumeId }: { profileId: string; resumeId: string }) =>
      resetInitialResumeImport(profileId, resumeId),
    onMutate: () => {
      setSynchronizationError(null)
      setShowInitialImportFeedback(false)
    },
    onSuccess: setSnapshot,
  })

  async function retrySynchronization() {
    const snapshot = queryClient.getQueryData<JobProfileSnapshot>(profileQueryKey)
    const profile = snapshot?.profile
    if (!snapshot || !profile) return

    if (
      snapshot.resumeUpdate?.status === "uploading" ||
      snapshot.resumeUpdate?.status === "parsing"
    ) {
      setSynchronizationError(null)
      return advanceUpdatedResumeRecognition(profile.profileId, snapshot.resumeUpdate.id, snapshot)
    }
    if (profile.resume) {
      setSynchronizationError(null)
      return advanceInitialRecognition(profile.profileId, profile.resume.id, snapshot)
    }
  }

  const actions: ProfileViewActions = {
    createManualProfile: () => manualProfileMutation.mutateAsync(),
    resetInitialResumeImport: (profileId, resumeId) =>
      resetInitialImportMutation.mutateAsync({ profileId, resumeId }),
    retryRecognition: (profileId, resumeId) =>
      recognitionMutation.mutateAsync({ profileId, resumeId }),
    retrySynchronization,
    saveSection: (input) => saveMutation.mutateAsync(input),
    uploadInitialResume: (input) => uploadInitialMutation.mutateAsync(input),
    uploadUpdatedResume: (input) => uploadUpdatedMutation.mutateAsync(input),
  }

  if (profileQuery.data !== undefined) {
    return (
      <ProfileView
        actions={actions}
        content={{
          status: "ready",
          data: profileQuery.data,
          showInitialImportFeedback,
          synchronizationError,
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
