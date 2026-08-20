import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"

import { useAuthenticationInvalidation } from "@/hooks/use-authentication-invalidation"
import { useAgentPolling } from "@/lib/agent-polling"
import type {
  JobProfileSnapshot,
  ResumeImportDraft,
  ResumeParsingStatus,
  ResumeUploadInput,
} from "@/models/profile"
import { ApiError } from "@/services/api"
import {
  applyResumeImportDraft,
  createManualJobProfile,
  getJobProfile,
  getResumeImportDraft,
  getResumeParsingStatus,
  listResumeDocuments,
  profileCapabilities,
  retryResumeParsing,
  saveProfileSection,
  startResumeParsing,
  uploadResume,
} from "@/services/profile"

import { ProfileView, type ProfileViewActions } from "./ProfileView"
import type {
  ProfileResumeApplyConflict,
  ProfileResumeWorkflowMode,
  ProfileResumeWorkflowState,
} from "./profile-resume-workflow"

const profileQueryKey = ["profile"] as const
const resumeDocumentsQueryKey = ["profile", "resumeDocuments"] as const
const rolesQueryKey = ["roles"] as const

function resumeParsingQueryKey(resumeId: string) {
  return ["profile", "resumeParsing", resumeId] as const
}

function resumeDraftQueryKey(resumeId: string) {
  return ["profile", "resumeImportDraft", resumeId] as const
}

type ActiveResume = {
  id: string
  mode: ProfileResumeWorkflowMode
}

