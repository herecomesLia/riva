import type { RoleResources } from "./types"
import { AlertCircleIcon } from "lucide-react"
import { useBlocker } from "@tanstack/react-router"
import { useCallback, useEffect, useState } from "react"
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
  CreateRoleRequest,
  RoleResponse,
  UpdateJobDescriptionRequest,
  UpdateRoleRequest,
  RoleListResponse,
} from "@/api/generated/models"
import type { JdField } from "@/pages/roles/types"
import type { RecognizeRoleInput } from "@/mocks/models/role"
import type { Loadable } from "@/types"

import { MobileRoleSelector } from "./components/MobileRoleSelector"
import { RoleDetails, type RoleTab } from "./components/RoleDetails"
import { RoleProgressSummary } from "./components/RoleProgressSummary"
import { RoleEditorDialog } from "./components/RoleEditorDialog"
import { RoleCreationDialog } from "./components/RoleCreationDialog"
import { JobDescriptionEditorDialog } from "./components/JobDescriptionEditorDialog"
import { JobDescriptionAnalysisEditorDialog } from "./components/JobDescriptionAnalysisEditorDialog"
import { RolesHeader } from "./components/RolesHeader"
import { RolesList } from "./components/RolesList"
import { getRolesForCategory, type RoleListCategory } from "./components/roles-list-utils"
import {
  RolesEmptyState,
  RolesErrorState,
  RolesLoadingState,
  RolesNoSelectionState,
} from "./components/RolesPageStates"
import { getRolesActionErrorCode, type RolesActionErrorCode } from "./roles-errors"

export type RolesViewActions = {
  archiveRole: (roleId: string) => Promise<unknown>
  createRole: (input: CreateRoleRequest) => Promise<RoleResponse>
  deleteRole: (roleId: string) => Promise<unknown>
  startRoleMatching: (roleId: string) => Promise<unknown>
  retryJdSynchronization: (roleId: string) => Promise<unknown>
  abortRoleMatching: (roleId: string) => Promise<unknown>
  retryMatchingState: (roleId: string) => Promise<unknown>
  recognizeRole: (input: RecognizeRoleInput) => Promise<RoleResponse>
  restoreRole: (roleId: string) => Promise<unknown>
  extractJdFromText: (roleId: string, text: string) => Promise<unknown>
  retryJdExtraction: (roleId: string) => Promise<unknown>
  abortJdExtraction: (roleId: string) => Promise<unknown>
  setActiveRole: (roleId: string) => Promise<unknown>
  updateJd: (roleId: string, input: UpdateJobDescriptionRequest) => Promise<unknown>
  updateRole: (roleId: string, input: UpdateRoleRequest) => Promise<unknown>
}

export type RolesViewProps =
  | {
      variant: "default"
      content: Loadable<RoleListResponse>
      jdTasksByRoleId?: RoleResources["jdTasksByRoleId"]
      matchingStatesByRoleId?: RoleResources["matchingStatesByRoleId"]
      actions?: RolesViewActions
      onSelectedRoleChange?: (roleId: string | null) => void
      initialActiveTab?: RoleTab
      initialSelectedRoleId?: string
      jdSynchronizationErrorRoleIds?: string[]
      matchSynchronizationErrorRoleIds?: string[]
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
          onSelectedRoleChange={props.onSelectedRoleChange}
          actions={props.actions}
          data={props.content.data}
          jdTasksByRoleId={props.jdTasksByRoleId ?? {}}
          matchingStatesByRoleId={props.matchingStatesByRoleId ?? {}}
          initialActiveTab={props.initialActiveTab}
          initialSelectedRoleId={props.initialSelectedRoleId}
          jdSynchronizationErrorRoleIds={props.jdSynchronizationErrorRoleIds ?? []}
          matchSynchronizationErrorRoleIds={props.matchSynchronizationErrorRoleIds ?? []}
        />
      )}
    </div>
  )
}

