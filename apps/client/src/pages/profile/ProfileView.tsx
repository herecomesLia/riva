import { useBlocker } from "@tanstack/react-router"
import { CircleAlertIcon } from "lucide-react"
import { useCallback, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import type {
  CareerProfileResponse,
  CareerProfileTextExtractionRequest,
  CreateCareerProfileRequest,
  UpdateCareerProfileRequest,
  TaskStatusResponse,
  TaskFailureResponse,
} from "@/api/generated/models"
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
import { ApiError } from "@/api/error"

import { ProfileHeader } from "./components/ProfileHeader"
import { CareerProfileExtractionForm } from "./components/CareerProfileExtractionForm"
import { CareerProfileExtractionStatus } from "./components/CareerProfileExtractionStatus"
import {
  ProfileEmptyState,
  ProfileErrorState,
  ProfileLoadingState,
} from "./components/ProfilePageStates"
import { CareerProfileExtractionDialog } from "./components/CareerProfileExtractionDialog"
import {
  ProfileSectionEditDialog,
  type EditableProfileSection,
} from "./components/ProfileSectionEditDialog"
import { ProfileSections } from "./components/ProfileSections"

export type ProfileViewActions = {
  createCareerProfile: (input: CreateCareerProfileRequest) => Promise<CareerProfileResponse>
  updateCareerProfile: (input: UpdateCareerProfileRequest) => Promise<CareerProfileResponse>
  extractCareerProfileFromText: (input: CareerProfileTextExtractionRequest) => Promise<void>
  retryCareerProfileExtraction: () => Promise<void>
  abortCareerProfileExtraction: () => Promise<void>
  retryCareerProfileExtractionState: () => Promise<void>
}

export type ProfileViewProps =
  | { variant: "error"; onRetry: () => void }
  | { variant: "loading" }
  | {
      variant: "default"
      profile: CareerProfileResponse | null
      extractionState: TaskStatusResponse | TaskFailureResponse | undefined
      extractionStateError: boolean
      actions: ProfileViewActions
    }

export function ProfileView(props: ProfileViewProps) {
  if (props.variant === "error")
    return <ProfileErrorState isRetrying={false} onRetry={props.onRetry} />
  if (props.variant === "loading") return <ProfileLoadingState />
  return <ProfileReadyView {...props} />
}

function ProfileReadyView({
  actions,
  profile,
  extractionState,
  extractionStateError,
}: Extract<ProfileViewProps, { variant: "default" }>) {
  const { t } = useTranslation()
  const [editingSection, setEditingSection] = useState<EditableProfileSection | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const [isDiscardDialogOpen, setIsDiscardDialogOpen] = useState(false)
  const [pendingAction, setPendingAction] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [isExtractionDialogOpen, setIsExtractionDialogOpen] = useState(false)
  const blocker = useBlocker({
    disabled: !isDirty,
    enableBeforeUnload: isDirty,
    shouldBlockFn: () => isDirty,
    withResolver: true,
  })
  const handleDirtyChange = useCallback((nextIsDirty: boolean) => setIsDirty(nextIsDirty), [])
  const canEdit =
    !pendingAction &&
    !extractionStateError &&
    (extractionState?.status === "idle" || extractionState?.status === "failed")

  function closeEditor() {
    setEditingSection(null)
    setIsDirty(false)
  }
  function requestCloseEditor() {
    if (isDirty) setIsDiscardDialogOpen(true)
    else closeEditor()
  }
  async function runAction(action: () => Promise<unknown>) {
    if (pendingAction) return false
    setPendingAction(true)
    setActionError(null)
    try {
      await action()
      return true
    } catch (error) {
      setActionError(
        t(
          error instanceof ApiError && error.code === "resource.conflict"
            ? "profile.lifecycle.stateConflict"
            : "profile.lifecycle.actionFailed",
        ),
      )
      return false
    } finally {
      setPendingAction(false)
    }
  }
  async function extract(input: CareerProfileTextExtractionRequest) {
    if (await runAction(() => actions.extractCareerProfileFromText(input))) {
      setIsExtractionDialogOpen(false)
    }
  }

  return (
    <div
      className={
        profile
          ? "mx-auto flex w-full max-w-7xl flex-col gap-6"
          : "mx-auto flex w-full max-w-3xl flex-col gap-6"
      }
    >
      {profile ? (
        <ProfileHeader
          disabled={!canEdit}
          onOpenResume={() => setIsExtractionDialogOpen(true)}
          profile={profile}
        />
      ) : (
        <ProfileEmptyState />
      )}
      <CareerProfileExtractionStatus
        state={extractionState}
        synchronizationError={extractionStateError}
        pending={pendingAction}
        onRetry={() => void runAction(actions.retryCareerProfileExtraction)}
        onAbort={() => void runAction(actions.abortCareerProfileExtraction)}
        onReimport={() => setIsExtractionDialogOpen(true)}
        onResynchronize={() => void runAction(actions.retryCareerProfileExtractionState)}
      />
      {actionError && <ActionError message={actionError} />}
      {!profile && extractionState?.status === "idle" && !extractionStateError && (
        <CareerProfileExtractionForm
          isSubmitting={pendingAction}
          onSubmit={extract}
          title={t("profile.import.title")}
        />
      )}
      {!profile && canEdit && (
        <Button
          disabled={pendingAction}
          onClick={() => void runAction(() => actions.createCareerProfile({}))}
          variant="outline"
        >
          {t("profile.actions.manualEntry")}
        </Button>
      )}
      <CareerProfileExtractionDialog
        hasProfile={profile !== null}
        actionError={actionError}
        isSubmitting={pendingAction}
        onOpenChange={(open) => {
          if (!open && pendingAction) return
          setActionError(null)
          setIsExtractionDialogOpen(open)
        }}
        onSubmit={extract}
        open={isExtractionDialogOpen}
      />
      {profile && (
        <>
          <ProfileSections
            onStartEditing={
              canEdit
                ? (section) => {
                    setIsDirty(false)
                    setEditingSection(section)
                  }
                : undefined
            }
            profile={profile}
          />
          <ProfileSectionEditDialog
            onDirtyChange={handleDirtyChange}
            onOpenChange={(open) => {
              if (!open) requestCloseEditor()
            }}
            onSave={async (input) => {
              await actions.updateCareerProfile(input)
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

function ActionError({ message }: { message: string }) {
  return (
    <Alert variant="destructive">
      <CircleAlertIcon />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  )
}
