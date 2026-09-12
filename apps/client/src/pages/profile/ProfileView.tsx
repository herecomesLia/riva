import { useBlocker } from "@tanstack/react-router"
import { CircleAlertIcon } from "lucide-react"
import { useCallback, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import type { CareerProfileResponse, UpdateCareerProfileRequest } from "@/api/generated/models"
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
import type { ResumeImportInput } from "@/mocks/models/profile"

import { ProfileHeader } from "./components/ProfileHeader"
import { ResumeImportForm } from "./components/ProfileImportPanels"
import {
  ProfileEmptyState,
  ProfileErrorState,
  ProfileLoadingState,
} from "./components/ProfilePageStates"
import { ProfileResumeDialog } from "./components/ProfileResumeDialog"
import {
  ProfileSectionEditDialog,
  type EditableProfileSection,
} from "./components/ProfileSectionEditDialog"
import { ProfileSections } from "./components/ProfileSections"

export type ProfileViewActions = {
  createProfile: () => Promise<CareerProfileResponse>
  importResume: (input: ResumeImportInput) => Promise<CareerProfileResponse>
  updateProfile: (input: UpdateCareerProfileRequest) => Promise<CareerProfileResponse>
}

export type ProfileViewProps =
  | { variant: "error"; onRetry: () => void }
  | { variant: "default"; content: { status: "loading" } }
  | {
      variant: "default"
      content: { status: "ready"; data: CareerProfileResponse | null }
      actions: ProfileViewActions
    }

export function ProfileView(props: ProfileViewProps) {
  if (props.variant === "error") {
    return <ProfileErrorState isRetrying={false} onRetry={props.onRetry} />
  }

  if (!("actions" in props)) {
    return <ProfileLoadingState />
  }

  return <ProfileReadyView actions={props.actions} profile={props.content.data} />
}

function ProfileReadyView({
  actions,
  profile,
}: {
  actions: ProfileViewActions
  profile: CareerProfileResponse | null
}) {
  const { t } = useTranslation()
  const [editingSection, setEditingSection] = useState<EditableProfileSection | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const [isDiscardDialogOpen, setIsDiscardDialogOpen] = useState(false)
  const [isImportSubmitting, setIsImportSubmitting] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)
  const [showImportFeedback, setShowImportFeedback] = useState(false)
  const [isResumeDialogOpen, setIsResumeDialogOpen] = useState(false)
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

  function requestCloseEditor() {
    if (isDirty) {
      setIsDiscardDialogOpen(true)
      return
    }
    closeEditor()
  }

  async function runImport(input: ResumeImportInput) {
    setIsImportSubmitting(true)
    setImportError(null)
    setShowImportFeedback(false)
    try {
      await actions.importResume(input)
      setShowImportFeedback(true)
      setIsResumeDialogOpen(false)
    } catch {
      setImportError(t("profile.import.failed"))
    } finally {
      setIsImportSubmitting(false)
    }
  }

  async function createManually() {
    setIsCreating(true)
    setCreateError(null)
    try {
      await actions.createProfile()
    } catch {
      setCreateError(t("profile.lifecycle.actionFailed"))
    } finally {
      setIsCreating(false)
    }
  }

  if (!profile) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <ProfileEmptyState />
        <ResumeImportForm
          isSubmitting={isImportSubmitting}
          onSubmit={runImport}
          title={t("profile.import.title")}
        />
        <Button disabled={isCreating} onClick={() => void createManually()} variant="outline">
          {t("profile.actions.manualEntry")}
        </Button>
        {importError && <ImportError message={importError} />}
        {createError && <ImportError message={createError} />}
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <ProfileHeader onOpenResume={() => setIsResumeDialogOpen(true)} profile={profile} />
      <ProfileResumeDialog
        hasProfile
        importError={importError}
        isSubmitting={isImportSubmitting}
        onOpenChange={(open) => {
          if (!open && isImportSubmitting) return
          setImportError(null)
          setIsResumeDialogOpen(open)
        }}
        onSubmit={runImport}
        open={isResumeDialogOpen}
      />

      {showImportFeedback && (
        <Alert data-testid="profile-import-success">
          <AlertTitle>{t("profile.import.success")}</AlertTitle>
          <AlertDescription>{t("profile.import.successDescription")}</AlertDescription>
        </Alert>
      )}

      <ProfileSections
        onStartEditing={(section) => {
          setIsDirty(false)
          setEditingSection(section)
        }}
        profile={profile}
      />
      <ProfileSectionEditDialog
        onDirtyChange={handleDirtyChange}
        onOpenChange={(open) => {
          if (!open) requestCloseEditor()
        }}
        onSave={async (input) => {
          await actions.updateProfile(input)
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
