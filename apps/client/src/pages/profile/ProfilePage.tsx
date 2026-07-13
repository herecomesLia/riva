import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useBlocker } from "@tanstack/react-router"
import { CircleAlertIcon } from "lucide-react"
import { useCallback, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
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
import type { JobProfileSnapshot, ProfileSection, ResumeUploadInput } from "@/models/profile"
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

import { ProfileHeader } from "./ProfileHeader"
import { ResumeImportForm, ResumeUpdateReview } from "./ProfileImportPanels"
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
  const [isReplacingResume, setIsReplacingResume] = useState(false)
  const [importPhase, setImportPhase] = useState<"uploading" | "parsing" | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
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
  const recognitionMutation = useMutation({
    mutationFn: ({ profileId, resumeId }: { profileId: string; resumeId: string }) =>
      startInitialResumeRecognition(profileId, resumeId),
  })
  const updateRecognitionMutation = useMutation({ mutationFn: startUpdatedResumeRecognition })
  const analysisMutation = useMutation({ mutationFn: regenerateMatchingAnalysis })
  const confirmUpdateMutation = useMutation({ mutationFn: confirmResumeUpdate })
  const cancelUpdateMutation = useMutation({ mutationFn: cancelResumeUpdate })

  function setProfileSnapshot(snapshot: JobProfileSnapshot) {
    queryClient.setQueryData(["profile"], snapshot)
  }

  async function uploadInitial(input: ResumeUploadInput) {
    setImportPhase("uploading")
    setImportError(null)

    try {
      const uploading = await uploadInitialResume(input)
      setProfileSnapshot(uploading)
      const uploadingProfile = uploading.profile!
      setImportPhase("parsing")
      const recognized = await recognitionMutation.mutateAsync({
        profileId: uploadingProfile.profileId,
        resumeId: uploadingProfile.resume!.id,
      })
      setProfileSnapshot(recognized)
    } catch {
      setImportError(t("profile.import.failed"))
    } finally {
      setImportPhase(null)
    }
  }

  async function uploadReplacement(input: ResumeUploadInput) {
    const profile = profileQuery.data?.profile
    if (!profile) return
    setImportPhase("uploading")
    setImportError(null)

    try {
      const uploading = await uploadUpdatedResume(input)
      setProfileSnapshot(uploading)
      const resumeUpdate = uploading.resumeUpdate!
      setImportPhase("parsing")
      const recognized = await updateRecognitionMutation.mutateAsync({
        profileId: profile.profileId,
        resumeUpdateId: resumeUpdate.id,
      })
      setProfileSnapshot(recognized)
      setIsReplacingResume(false)
    } catch {
      setImportError(t("profile.import.failed"))
    } finally {
      setImportPhase(null)
    }
  }

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
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <ProfileEmptyState />
        <ResumeImportForm
          isSubmitting={importPhase !== null}
          onSubmit={uploadInitial}
          title={t("profile.import.title")}
        />
      </div>
    )
  }

  const { profile } = snapshot
  const processingStatus =
    importPhase === "parsing"
      ? "parsingResume"
      : profile.status === "uploadingResume" || profile.status === "parsingResume"
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

      {importError && (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertDescription>{importError}</AlertDescription>
        </Alert>
      )}

      {profile.matchingAnalysisStale && (
        <Alert data-testid="profile-matching-analysis-stale">
          <CircleAlertIcon />
          <AlertTitle>{t("profile.matchingAnalysis.staleTitle")}</AlertTitle>
          <AlertDescription>{t("profile.matchingAnalysis.staleDescription")}</AlertDescription>
          <AlertDescription>{t("profile.matchingAnalysis.oldVersion")}</AlertDescription>
          <AlertDescription>{t("profile.matchingAnalysis.historyPreserved")}</AlertDescription>
          <Button
            disabled={analysisMutation.isPending}
            onClick={() => {
              void analysisMutation.mutateAsync(profile.profileId).then((matchingAnalysis) => {
                queryClient.setQueryData(["profile"], (current: JobProfileSnapshot | undefined) =>
                  current?.profile
                    ? {
                        ...current,
                        matchingAnalysis,
                        profile: { ...current.profile, matchingAnalysisStale: false },
                      }
                    : current,
                )
              })
            }}
            size="sm"
          >
            {analysisMutation.isPending
              ? t("profile.matchingAnalysis.regenerating")
              : t("profile.actions.regenerateMatchingAnalysis")}
          </Button>
          {analysisMutation.isError && (
            <AlertDescription>{t("profile.matchingAnalysis.regenerationFailed")}</AlertDescription>
          )}
        </Alert>
      )}

      <ProfileResumeCard
        profile={profile}
        recognition={snapshot.recognition}
        resumeUpdate={snapshot.resumeUpdate}
        onReplaceResume={() => setIsReplacingResume(true)}
      />

      {isReplacingResume && (
        <ResumeImportForm
          isSubmitting={importPhase !== null}
          onSubmit={uploadReplacement}
          title={t("profile.actions.replaceResume")}
        />
      )}

      {snapshot.resumeUpdate && (
        <ResumeUpdateReview
          isApplying={confirmUpdateMutation.isPending}
          isCancelling={cancelUpdateMutation.isPending}
          onApply={() => {
            setImportError(null)
            void confirmUpdateMutation
              .mutateAsync({
                profileId: profile.profileId,
                resumeUpdateId: snapshot.resumeUpdate!.id,
              })
              .then((nextProfile) =>
                setProfileSnapshot({ ...snapshot, profile: nextProfile, resumeUpdate: null }),
              )
              .catch(() => setImportError(t("profile.import.failed")))
          }}
          onCancel={() => {
            setImportError(null)
            void cancelUpdateMutation
              .mutateAsync({
                profileId: profile.profileId,
                resumeUpdateId: snapshot.resumeUpdate!.id,
              })
              .then(setProfileSnapshot)
              .catch(() => setImportError(t("profile.import.failed")))
          }}
          resumeUpdate={snapshot.resumeUpdate}
        />
      )}

      {processingStatus && <ProfileProcessingState status={processingStatus} />}
      {isRecognitionFailure && (
        <ProfileRecognitionFailureState
          failureReason={
            snapshot.recognition?.failureReason ?? profile.resume?.failureReason ?? null
          }
          onManualEntry={() => void createManualJobProfile().then(setProfileSnapshot)}
          onRetry={() =>
            profile.resume &&
            void recognitionMutation
              .mutateAsync({ profileId: profile.profileId, resumeId: profile.resume.id })
              .then(setProfileSnapshot)
          }
          onReupload={() =>
            void cancelResumeRecognitionReview(profile.profileId, profile.resume!.id).then(
              setProfileSnapshot,
            )
          }
        />
      )}

      {isAwaitingConfirmation && (
        <ProfileReviewNotice
          descriptionKey="profile.lifecycle.awaitingConfirmation.description"
          titleKey="profile.lifecycle.awaitingConfirmation.title"
          actions={
            <>
              <Button
                onClick={() =>
                  void submitResumeRecognitionConfirmation({
                    profileId: profile.profileId,
                    resumeId: profile.resume!.id,
                  }).then((nextProfile) =>
                    setProfileSnapshot({ ...snapshot, profile: nextProfile }),
                  )
                }
                size="sm"
              >
                {t("profile.actions.confirmRecognition")}
              </Button>
              <Button
                onClick={() =>
                  void cancelResumeRecognitionReview(profile.profileId, profile.resume!.id).then(
                    setProfileSnapshot,
                  )
                }
                size="sm"
                variant="outline"
              >
                {t("profile.actions.cancelRecognition")}
              </Button>
            </>
          }
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
  actions,
  descriptionKey,
  titleKey,
}: {
  actions?: ReactNode
  descriptionKey: string
  titleKey: string
}) {
  const { t } = useTranslation()

  return (
    <Alert data-testid="profile-review-notice">
      <CircleAlertIcon />
      <AlertTitle>{t(titleKey)}</AlertTitle>
      <AlertDescription>{t(descriptionKey)}</AlertDescription>
      {actions && <div className="mt-3 flex flex-wrap gap-2">{actions}</div>}
    </Alert>
  )
}