export function ProfilePage() {
  const queryClient = useQueryClient()
  const invalidateAuthentication = useAuthenticationInvalidation()
  const [activeResume, setActiveResume] = useState<ActiveResume | null>(null)
  const [pendingUploadMode, setPendingUploadMode] = useState<ProfileResumeWorkflowMode | null>(null)
  const [resumeSynchronizationError, setResumeSynchronizationError] = useState(false)
  const [resumeApplyConflict, setResumeApplyConflict] = useState<ProfileResumeApplyConflict | null>(
    null,
  )
  const [resumeApplyError, setResumeApplyError] = useState(false)

  const profileQuery = useQuery({
    queryFn: getJobProfile,
    queryKey: profileQueryKey,
    retry: false,
  })

  const resumeDocumentsQuery = useQuery({
    queryFn: () => listResumeDocuments(1),
    queryKey: resumeDocumentsQueryKey,
    retry: false,
  })
  const hasResumeDocuments = (resumeDocumentsQuery.data?.length ?? 0) > 0
  const cachedParsing = activeResume
    ? queryClient.getQueryData<ResumeParsingStatus>(resumeParsingQueryKey(activeResume.id))
    : undefined
  const parsingOperationKey =
    activeResume && (cachedParsing?.status === "queued" || cachedParsing?.status === "running")
      ? `resume-parsing:${activeResume.id}`
      : null
  const parsingPolling = useAgentPolling(parsingOperationKey)

  useEffect(() => {
    invalidateAuthentication(profileQuery.error)
  }, [invalidateAuthentication, profileQuery.error])

  useEffect(() => {
    invalidateAuthentication(resumeDocumentsQuery.error)
  }, [invalidateAuthentication, resumeDocumentsQuery.error])

  function setSnapshot(snapshot: JobProfileSnapshot) {
    queryClient.setQueryData(profileQueryKey, snapshot)
    return snapshot
  }

  const parsingQuery = useQuery({
    enabled: activeResume !== null && !resumeSynchronizationError && !parsingPolling.isTimedOut,
    queryFn: () => getResumeParsingStatus(activeResume!.id),
    queryKey: resumeParsingQueryKey(activeResume?.id ?? "inactive"),
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status === "queued" || status === "running"
        ? parsingPolling.getPollingInterval()
        : false
    },
    refetchIntervalInBackground: false,
    retry: false,
  })

  const draftQuery = useQuery({
    enabled:
      activeResume !== null &&
      parsingQuery.data?.status === "succeeded" &&
      !resumeSynchronizationError,
    queryFn: () => getResumeImportDraft(activeResume!.id),
    queryKey: resumeDraftQueryKey(activeResume?.id ?? "inactive"),
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    retry: false,
    staleTime: Infinity,
  })

  useEffect(() => {
    if (!parsingQuery.error || invalidateAuthentication(parsingQuery.error)) return
    setResumeSynchronizationError(true)
  }, [invalidateAuthentication, parsingQuery.error])

  useEffect(() => {
    if (!draftQuery.error || invalidateAuthentication(draftQuery.error)) return
    setResumeSynchronizationError(true)
  }, [draftQuery.error, invalidateAuthentication])

  useEffect(() => {
    if (parsingPolling.isTimedOut) setResumeSynchronizationError(true)
  }, [parsingPolling.isTimedOut])

  const saveMutation = useMutation({
    mutationFn: saveProfileSection,
    onSuccess: async (snapshot) => {
      setSnapshot(snapshot)
      await queryClient.invalidateQueries({ queryKey: rolesQueryKey })
    },
    onError: async (error) => {
      if (invalidateAuthentication(error)) return
      if (
        error instanceof ApiError &&
        error.status === 409 &&
        error.code === "profile_version_conflict"
      ) {
        await queryClient.invalidateQueries({ queryKey: profileQueryKey })
      }
    },
  })

  const resumeUploadMutation = useMutation({
    mutationFn: async ({
      input,
      mode,
    }: {
      input: ResumeUploadInput
      mode: ProfileResumeWorkflowMode
    }) => {
      setResumeSynchronizationError(false)
      setResumeApplyConflict(null)
      setResumeApplyError(false)
      const document = await uploadResume(input)
      queryClient.setQueryData(resumeDocumentsQueryKey, [document])
      try {
        const parsing = await startResumeParsing(document.id)
        queryClient.setQueryData(resumeParsingQueryKey(document.id), parsing)
        setActiveResume({ id: document.id, mode })
      } catch (error) {
        setActiveResume({ id: document.id, mode })
        setResumeSynchronizationError(true)
        throw error
      }
      return document
    },
    onError: invalidateAuthentication,
    onMutate: ({ mode }) => setPendingUploadMode(mode),
    onSettled: () => setPendingUploadMode(null),
  })

  const resumeRecoveryMutation = useMutation({
    mutationFn: async () => {
      if (!activeResume) return

      const resumeId = activeResume.id
      const current = await getResumeParsingStatus(resumeId)

      if (current.status === "succeeded") {
        const cachedDraft = queryClient.getQueryData<ResumeImportDraft>(
          resumeDraftQueryKey(resumeId),
        )

        if (cachedDraft?.status === "applied") {
          setSnapshot(await getJobProfile())
          await queryClient.invalidateQueries({ queryKey: rolesQueryKey })
          resetResumeWorkflow()
          return
        }
      }

      let nextStatus: ResumeParsingStatus

      switch (current.status) {
        case "notStarted":
          nextStatus = await startResumeParsing(resumeId)
          break

        case "failed":
          nextStatus = await retryResumeParsing(resumeId)
          break

        default:
          nextStatus = current
      }

      queryClient.setQueryData(resumeParsingQueryKey(resumeId), nextStatus)
      setResumeSynchronizationError(false)
    },
    onError: (error) => {
      if (!invalidateAuthentication(error)) setResumeSynchronizationError(true)
    },
  })

  const resumeRetryMutation = useMutation({
    mutationFn: async (resumeId: string) => {
      const parsing = await retryResumeParsing(resumeId)
      queryClient.removeQueries({ queryKey: resumeDraftQueryKey(resumeId) })
      queryClient.setQueryData(resumeParsingQueryKey(resumeId), parsing)
      setResumeApplyConflict(null)
      setResumeApplyError(false)
      setResumeSynchronizationError(false)
    },
    onError: (error) => {
      if (!invalidateAuthentication(error)) setResumeSynchronizationError(true)
    },
  })

  const resumeApplyMutation = useMutation({
    mutationFn: ({ resumeId, draftVersion }: { resumeId: string; draftVersion: number }) =>
      applyResumeImportDraft(resumeId, draftVersion),
    onSuccess: async (response, { resumeId }) => {
      queryClient.setQueryData(resumeDraftQueryKey(resumeId), response.draft)

      try {
        setSnapshot(await getJobProfile())
      } catch (error) {
        if (invalidateAuthentication(error)) {
          resetResumeWorkflow()
          return
        }

        setResumeSynchronizationError(true)
        return
      }

      await queryClient.invalidateQueries({ queryKey: rolesQueryKey })

      resetResumeWorkflow()
    },
    onError: async (error, { resumeId }) => {
      if (invalidateAuthentication(error)) return
      if (
        error instanceof ApiError &&
        error.status === 409 &&
        (error.code === "resume_import_profile_version_conflict" ||
          error.code === "resume_import_draft_version_conflict")
      ) {
        setResumeApplyConflict(error.code)
        setResumeApplyError(false)
        try {
          setSnapshot(await getJobProfile())
          const latestDraft = await getResumeImportDraft(resumeId)
          queryClient.setQueryData(resumeDraftQueryKey(resumeId), latestDraft)
        } catch (recoveryError) {
          if (!invalidateAuthentication(recoveryError)) setResumeApplyError(true)
        }
        return
      }
      if (
        error instanceof ApiError &&
        error.status === 409 &&
        error.code === "resume_import_draft_not_ready"
      ) {
        try {
          const parsing = await getResumeParsingStatus(resumeId)
          queryClient.setQueryData(resumeParsingQueryKey(resumeId), parsing)
        } catch (recoveryError) {
          invalidateAuthentication(recoveryError)
        }
        setResumeSynchronizationError(true)
        return
      }
      setResumeApplyError(true)
    },
  })

  const manualProfileMutation = useMutation({
    mutationFn: createManualJobProfile,
    onSuccess: async (snapshot) => {
      setSnapshot(snapshot)
      await queryClient.invalidateQueries({ queryKey: rolesQueryKey })
    },
    onError: invalidateAuthentication,
  })

  function resetResumeWorkflow() {
    if (activeResume) {
      queryClient.removeQueries({ queryKey: resumeParsingQueryKey(activeResume.id) })
      queryClient.removeQueries({ queryKey: resumeDraftQueryKey(activeResume.id) })
    }
    setActiveResume(null)
    setPendingUploadMode(null)
    setResumeSynchronizationError(false)
    setResumeApplyConflict(null)
    setResumeApplyError(false)
  }

  async function retryResumeWorkflow() {
    if (!activeResume) return
    const parsing = parsingQuery.data
    parsingPolling.reset()
    try {
      if (parsing?.status === "failed" && parsing.canRetry) {
        await resumeRetryMutation.mutateAsync(activeResume.id)
        return
      }
      await resumeRecoveryMutation.mutateAsync()
    } catch {
      // Mutation callbacks convert transport errors into safe workflow state.
    }
  }

  async function applyResumeDraft() {
    if (!activeResume || !draftQuery.data || resumeApplyMutation.isPending) return
    try {
      await resumeApplyMutation.mutateAsync({
        draftVersion: draftQuery.data.draftVersion,
        resumeId: activeResume.id,
      })
    } catch {
      // Mutation callbacks convert domain errors into safe workflow state.
    }
  }

  function currentSnapshot(): JobProfileSnapshot {
    const snapshot = queryClient.getQueryData<JobProfileSnapshot>(profileQueryKey)
    if (!snapshot) throw new Error("Job profile is not available.")
    return snapshot
  }

  async function uploadForMode(input: ResumeUploadInput, mode: ProfileResumeWorkflowMode) {
    await resumeUploadMutation.mutateAsync({ input, mode })
    return currentSnapshot()
  }

  const resumeWorkflow: ProfileResumeWorkflowState = (() => {
    if (resumeUploadMutation.isPending && pendingUploadMode) {
      return { mode: pendingUploadMode, status: "uploading" }
    }
    if (!activeResume) return { status: "idle" }
    const parsing = parsingQuery.data
    const isRetrying = resumeRecoveryMutation.isPending || resumeRetryMutation.isPending
    if (resumeSynchronizationError) {
      return {
        isRetrying,
        mode: activeResume.mode,
        resumeId: activeResume.id,
        status: "parsing",
        synchronizationError: true,
      }
    }
    if (parsing?.status === "failed") {
      return {
        canRetry: parsing.canRetry,
        failureReason: parsing.failureReason,
        isRetrying,
        mode: activeResume.mode,
        resumeId: activeResume.id,
        status: "failed",
      }
    }
    const draft = draftQuery.data
    if (parsing?.status === "succeeded" && draft?.status === "ready") {
      if (resumeApplyMutation.isPending) {
        return { draft, mode: activeResume.mode, resumeId: activeResume.id, status: "applying" }
      }
      return {
        applyConflict: resumeApplyConflict,
        applyError: resumeApplyError,
        draft,
        mode: activeResume.mode,
        resumeId: activeResume.id,
        status: "draftReady",
      }
    }
    return {
      isRetrying,
      mode: activeResume.mode,
      resumeId: activeResume.id,
      status: "parsing",
      synchronizationError: false,
    }
  })()

  const actions: ProfileViewActions = {
    applyResumeDraft,
    createManualProfile: () => manualProfileMutation.mutateAsync(),
    resetResumeWorkflow,
    retryResumeWorkflow,
    saveSection: (input) => saveMutation.mutateAsync(input),
    uploadResumeForInitialImport: (input) => uploadForMode(input, "initial"),
    uploadResumeForUpdate: (input) => uploadForMode(input, "update"),
  }

  if (profileQuery.data !== undefined) {
    return (
      <ProfileView
        actions={actions}
        capabilities={profileCapabilities}
        content={{
          status: "ready",
          data: profileQuery.data,
          hasResumeDocuments,
          resumeWorkflow,
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
