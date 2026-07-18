import { AlertCircleIcon } from "lucide-react"
import { useBlocker } from "@tanstack/react-router"
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
import type {
  ArchiveTargetRoleInput,
  CreateTargetRoleInput,
  DeleteTargetRoleInput,
  GetJobDescriptionParsingStatusInput,
  RolesPageResponse,
  SaveTargetRoleJobDescriptionInput,
  SetCurrentTargetRoleInput,
  StartOrRetryJobDescriptionParsingInput,
  UpdateTargetRoleInput,
  UpdateTargetRolePreparationStatusInput,
} from "@/models/roles"
import type { Loadable } from "@/types"

import { RoleDetails } from "./components/RoleDetails"
import { RoleEditorDialog } from "./components/RoleEditorDialog"
import { JobDescriptionEditorDialog } from "./components/JobDescriptionEditorDialog"
import { RolesHeader } from "./components/RolesHeader"
import { RolesList } from "./components/RolesList"
import {
  RolesEmptyState,
  RolesErrorState,
  RolesLoadingState,
  RolesNoSelectionState,
} from "./components/RolesPageStates"
import { getRolesActionErrorCode, type RolesActionErrorCode } from "./roles-errors"

export type RolesViewActions = {
  archiveTargetRole: (input: ArchiveTargetRoleInput) => Promise<RolesPageResponse>
  createTargetRole: (input: CreateTargetRoleInput) => Promise<RolesPageResponse>
  deleteTargetRole: (input: DeleteTargetRoleInput) => Promise<RolesPageResponse>
  retryJobDescriptionParsing: (
    input: StartOrRetryJobDescriptionParsingInput,
  ) => Promise<RolesPageResponse>
  retryJobDescriptionSynchronization: (
    input: GetJobDescriptionParsingStatusInput,
  ) => Promise<RolesPageResponse>
  saveJobDescription: (input: SaveTargetRoleJobDescriptionInput) => Promise<RolesPageResponse>
  setCurrentTargetRole: (input: SetCurrentTargetRoleInput) => Promise<RolesPageResponse>
  updateRolePreparationStatus: (
    input: UpdateTargetRolePreparationStatusInput,
  ) => Promise<RolesPageResponse>
  updateTargetRole: (input: UpdateTargetRoleInput) => Promise<RolesPageResponse>
}

export type RolesViewProps =
  | {
      variant: "default"
      content: Loadable<RolesPageResponse>
      actions?: RolesViewActions
      initialSelectedRoleId?: string
      jobDescriptionSynchronizationErrorRoleIds?: string[]
    }
  | {
      variant: "error"
      onRetry: () => void
    }

export function RolesView(props: RolesViewProps) {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      {props.variant === "error" ? (
        <>
          <RolesHeader />
          <RolesErrorState onRetry={props.onRetry} />
        </>
      ) : props.content.status === "loading" ? (
        <>
          <RolesHeader />
          <RolesLoadingState />
        </>
      ) : (
        <RolesReadyView
          actions={props.actions}
          data={props.content.data}
          initialSelectedRoleId={props.initialSelectedRoleId}
          jobDescriptionSynchronizationErrorRoleIds={
            props.jobDescriptionSynchronizationErrorRoleIds ?? []
          }
        />
      )}
    </div>
  )
}

