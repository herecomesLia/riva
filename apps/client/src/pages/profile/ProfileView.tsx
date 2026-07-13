import { useBlocker } from "@tanstack/react-router"
import { CircleAlertIcon } from "lucide-react"
import { useCallback, useState, type ReactNode } from "react"
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
import { Button } from "@/components/ui/button"
import type {
  JobProfile,
  JobProfileSnapshot,
  MatchingAnalysis,
  ProfileSection,
  ResumeRecognitionConfirmationInput,
  ResumeUpdateDecisionInput,
  ResumeUploadInput,
  SaveProfileSectionInput,
} from "@/models/profile"
import { ProfileHeader } from "./components/ProfileHeader"
import { ResumeImportForm, ResumeUpdateReview } from "./components/ProfileImportPanels"
import {
  ProfileEmptyState,
  ProfileErrorState,
  ProfileLoadingState,
  ProfileProcessingState,
  ProfileRecognitionFailureState,
} from "./components/ProfilePageStates"
import { ProfileResumeCard } from "./components/ProfileResumeCard"
import { ProfileSections } from "./components/ProfileSections"
import { ProfileSupportingInfo } from "./components/ProfileSupportingInfo"

type EditableSection = Exclude<ProfileSection, "targetRoles">

export type ProfileViewActions = {
  cancelRecognition: (profileId: string, resumeId: string) => Promise<JobProfileSnapshot>
  cancelResumeUpdate: (input: ResumeUpdateDecisionInput) => Promise<JobProfileSnapshot>
  confirmRecognition: (input: ResumeRecognitionConfirmationInput) => Promise<JobProfile>
  confirmResumeUpdate: (input: ResumeUpdateDecisionInput) => Promise<JobProfile>
  createManualProfile: () => Promise<JobProfileSnapshot>
  regenerateMatchingAnalysis: (profileId: string) => Promise<MatchingAnalysis>
  retryRecognition: (profileId: string, resumeId: string) => Promise<JobProfileSnapshot>
  saveSection: (input: SaveProfileSectionInput) => Promise<JobProfile>
  uploadInitialResume: (input: ResumeUploadInput) => Promise<JobProfileSnapshot>
  uploadUpdatedResume: (input: ResumeUploadInput) => Promise<JobProfileSnapshot>
}

export type ProfileViewProps =
  | { variant: "error"; onRetry: () => void }
  | { variant: "default"; content: { status: "loading" } }
  | {
      variant: "default"
      content: { status: "ready"; data: JobProfileSnapshot }
      actions: ProfileViewActions
      pending: {
        analysis: boolean
        confirmUpdate: boolean
        cancelUpdate: boolean
      }
    }

export function ProfileView(props: ProfileViewProps) {
  if (props.variant === "error") {
    return <ProfileErrorState isRetrying={false} onRetry={props.onRetry} />
  }

  if (!("actions" in props)) {
    return <ProfileLoadingState />
  }

  return (
    <ProfileReadyView
      actions={props.actions}
      pending={props.pending}
      snapshot={props.content.data}
    />
  )
}

function ProfileReadyView({
  actions,
  pending,
  snapshot,
}: {
  actions: ProfileViewActions
  pending: { analysis: boolean; confirmUpdate: boolean; cancelUpdate: boolean }
  snapshot: JobProfileSnapshot
}) {
  const { t } = useTranslation()
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
    if (pendingSection) setEditingSection(pendingSection)
    setPendingSection(null)
    setIsDirty(false)
  }

  async function runImport(
    input: ResumeUploadInput,
    upload: (value: ResumeUploadInput) => Promise<JobProfileSnapshot>,
  ) {
    setImportPhase("uploading")
    setImportError(null)
    try {
      await upload(input)
      setImportPhase("parsing")
      setIsReplacingResume(false)
    } catch {
      setImportError(t("profile.import.failed"))
    } finally {
      setImportPhase(null)
    }
  }

  if (!snapshot.profile) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <ProfileEmptyState />
        <ResumeImportForm
          isSubmitting={importPhase !== null}
          onSubmit={(input) => runImport(input, actions.uploadInitialResume)}
          title={t("profile.import.title")}
        />
        {importError && <ImportError message={importError} />}
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
      {importError && <ImportError message={importError} />}

      {profile.matchingAnalysisStale && (
        <Alert data-testid="profile-matching-analysis-stale">
          <CircleAlertIcon />
          <AlertTitle>{t("profile.matchingAnalysis.staleTitle")}</AlertTitle>
          <AlertDescription>{t("profile.matchingAnalysis.staleDescription")}</AlertDescription>
          <AlertDescription>{t("profile.matchingAnalysis.oldVersion")}</AlertDescription>
          <AlertDescription>{t("profile.matchingAnalysis.historyPreserved")}</AlertDescription>
          <Button
            disabled={pending.analysis}
            onClick={() => {
              setImportError(null)
              void actions
                .regenerateMatchingAnalysis(profile.profileId)
                .catch(() => setImportError(t("profile.matchingAnalysis.regenerationFailed")))
            }}
            size="sm"
          >
            {pending.analysis
              ? t("profile.matchingAnalysis.regenerating")
              : t("profile.actions.regenerateMatchingAnalysis")}
          </Button>
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
          onSubmit={(input) => runImport(input, actions.uploadUpdatedResume)}
          title={t("profile.actions.replaceResume")}
        />
      )}

      {snapshot.resumeUpdate && (
        <ResumeUpdateReview
          isApplying={pending.confirmUpdate}
          isCancelling={pending.cancelUpdate}
          onApply={() => {
            setImportError(null)
            void actions
              .confirmResumeUpdate({
                profileId: profile.profileId,
                resumeUpdateId: snapshot.resumeUpdate!.id,
              })
              .catch(() => setImportError(t("profile.import.failed")))
          }}
          onCancel={() => {
            setImportError(null)
            void actions
              .cancelResumeUpdate({
                profileId: profile.profileId,
                resumeUpdateId: snapshot.resumeUpdate!.id,
              })
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
          onManualEntry={() => void actions.createManualProfile()}
          onRetry={() =>
            profile.resume && void actions.retryRecognition(profile.profileId, profile.resume.id)
          }
          onReupload={() =>
            profile.resume && void actions.cancelRecognition(profile.profileId, profile.resume.id)
          }
        />
      )}

      {isAwaitingConfirmation && profile.resume && (
        <ProfileReviewNotice
          descriptionKey="profile.lifecycle.awaitingConfirmation.description"
          titleKey="profile.lifecycle.awaitingConfirmation.title"
          actions={
            <>
              <Button
                onClick={() =>
                  void actions.confirmRecognition({
                    profileId: profile.profileId,
                    resumeId: profile.resume!.id,
                  })
                }
                size="sm"
              >
                {t("profile.actions.confirmRecognition")}
              </Button>
              <Button
                onClick={() =>
                  void actions.cancelRecognition(profile.profileId, profile.resume!.id)
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
              await actions.saveSection(input)
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

function ImportError({ message }: { message: string }) {
  return (
    <Alert variant="destructive">
      <CircleAlertIcon />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
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