function RolesReadyView({
  onSelectedRoleChange,
  actions,
  data,
  jdTasksByRoleId,
  matchingStatesByRoleId,
  initialActiveTab,
  initialSelectedRoleId,
  jdSynchronizationErrorRoleIds,
  matchSynchronizationErrorRoleIds,
}: {
  onSelectedRoleChange?: (roleId: string | null) => void
  actions?: RolesViewActions
  jdTasksByRoleId: RoleResources["jdTasksByRoleId"]
  matchingStatesByRoleId: RoleResources["matchingStatesByRoleId"]
  data: RoleListResponse
  initialActiveTab?: RoleTab
  initialSelectedRoleId?: string
  jdSynchronizationErrorRoleIds: string[]
  matchSynchronizationErrorRoleIds: string[]
}) {
  const { t } = useTranslation()
  const defaultSelectedRoleId =
    initialSelectedRoleId ?? data.activeRoleId ?? data.roles[0]?.id ?? null
  const initiallySelectedRole = data.roles.find((role) => role.id === defaultSelectedRoleId)
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(defaultSelectedRoleId)
  const [roleCategory, setRoleCategory] = useState<RoleListCategory>(
    initiallySelectedRole?.isArchived ? "archived" : "active",
  )
  const [activeTab, setActiveTab] = useState<RoleTab>(initialActiveTab ?? "overview")
  const [editorMode, setEditorMode] = useState<"edit" | null>(null)
  const [isCreationDialogOpen, setIsCreationDialogOpen] = useState(false)
  const [isJobDescriptionEditorOpen, setIsJobDescriptionEditorOpen] = useState(false)
  const [jdEditorField, setJdEditorField] = useState<JdField | null>(null)
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
    setIsCreationDialogOpen(false)
    setIsJobDescriptionEditorOpen(false)
    setJdEditorField(null)
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
      setActionError(getRolesActionErrorCode(error))
      return false
    } finally {
      setPendingAction(false)
    }
  }

  const visibleRoles = getRolesForCategory(data.roles, roleCategory)
  const selectedRole =
    visibleRoles.find((role) => role.id === selectedRoleId) ??
    visibleRoles.find((role) => role.id === data.activeRoleId) ??
    visibleRoles[0] ??
    null

  useEffect(() => {
    onSelectedRoleChange?.(selectedRole?.id ?? null)
  }, [onSelectedRoleChange, selectedRole?.id])

  const jdTask = selectedRole ? jdTasksByRoleId[selectedRole.id] : undefined
  const analysis = selectedRole ? matchingStatesByRoleId[selectedRole.id] : undefined

  function handleRoleCategoryChange(category: RoleListCategory) {
    const nextRoles = getRolesForCategory(data.roles, category)
    setRoleCategory(category)
    setSelectedRoleId(nextRoles[0]?.id ?? null)
  }

  return (
    <div className="flex flex-col gap-4">
      <RolesHeader
        disabled={pendingAction}
        onAdd={actions ? () => setIsCreationDialogOpen(true) : undefined}
      />
      {data.roles.length === 0 ? (
        <RolesEmptyState />
      ) : (
        <>
          {data.activeRoleId === null && (
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
          <div className="grid items-start gap-6 @4xl/app:grid-cols-[minmax(15rem,0.7fr)_minmax(0,1.3fr)]">
            <aside
              className="hidden min-h-0 min-w-0 gap-4 @4xl/app:sticky @4xl/app:top-20 @4xl/app:flex @4xl/app:self-start @4xl/app:flex-col"
              data-testid="roles-desktop-navigation"
            >
              <RolesList
                category={roleCategory}
                className="shrink-0"
                activeRoleId={data.activeRoleId}
                onCategoryChange={handleRoleCategoryChange}
                onSelectRole={setSelectedRoleId}
                roles={data.roles}
                selectedRoleId={selectedRole?.id ?? null}
              />
              {selectedRole && (
                <RoleProgressSummary
                  isCurrent={selectedRole.id === data.activeRoleId}
                  role={selectedRole}
                  jdTask={jdTask}
                  matchingState={analysis}
                />
              )}
            </aside>
            <section className="flex min-w-0 flex-col gap-4">
              <MobileRoleSelector
                category={roleCategory}
                activeRoleId={data.activeRoleId}
                onCategoryChange={handleRoleCategoryChange}
                onSelectRole={setSelectedRoleId}
                roles={data.roles}
                selectedRole={selectedRole}
              />
              {selectedRole && (
                <div className="@4xl/app:hidden">
                  <RoleProgressSummary
                    isCurrent={selectedRole.id === data.activeRoleId}
                    role={selectedRole}
                    jdTask={jdTask}
                    matchingState={analysis}
                  />
                </div>
              )}
              {selectedRole ? (
                <RoleDetails
                  activeTab={activeTab}
                  actions={
                    actions
                      ? {
                          archive: () => setConfirmation("archive"),
                          delete: () => setConfirmation("delete"),
                          edit: () => setEditorMode("edit"),
                          editJd: () => setIsJobDescriptionEditorOpen(true),
                          editJdField: setJdEditorField,
                          startMatching: () => {
                            void runAction(() => actions.startRoleMatching(selectedRole.id))
                          },
                          abortMatching: () => {
                            void runAction(() => actions.abortRoleMatching(selectedRole.id))
                          },
                          retryJdSynchronization: () => {
                            void runAction(() => actions.retryJdSynchronization(selectedRole.id))
                          },
                          retryJdExtraction: () => {
                            if (jdTask?.status !== "failed") return
                            void runAction(() => actions.retryJdExtraction(selectedRole.id))
                          },
                          abortJdExtraction: () => {
                            if (!jdTask || jdTask.status === "idle" || jdTask.status === "failed")
                              return
                            void runAction(() => actions.abortJdExtraction(selectedRole.id))
                          },
                          retryMatchingState: () => {
                            void runAction(() => actions.retryMatchingState(selectedRole.id))
                          },
                          restore: () => {
                            const restoredRoleId = selectedRole.id
                            void runAction(() => actions.restoreRole(restoredRoleId)).then(
                              (succeeded) => {
                                if (!succeeded) return
                                setRoleCategory("active")
                                setSelectedRoleId(restoredRoleId)
                              },
                            )
                          },
                          setCurrent: () =>
                            void runAction(() => actions.setActiveRole(selectedRole.id)),
                        }
                      : undefined
                  }
                  activeRoleId={data.activeRoleId}
                  onTabChange={setActiveTab}
                  pending={pendingAction}
                  role={selectedRole}
                  jdTask={jdTask}
                  matchingState={analysis}
                  jdSynchronizationError={jdSynchronizationErrorRoleIds.includes(selectedRole.id)}
                  matchSynchronizationError={matchSynchronizationErrorRoleIds.includes(
                    selectedRole.id,
                  )}
                />
              ) : (
                <RolesNoSelectionState />
              )}
            </section>
          </div>
        </>
      )}

      {actions && (
        <>
          <RoleCreationDialog
            onDirtyChange={handleDirtyChange}
            onManualCreate={async (input) => {
              const createdRole = await actions.createRole(input)
              setRoleCategory("active")
              setSelectedRoleId(createdRole.id)
              setActiveTab("job-description")
            }}
            onOpenChange={(open) => !open && requestCloseEditor()}
            onRecognize={async (input) => {
              const createdRole = await actions.recognizeRole(input)
              setRoleCategory("active")
              setSelectedRoleId(createdRole.id)
              setActiveTab("job-description")
            }}
            onSaved={closeEditor}
            open={isCreationDialogOpen}
          />
          <RoleEditorDialog
            mode="edit"
            onCreate={async (input) => {
              await actions.createRole(input)
            }}
            onDirtyChange={handleDirtyChange}
            onOpenChange={(open) => !open && requestCloseEditor()}
            onSaved={closeEditor}
            onUpdate={async (roleId, input) => {
              await actions.updateRole(roleId, input)
            }}
            open={editorMode === "edit"}
            role={selectedRole}
          />
          <JobDescriptionEditorDialog
            onDirtyChange={handleDirtyChange}
            onOpenChange={(open) => !open && requestCloseEditor()}
            onSave={async (roleId, text) => {
              await actions.extractJdFromText(roleId, text)
            }}
            onSaved={closeEditor}
            open={isJobDescriptionEditorOpen}
            role={selectedRole}
          />
          <JobDescriptionAnalysisEditorDialog
            field={jdEditorField}
            onDirtyChange={handleDirtyChange}
            onOpenChange={(open) => !open && requestCloseEditor()}
            onSave={async (roleId, input) => {
              await actions.updateJd(roleId, input)
            }}
            onSaved={closeEditor}
            role={selectedRole}
            jdTask={jdTask}
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
              ? actions.archiveRole(selectedRole.id)
              : actions.deleteRole(selectedRole.id),
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