function RolesReadyView({
  actions,
  data,
  initialSelectedRoleId,
  jobDescriptionSynchronizationErrorRoleIds,
}: {
  actions?: RolesViewActions
  data: RolesPageResponse
  initialSelectedRoleId?: string
  jobDescriptionSynchronizationErrorRoleIds: string[]
}) {
  const { t } = useTranslation()
  const defaultSelectedRoleId =
    initialSelectedRoleId ?? data.currentRoleId ?? data.roles[0]?.id ?? null
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(defaultSelectedRoleId)
  const [editorMode, setEditorMode] = useState<"create" | "edit" | null>(null)
  const [isJobDescriptionEditorOpen, setIsJobDescriptionEditorOpen] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [isDiscardDialogOpen, setIsDiscardDialogOpen] = useState(false)
  const [confirmation, setConfirmation] = useState<"archive" | "delete" | null>(null)
  const [pendingAction, setPendingAction] = useState(false)
  const [actionError, setActionError] = useState<RolesActionErrorCode | null>(null)
  const blocker = useBlocker({
    disabled: !isDirty,
    enableBeforeUnload: isDirty,
    shouldBlockFn: () => isDirty,
    withResolver: true,
  })

  const handleDirtyChange = useCallback((nextIsDirty: boolean) => setIsDirty(nextIsDirty), [])

  function closeEditor() {
    setEditorMode(null)
    setIsJobDescriptionEditorOpen(false)
    setIsDirty(false)
  }

  function requestCloseEditor() {
    if (isDirty) setIsDiscardDialogOpen(true)
    else closeEditor()
  }

  async function runAction(action: () => Promise<RolesPageResponse>) {
    if (pendingAction) return false
    setPendingAction(true)
    setActionError(null)
    try {
      await action()
      return true
    } catch (error) {
      setActionError(getRolesActionErrorCode(error))
      return false
    } finally {
      setPendingAction(false)
    }
  }

  const selectedRole =
    data.roles.find((role) => role.id === selectedRoleId) ??
    data.roles.find((role) => role.id === data.currentRoleId) ??
    data.roles[0] ??
    null

  return (
    <div className="flex flex-col gap-4">
      <RolesHeader
        disabled={pendingAction}
        onAdd={actions ? () => setEditorMode("create") : undefined}
      />
      {data.roles.length === 0 ? (
        <RolesEmptyState />
      ) : (
        <>
          {data.currentRoleId === null && (
            <Alert data-testid="roles-no-current-alert">
              <AlertCircleIcon />
              <AlertTitle>{t("roles.noCurrentRole")}</AlertTitle>
            </Alert>
          )}
          {actionError && (
            <Alert variant="destructive">
              <AlertCircleIcon />
              <AlertTitle>{t("roles.errors.actionTitle")}</AlertTitle>
              <AlertDescription>{t(`roles.errors.${actionError}`)}</AlertDescription>
            </Alert>
          )}
          <div className="grid gap-4 lg:grid-cols-[minmax(16rem,0.8fr)_minmax(0,2fr)]">
            <RolesList
              onSelectRole={setSelectedRoleId}
              roles={data.roles}
              selectedRoleId={selectedRole?.id ?? null}
            />
            {selectedRole ? (
              <RoleDetails
                actions={
                  actions
                    ? {
                        archive: () => setConfirmation("archive"),
                        delete: () => setConfirmation("delete"),
                        edit: () => setEditorMode("edit"),
                        editJobDescription: () => setIsJobDescriptionEditorOpen(true),
                        retryJobDescriptionParsing: () => {
                          if (selectedRole.jobDescription.status !== "failed") return
                          const jobDescriptionVersion = selectedRole.jobDescription.version
                          void runAction(() =>
                            actions.retryJobDescriptionParsing({
                              roleId: selectedRole.id,
                              version: selectedRole.version,
                              jobDescriptionVersion,
                            }),
                          )
                        },
                        retryJobDescriptionSynchronization: () => {
                          if (selectedRole.jobDescription.status !== "parsing") return
                          const jobDescriptionVersion = selectedRole.jobDescription.version
                          void runAction(() =>
                            actions.retryJobDescriptionSynchronization({
                              roleId: selectedRole.id,
                              version: selectedRole.version,
                              jobDescriptionVersion,
                            }),
                          )
                        },
                        setCurrent: () =>
                          void runAction(() =>
                            actions.setCurrentTargetRole({
                              roleId: selectedRole.id,
                              version: selectedRole.version,
                            }),
                          ),
                        togglePreparationStatus: () =>
                          void runAction(() =>
                            actions.updateRolePreparationStatus({
                              roleId: selectedRole.id,
                              version: selectedRole.version,
                              preparationStatus:
                                selectedRole.preparationStatus === "preparing"
                                  ? "paused"
                                  : "preparing",
                            }),
                          ),
                      }
                    : undefined
                }
                pending={pendingAction}
                role={selectedRole}
                jobDescriptionSynchronizationError={jobDescriptionSynchronizationErrorRoleIds.includes(
                  selectedRole.id,
                )}
              />
            ) : (
              <RolesNoSelectionState />
            )}
          </div>
        </>
      )}

      {actions && (
        <>
          <RoleEditorDialog
            mode={editorMode ?? "create"}
            onCreate={async (input) => {
              await actions.createTargetRole(input)
            }}
            onDirtyChange={handleDirtyChange}
            onOpenChange={(open) => !open && requestCloseEditor()}
            onSaved={closeEditor}
            onUpdate={async (input) => {
              await actions.updateTargetRole(input)
            }}
            open={editorMode !== null}
            role={editorMode === "edit" ? selectedRole : null}
          />
          <JobDescriptionEditorDialog
            onDirtyChange={handleDirtyChange}
            onOpenChange={(open) => !open && requestCloseEditor()}
            onSave={async (input) => {
              await actions.saveJobDescription(input)
            }}
            onSaved={closeEditor}
            open={isJobDescriptionEditorOpen}
            role={selectedRole}
          />
        </>
      )}

      <ConfirmationDialog
        action={confirmation}
        isPending={pendingAction}
        onCancel={() => setConfirmation(null)}
        onConfirm={() => {
          if (!actions || !selectedRole || !confirmation) return
          const action = confirmation
          void runAction(() =>
            action === "archive"
              ? actions.archiveTargetRole({
                  roleId: selectedRole.id,
                  version: selectedRole.version,
                })
              : actions.deleteTargetRole({
                  roleId: selectedRole.id,
                  version: selectedRole.version,
                }),
          ).then((succeeded) => succeeded && setConfirmation(null))
        }}
      />

      <DiscardDialog
        open={isDiscardDialogOpen}
        onDiscard={() => {
          setIsDiscardDialogOpen(false)
          closeEditor()
        }}
        onStay={() => setIsDiscardDialogOpen(false)}
      />

      <AlertDialog open={blocker.status === "blocked"}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("roles.dialog.leavePageTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("roles.dialog.leavePageDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => blocker.reset?.()}>
              {t("roles.dialog.stayEditing")}
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => blocker.proceed?.()} variant="destructive">
              {t("roles.dialog.leavePage")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function ConfirmationDialog({
  action,
  isPending,
  onCancel,
  onConfirm,
}: {
  action: "archive" | "delete" | null
  isPending: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const { t } = useTranslation()
  return (
    <AlertDialog open={action !== null}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{action ? t(`roles.dialog.${action}Title`) : ""}</AlertDialogTitle>
          <AlertDialogDescription>
            {action ? t(`roles.dialog.${action}Description`) : ""}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending} onClick={onCancel}>
            {t("roles.dialog.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction disabled={isPending} onClick={onConfirm} variant="destructive">
            {action ? t(`roles.actions.${action}`) : ""}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function DiscardDialog({
  open,
  onDiscard,
  onStay,
}: {
  open: boolean
  onDiscard: () => void
  onStay: () => void
}) {
  const { t } = useTranslation()
  return (
    <AlertDialog open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("roles.dialog.discardDraftTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("roles.dialog.discardDraftDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onStay}>{t("roles.dialog.stayEditing")}</AlertDialogCancel>
          <AlertDialogAction onClick={onDiscard} variant="destructive">
            {t("roles.dialog.discardChanges")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
