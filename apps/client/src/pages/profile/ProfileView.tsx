import { useBlocker } from "@tanstack/react-router"
import { CircleAlertIcon } from "lucide-react"
import { useCallback, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

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
import type {
  JobProfileSnapshot,
  ResumeUploadInput,
  SaveProfileSectionInput,
} from "@/models/profile"

import { ProfileHeader } from "./components/ProfileHeader"
import { ResumeImportForm } from "./components/ProfileImportPanels"
import {
  ProfileEmptyState,
  ProfileErrorState,
  ProfileLoadingState,
  ProfileProcessingState,
  ProfileRecognitionFailureState,
} from "./components/ProfilePageStates"
import { ProfileResumeDialog, type ResumeDialogMode } from "./components/ProfileResumeDialog"
import {
  ProfileSectionEditDialog,
  type EditableProfileSection,
} from "./components/ProfileSectionEditDialog"
import { ProfileSections } from "./components/ProfileSections"

export type ProfileViewActions = {
  createManualProfile: () => Promise<JobProfileSnapshot>
  resetInitialResumeImport: (profileId: string, resumeId: string) => Promise<JobProfileSnapshot>
  retryRecognition: (profileId: string, resumeId: string) => Promise<JobProfileSnapshot>
  saveSection: (input: SaveProfileSectionInput) => Promise<unknown>
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
    }

export function ProfileView(props: ProfileViewProps) {
  if (props.variant === "error") {
    return <ProfileErrorState isRetrying={false} onRetry={props.onRetry} />
  }

  if (!("actions" in props)) {
    return <ProfileLoadingState />
  }

  return <ProfileReadyView actions={props.actions} snapshot={props.content.data} />
}

function ProfileReadyView({
  actions,
  snapshot,
}: {
  actions: ProfileViewActions
  snapshot: JobProfileSnapshot
}) {
  const { t } = useTranslation()
  const [editingSection, setEditingSection] = useState<EditableProfileSection | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const [isDiscardDialogOpen, setIsDiscardDialogOpen] = useState(false)
  const [isImportSubmitting, setIsImportSubmitting] = useState(false)
  const [initialImportError, setInitialImportError] = useState<string | null>(null)
  const [resumeDialogMode, setResumeDialogMode] = useState<ResumeDialogMode>("details")
  const [isResumeDialogOpen, setIsResumeDialogOpen] = useState(false)
  const [resumeImportError, setResumeImportError] = useState<string | null>(null)
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

  function startEditing(section: EditableProfileSection) {
    setIsDirty(false)
    setEditingSection(section)
  }

  function requestCloseEditor() {
    if (isDirty) {
      setIsDiscardDialogOpen(true)
      return
    }

    closeEditor()
  }

  function handleEditorOpenChange(open: boolean) {
    if (!open) requestCloseEditor()
  }

  function discardDraftAndClose() {
    setIsDiscardDialogOpen(false)
    closeEditor()
  }

  async function runImport(
    input: ResumeUploadInput,
    upload: (value: ResumeUploadInput) => Promise<JobProfileSnapshot>,
    setError: (message: string | null) => void,
    onSuccess?: () => void,
  ) {
    setIsImportSubmitting(true)
    setError(null)
    try {
      await upload(input)
      onSuccess?.()
    } catch {
      setError(t("profile.import.failed"))
    } finally {
      setIsImportSubmitting(false)
    }
  }

  if (!snapshot.profile) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <ProfileEmptyState />
        <ResumeImportForm
          isSubmitting={isImportSubmitting}
          onSubmit={(input) => runImport(input, actions.uploadInitialResume, setInitialImportError)}
          title={t("profile.import.title")}
        />
        {initialImportError && <ImportError message={initialImportError} />}
      </div>
    )
  }

  const { profile } = snapshot
  const processingStatus =
    profile.status === "uploadingResume" || profile.status === "parsingResume"
      ? profile.status
      : snapshot.resumeUpdate?.status === "uploading"
        ? "uploadingResume"
        : snapshot.resumeUpdate?.status === "parsing"
          ? "parsingResume"
          : null
  const isProcessing = processingStatus !== null
  const isRecognitionFailure = profile.status === "recognitionFailed"

  function closeResumeDialog() {
    setIsResumeDialogOpen(false)
    setResumeDialogMode("details")
    setResumeImportError(null)
  }

  function handleResumeDialogOpenChange(open: boolean) {
    if (!open && isImportSubmitting) return

    if (open) {
      setResumeDialogMode(profile.resume ? "details" : "import")
      setResumeImportError(null)
      setIsResumeDialogOpen(true)
      return
    }

    closeResumeDialog()
  }

  async function submitResumeImport(input: ResumeUploadInput) {
    const isUpdate = Boolean(profile.resume)
    await runImport(
      input,
      isUpdate ? actions.uploadUpdatedResume : actions.uploadInitialResume,
      setResumeImportError,
      closeResumeDialog,
    )
  }

  const summary = snapshot.resumeUpdate?.changeSummary
  const showsInitialImportFeedback =
    snapshot.recognition?.processingStatus === "succeeded" &&
    snapshot.matchingAnalysis === null &&
    snapshot.resumeUpdate === null
  const showsResumeUpdateFeedback = snapshot.resumeUpdate?.status === "succeeded"

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <ProfileHeader onOpenResume={() => handleResumeDialogOpenChange(true)} profile={profile} />
      <ProfileResumeDialog
        importError={resumeImportError}
        isSubmitting={isImportSubmitting}
        mode={resumeDialogMode}
        onModeChange={(mode) => {
          setResumeDialogMode(mode)
          setResumeImportError(null)
        }}
        onOpenChange={handleResumeDialogOpenChange}
        onSubmit={submitResumeImport}
        open={isResumeDialogOpen}
        profile={profile}
        resumeUpdate={snapshot.resumeUpdate}
      />

      {showsInitialImportFeedback && (
        <Alert data-testid="profile-import-success">
          <AlertTitle>{t("profile.import.success")}</AlertTitle>
          <AlertDescription>{t("profile.import.successDescription")}</AlertDescription>
        </Alert>
      )}
      {showsResumeUpdateFeedback && summary && (
        <Alert data-testid="profile-resume-update-success">
          <AlertTitle>{t("profile.import.updateSuccess")}</AlertTitle>
          <AlertDescription>
            {t("profile.import.updateSummary", {
              changedItems: summary.changedItems,
              missingItems: summary.missingItems,
              newItems: summary.newItems,
            })}
          </AlertDescription>
          {snapshot.resumeUpdate?.preservesManualChanges && (
            <AlertDescription>{t("profile.import.manualChangesProtected")}</AlertDescription>
          )}
        </Alert>
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
            profile.resume &&
            void actions.resetInitialResumeImport(profile.profileId, profile.resume.id)
          }
        />
      )}

      {!isProcessing && !isRecognitionFailure && (
        <>
          <ProfileSections onStartEditing={startEditing} profile={profile} />
          <ProfileSectionEditDialog
            onDirtyChange={handleDirtyChange}
            onOpenChange={handleEditorOpenChange}
            onSave={async (input) => {
              await actions.saveSection(input)
              closeEditor()
              toast.success(t("profile.editor.saveSuccess"), {
                duration: 2500,
                id: "profile-save-success",
              })
            }}
            open={editingSection !== null}
            profile={profile}
            section={editingSection}
          />
        </>
      )}

      <AlertDialog open={isDiscardDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("profile.dialog.discardDraftTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("profile.dialog.discardDraftDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setIsDiscardDialogOpen(false)}>
              {t("profile.dialog.stayEditing")}
            </AlertDialogCancel>
            <AlertDialogAction onClick={discardDraftAndClose} variant="destructive">
              {t("profile.dialog.discardChanges")}
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
