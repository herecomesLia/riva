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
  Profile,
  ProfileContent,
  ProfileSection,
  ProfileSnapshot,
  ResumeUploadInput,
} from "@/models/profile"

import { ProfileHeader } from "./components/ProfileHeader"
import { ResumeImportForm } from "./components/ProfileImportPanels"
import {
  ProfileEmptyState,
  ProfileErrorState,
  ProfileLoadingState,
  ProfileProcessingState,
} from "./components/ProfilePageStates"
import { ProfileResumeImportPreview } from "./components/ProfileResumeImportPreview"
import { ProfileResumeDialog } from "./components/ProfileResumeDialog"
import { ProfileSectionEditDialog } from "./components/ProfileSectionEditDialog"
import { ProfileSections } from "./components/ProfileSections"
import type { ProfileResumeWorkflowState } from "./profile-resume-workflow"

export type ProfileViewActions = {
  confirmResumeImport: () => Promise<void>
  importResume: (input: ResumeUploadInput) => Promise<void>
  saveProfile: (content: ProfileContent) => Promise<Profile>
  resetResumeWorkflow: () => void
}

export type ProfileViewProps =
  | { variant: "error"; onRetry: () => void }
  | { variant: "default"; content: { status: "loading" } }
  | {
      variant: "default"
      content: {
        status: "ready"
        data: ProfileSnapshot
        resumeWorkflow: ProfileResumeWorkflowState
      }
      actions: ProfileViewActions
    }

export function ProfileView(props: ProfileViewProps) {
  if (props.variant === "error") return <ProfileErrorState onRetry={props.onRetry} />
  if (!("actions" in props)) return <ProfileLoadingState />
  return (
    <ProfileReadyView
      actions={props.actions}
      profile={props.content.data}
      workflow={props.content.resumeWorkflow}
    />
  )
}

function ProfileReadyView({
  actions,
  profile,
  workflow,
}: {
  actions: ProfileViewActions
  profile: ProfileSnapshot
  workflow: ProfileResumeWorkflowState
}) {
  const { t } = useTranslation()
  const [editingSection, setEditingSection] = useState<ProfileSection | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const [isDiscardDialogOpen, setIsDiscardDialogOpen] = useState(false)
  const [isResumeDialogOpen, setIsResumeDialogOpen] = useState(false)
  const [isImportSubmitting, setIsImportSubmitting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const blocker = useBlocker({
    disabled: !isDirty,
    enableBeforeUnload: isDirty,
    shouldBlockFn: () => isDirty,
    withResolver: true,
  })

  const handleDirtyChange = useCallback((dirty: boolean) => setIsDirty(dirty), [])

  async function importResume(input: ResumeUploadInput) {
    setIsImportSubmitting(true)
    setImportError(null)
    try {
      await actions.importResume(input)
      setIsResumeDialogOpen(false)
    } catch {
      setImportError(t("profile.import.failed"))
    } finally {
      setIsImportSubmitting(false)
    }
  }

  if (workflow.status === "importing") {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <ProfileProcessingState />
      </div>
    )
  }

  if (workflow.status === "preview") {
    return (
      <div className="mx-auto w-full max-w-5xl">
        <ProfileResumeImportPreview
          content={workflow.content}
          isSaving={workflow.isSaving}
          onCancel={actions.resetResumeWorkflow}
          onSave={() => void actions.confirmResumeImport()}
        />
      </div>
    )
  }

  if (profile === null) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <ProfileEmptyState />
        <ResumeImportForm
          isSubmitting={isImportSubmitting}
          onSubmit={importResume}
          title={t("profile.import.title")}
        />
        {importError && <ImportError message={importError} />}
        <Button
          onClick={() => {
            void actions
              .saveProfile({
                education: [],
                projectExperiences: [],
                skills: [],
                summary: null,
                workExperiences: [],
              })
              .catch(() => setImportError(t("profile.editor.saveError")))
          }}
          variant="outline"
        >
          {t("profile.actions.manualEntry")}
        </Button>
      </div>
    )
  }

  function closeEditor() {
    setEditingSection(null)
    setIsDirty(false)
  }

  function requestCloseEditor() {
    if (isDirty) {
      setIsDiscardDialogOpen(true)
      return
    }
    closeEditor()
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <ProfileHeader onOpenResume={() => setIsResumeDialogOpen(true)} profile={profile} />
      <ProfileResumeDialog
        importError={importError}
        isSubmitting={isImportSubmitting}
        onOpenChange={(open) => {
          setIsResumeDialogOpen(open)
          if (!open) setImportError(null)
        }}
        onSubmit={importResume}
        open={isResumeDialogOpen}
      />
      <ProfileSections onStartEditing={setEditingSection} profile={profile.content} />
      <ProfileSectionEditDialog
        onDirtyChange={handleDirtyChange}
        onOpenChange={(open) => {
          if (!open) requestCloseEditor()
        }}
        onSave={async (content) => {
          await actions.saveProfile(content)
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
      {importError && !isResumeDialogOpen && <ImportError message={importError} />}

      <AlertDialog open={isDiscardDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("profile.dialog.discardTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("profile.dialog.discardDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setIsDiscardDialogOpen(false)}>
              {t("profile.dialog.stayEditing")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setIsDiscardDialogOpen(false)
                closeEditor()
              }}
              variant="destructive"
            >
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
