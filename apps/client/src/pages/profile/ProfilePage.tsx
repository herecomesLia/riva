import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useBlocker } from "@tanstack/react-router"
import { CircleAlertIcon } from "lucide-react"
import { useCallback, useState } from "react"
import { useTranslation } from "react-i18next"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import type { ProfileSection } from "@/models/profile"
import { getJobProfile, saveProfileSection } from "@/services/profile"

import { ProfileHeader } from "./ProfileHeader"
import {
  ProfileEmptyState,
  ProfileErrorState,
  ProfileLoadingState,
  ProfileProcessingState,
  ProfileRecognitionFailureState,
} from "./ProfilePageStates"
import { ProfileResumeCard } from "./ProfileResumeCard"
import { ProfileSections } from "./ProfileSections"
import { ProfileSupportingInfo } from "./ProfileSupportingInfo"

type EditableSection = Exclude<ProfileSection, "targetRoles">

export function ProfilePage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [editingSection, setEditingSection] = useState<EditableSection | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const [pendingSection, setPendingSection] = useState<EditableSection | null>(null)
  const [saveFeedbackVisible, setSaveFeedbackVisible] = useState(false)
  const blocker = useBlocker({
    disabled: !isDirty,
    enableBeforeUnload: isDirty,
    shouldBlockFn: () => isDirty,
    withResolver: true,
  })
  const profileQuery = useQuery({
    queryFn: getJobProfile,
    queryKey: ["profile"],
    retry: false,
  })
  const saveMutation = useMutation({
    mutationFn: saveProfileSection,
    onSuccess: (profile) => {
      queryClient.setQueryData(["profile"], (snapshot: typeof profileQuery.data) =>
        snapshot ? { ...snapshot, profile } : snapshot,
      )
    },
  })

  const handleDirtyChange = useCallback((nextIsDirty: boolean) => {
    setIsDirty(nextIsDirty)
  }, [])

  function closeEditor() {
    setEditingSection(null)
    setIsDirty(false)
  }

  function startEditing(section: EditableSection) {
    setSaveFeedbackVisible(false)

    if (editingSection && editingSection !== section && isDirty) {
      setPendingSection(section)
      return
    }

    setEditingSection(section)
  }

  function discardDraftAndContinue() {
    if (pendingSection) {
      setEditingSection(pendingSection)
    }

    setPendingSection(null)
    setIsDirty(false)
  }

  if (profileQuery.isPending) {
    return <ProfileLoadingState />
  }

  if (profileQuery.isError) {
    return (
      <ProfileErrorState
        isRetrying={profileQuery.isFetching}
        onRetry={() => void profileQuery.refetch()}
      />
    )
  }

  const snapshot = profileQuery.data

  if (!snapshot?.profile) {
    return <ProfileEmptyState />
  }

  const { profile } = snapshot
  const processingStatus =
    profile.status === "uploadingResume" || profile.status === "parsingResume"
      ? profile.status
      : null
  const isProcessing = processingStatus !== null
  const isRecognitionFailure = profile.status === "recognitionFailed"
  const isAwaitingConfirmation = profile.status === "awaitingConfirmation"
  const hasPendingReview = profile.pendingReviewCount > 0

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <ProfileHeader profile={profile} />

      {saveFeedbackVisible && (
        <Alert data-testid="profile-save-success">
          <AlertDescription>{t("profile.editor.saveSuccess")}</AlertDescription>
        </Alert>
      )}

      {profile.matchingAnalysisStale && (
        <Alert data-testid="profile-matching-analysis-stale">
          <CircleAlertIcon />
          <AlertTitle>{t("profile.matchingAnalysis.staleTitle")}</AlertTitle>
          <AlertDescription>{t("profile.matchingAnalysis.staleDescription")}</AlertDescription>
        </Alert>
      )}

      <ProfileResumeCard
        profile={profile}
        recognition={snapshot.recognition}
        resumeUpdate={snapshot.resumeUpdate}
      />

      {processingStatus && <ProfileProcessingState status={processingStatus} />}
      {isRecognitionFailure && (
        <ProfileRecognitionFailureState
          failureReason={
            snapshot.recognition?.failureReason ?? profile.resume?.failureReason ?? null
          }
        />
      )}

      {isAwaitingConfirmation && (
        <ProfileReviewNotice
          descriptionKey="profile.lifecycle.awaitingConfirmation.description"
          titleKey="profile.lifecycle.awaitingConfirmation.title"
        />
      )}
      {!isAwaitingConfirmation && !isProcessing && !isRecognitionFailure && hasPendingReview && (
        <ProfileReviewNotice
          descriptionKey="profile.lifecycle.needsReview.description"
          titleKey="profile.lifecycle.needsReview.title"
        />
      )}

      {!isProcessing && !isRecognitionFailure && (
        <>
          <ProfileSections
            editingSection={editingSection}
            onCancelEditing={closeEditor}
            onDirtyChange={handleDirtyChange}
            onSave={async (input) => {
              await saveMutation.mutateAsync(input)
              closeEditor()
              setSaveFeedbackVisible(true)
            }}
            onStartEditing={startEditing}
            profile={profile}
          />
          <ProfileSupportingInfo profile={profile} />
        </>
      )}

      <AlertDialog open={pendingSection !== null}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("profile.dialog.discardDraftTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("profile.dialog.discardDraftDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingSection(null)}>
              {t("profile.dialog.stayEditing")}
            </AlertDialogCancel>
            <AlertDialogAction onClick={discardDraftAndContinue} variant="destructive">
              {t("profile.dialog.discardAndContinue")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={blocker.status === "blocked"}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("profile.dialog.leavePageTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("profile.dialog.leavePageDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => blocker.reset?.()}>
              {t("profile.dialog.stayEditing")}
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => blocker.proceed?.()} variant="destructive">
              {t("profile.dialog.leavePage")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function ProfileReviewNotice({
  descriptionKey,
  titleKey,
}: {
  descriptionKey: string
  titleKey: string
}) {
  const { t } = useTranslation()

  return (
    <Alert data-testid="profile-review-notice">
      <CircleAlertIcon />
      <AlertTitle>{t(titleKey)}</AlertTitle>
      <AlertDescription>{t(descriptionKey)}</AlertDescription>
    </Alert>
  )
}
