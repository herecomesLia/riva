import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"

import { useAuthenticationInvalidation } from "@/hooks/use-authentication-invalidation"
import type { ProfileContent, ProfileSnapshot, ResumeUploadInput } from "@/models/profile"
import { ApiError } from "@/services/api"
import { getProfile, importFromResume, saveProfile } from "@/services/profile"

import { ProfileView, type ProfileViewActions } from "./ProfileView"
import type { ProfileResumeWorkflowState } from "./profile-resume-workflow"

const profileQueryKey = ["profile"] as const
const rolesQueryKey = ["roles"] as const

export function ProfilePage() {
  const queryClient = useQueryClient()
  const invalidateAuthentication = useAuthenticationInvalidation()
  const [workflow, setWorkflow] = useState<ProfileResumeWorkflowState>({ status: "idle" })

  const profileQuery = useQuery({
    queryFn: getProfile,
    queryKey: profileQueryKey,
    retry: false,
  })

  useEffect(() => {
    invalidateAuthentication(profileQuery.error)
  }, [invalidateAuthentication, profileQuery.error])

  function currentProfile(): ProfileSnapshot {
    return queryClient.getQueryData<ProfileSnapshot>(profileQueryKey) ?? profileQuery.data ?? null
  }

  function setProfile(profile: ProfileSnapshot) {
    queryClient.setQueryData(profileQueryKey, profile)
    return profile
  }

  const saveMutation = useMutation({
    mutationFn: ({ content, version }: { content: ProfileContent; version: number | null }) =>
      saveProfile({ content, version }),
    onSuccess: async (profile) => {
      setProfile(profile)
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

  const importMutation = useMutation({
    mutationFn: importFromResume,
    onMutate: () => setWorkflow({ status: "importing" }),
    onSuccess: (content) => setWorkflow({ content, isSaving: false, status: "preview" }),
    onError: (error) => {
      invalidateAuthentication(error)
      setWorkflow({ status: "idle" })
    },
  })

  const confirmMutation = useMutation({
    mutationFn: (content: ProfileContent) => {
      const profile = currentProfile()
      return saveProfile({ content, version: profile?.version ?? null })
    },
    onMutate: () => {
      setWorkflow((current) =>
        current.status === "preview" ? { ...current, isSaving: true } : current,
      )
    },
    onSuccess: async (profile) => {
      setProfile(profile)
      setWorkflow({ status: "idle" })
      await queryClient.invalidateQueries({ queryKey: rolesQueryKey })
    },
    onError: async (error) => {
      setWorkflow((current) =>
        current.status === "preview" ? { ...current, isSaving: false } : current,
      )
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

  const actions: ProfileViewActions = {
    confirmResumeImport: async () => {
      if (workflow.status === "preview") await confirmMutation.mutateAsync(workflow.content)
    },
    importResume: async (input: ResumeUploadInput) => {
      await importMutation.mutateAsync(input)
    },
    resetResumeWorkflow: () => setWorkflow({ status: "idle" }),
    saveProfile: async (content: ProfileContent) => {
      const profile = currentProfile()
      return saveMutation.mutateAsync({ content, version: profile?.version ?? null })
    },
  }

  if (profileQuery.data !== undefined) {
    return (
      <ProfileView
        actions={actions}
        content={{ data: profileQuery.data, resumeWorkflow: workflow, status: "ready" }}
        variant="default"
      />
    )
  }
  if (profileQuery.isFetching)
    return <ProfileView content={{ status: "loading" }} variant="default" />
  if (profileQuery.isError)
    return <ProfileView onRetry={() => void profileQuery.refetch()} variant="error" />
  return <ProfileView content={{ status: "loading" }} variant="default" />
}
