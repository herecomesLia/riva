import { useBlocker } from "@tanstack/react-router"
import { CircleAlertIcon } from "lucide-react"
import { useCallback, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Alert, AlertDescription } from "@/components/ui/alert"
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
  JobProfileSnapshot,
  ProfileCapabilities,
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
import { ProfileResumeDraftReviewState } from "./components/ProfileResumeDraftReviewState"
import { ProfileResumeDialog, type ResumeDialogMode } from "./components/ProfileResumeDialog"
import {
  ProfileSectionEditDialog,
  type EditableProfileSection,
} from "./components/ProfileSectionEditDialog"
import { ProfileSections } from "./components/ProfileSections"
import type { ProfileResumeWorkflowState } from "./profile-resume-workflow"

export type ProfileViewActions = {
  applyResumeDraft: () => Promise<void>
  createManualProfile: () => Promise<JobProfileSnapshot>
  retryResumeWorkflow: () => Promise<void>
  resetResumeWorkflow: () => void
  saveSection: (input: SaveProfileSectionInput) => Promise<unknown>
  uploadResumeForInitialImport: (input: ResumeUploadInput) => Promise<JobProfileSnapshot>
  uploadResumeForUpdate: (input: ResumeUploadInput) => Promise<JobProfileSnapshot>
}

export type ProfileViewProps =
  | { variant: "error"; onRetry: () => void }
  | { variant: "default"; content: { status: "loading" } }
  | {
      variant: "default"
      capabilities?: ProfileCapabilities
      content: {
        status: "ready"
        data: JobProfileSnapshot
        hasResumeDocuments?: boolean
        resumeWorkflow?: ProfileResumeWorkflowState
      }
      actions: ProfileViewActions
    }

const defaultProfileCapabilities: ProfileCapabilities = {
  credentials: true,
  resumeImport: true,
  targetRoles: true,
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
      capabilities={props.capabilities ?? defaultProfileCapabilities}
      hasResume={props.content.hasResumeDocuments ?? Boolean(props.content.data.profile?.resume)}
      snapshot={props.content.data}
      resumeWorkflow={props.content.resumeWorkflow ?? { status: "idle" }}
    />
  )
}

function ProfileReadyView({
  actions,
  capabilities,
  hasResume,
  resumeWorkflow,
  snapshot,
}: {
  actions: ProfileViewActions
  capabilities: ProfileCapabilities
  hasResume: boolean
  resumeWorkflow: ProfileResumeWorkflowState
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
  const [lifecycleActionError, setLifecycleActionError] = useState<string | null>(null)
  const [pendingLifecycleAction, setPendingLifecycleAction] = useState(false)
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

  async function runLifecycleAction(action: () => Promise<JobProfileSnapshot>) {
    if (pendingLifecycleAction) return
    setPendingLifecycleAction(true)
    setLifecycleActionError(null)
    try {
      await action()
    } catch {
      setLifecycleActionError(t("profile.lifecycle.actionFailed"))
    } finally {
      setPendingLifecycleAction(false)
    }
  }

  if (resumeWorkflow.status !== "idle") {
    let workflowContent
    switch (resumeWorkflow.status) {
      case "uploading":
        workflowContent = <ProfileProcessingState status="uploadingResume" />
        break
      case "parsing":
        workflowContent = (
          <ProfileProcessingState
            isRetrying={resumeWorkflow.isRetrying}
            onRetry={() => void actions.retryResumeWorkflow()}
            status="parsingResume"
            synchronizationError={resumeWorkflow.synchronizationError}
          />
        )
        break
      case "failed":
        workflowContent = (
          <ProfileRecognitionFailureState
            canRetry={resumeWorkflow.canRetry}
            failureReason={resumeWorkflow.failureReason}
            isActionPending={resumeWorkflow.isRetrying}
            onManualEntry={() => {
              actions.resetResumeWorkflow()
              void runLifecycleAction(actions.createManualProfile)
            }}
            onReupload={actions.resetResumeWorkflow}
            onRetry={() => void actions.retryResumeWorkflow()}
          />
        )
        break
      case "draftReady":
        workflowContent = (
          <ProfileResumeDraftReviewState
            applyConflict={resumeWorkflow.applyConflict}
            applyError={resumeWorkflow.applyError}
            draft={resumeWorkflow.draft}
            isApplying={false}
            onApply={() => void actions.applyResumeDraft()}
            onCancel={actions.resetResumeWorkflow}
          />
        )
        break
      case "applying":
        workflowContent = (
          <ProfileResumeDraftReviewState
            applyConflict={null}
            applyError={false}
            draft={resumeWorkflow.draft}
            isApplying
            onApply={() => undefined}
            onCancel={() => undefined}
          />
        )
    }

    if (!snapshot.profile) {
      return <div className="mx-auto w-full max-w-3xl">{workflowContent}</div>
    }
    return (
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <ProfileHeader hasResume={hasResume} profile={snapshot.profile} />
        {workflowContent}
      </div>
    )
  }

  if (!snapshot.profile) {
    if (!capabilities.resumeImport) {
      return (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
          <ProfileEmptyState manualOnly />
          <div>
            <Button
              disabled={pendingLifecycleAction}
              onClick={() => void runLifecycleAction(actions.createManualProfile)}
            >
              {t("profile.actions.manualEntry")}
            </Button>
          </div>
          {lifecycleActionError && <ImportError message={lifecycleActionError} />}
        </div>
      )
    }

    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <ProfileEmptyState />
        <ResumeImportForm
          isSubmitting={isImportSubmitting}
          onSubmit={(input) =>
            runImport(input, actions.uploadResumeForInitialImport, setInitialImportError)
          }
          title={t("profile.import.title")}
        />
        {initialImportError && <ImportError message={initialImportError} />}
      </div>
    )
  }

  const { profile } = snapshot

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
    await runImport(input, actions.uploadResumeForUpdate, setResumeImportError, closeResumeDialog)
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <ProfileHeader
        hasResume={hasResume}
        onOpenResume={
          capabilities.resumeImport ? () => handleResumeDialogOpenChange(true) : undefined
        }
        profile={profile}
      />
      {capabilities.resumeImport && (
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
        />
      )}
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
