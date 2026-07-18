import { AlertCircleIcon } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { Alert, AlertTitle } from "@/components/ui/alert"
import type { RolesPageResponse } from "@/models/roles"
import type { Loadable } from "@/types"

import { RoleDetails } from "./components/RoleDetails"
import { RolesHeader } from "./components/RolesHeader"
import { RolesList } from "./components/RolesList"
import {
  RolesEmptyState,
  RolesErrorState,
  RolesLoadingState,
  RolesNoSelectionState,
} from "./components/RolesPageStates"

export type RolesViewActions = {
  addTargetRole?: () => void
  setCurrentTargetRole?: (roleId: string) => void
}

export type RolesViewProps =
  | {
      variant: "default"
      content: Loadable<RolesPageResponse>
      actions?: RolesViewActions
      initialSelectedRoleId?: string
    }
  | {
      variant: "error"
      onRetry: () => void
    }

export function RolesView(props: RolesViewProps) {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <RolesHeader />
      {props.variant === "error" ? (
        <RolesErrorState onRetry={props.onRetry} />
      ) : props.content.status === "loading" ? (
        <RolesLoadingState />
      ) : (
        <RolesReadyView
          data={props.content.data}
          initialSelectedRoleId={props.initialSelectedRoleId}
        />
      )}
    </div>
  )
}

function RolesReadyView({
  data,
  initialSelectedRoleId,
}: {
  data: RolesPageResponse
  initialSelectedRoleId?: string
}) {
  const { t } = useTranslation()
  const defaultSelectedRoleId =
    initialSelectedRoleId ?? data.currentRoleId ?? data.roles[0]?.id ?? null
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(defaultSelectedRoleId)

  if (data.roles.length === 0) return <RolesEmptyState />

  const selectedRole =
    data.roles.find((role) => role.id === selectedRoleId) ??
    data.roles.find((role) => role.id === data.currentRoleId) ??
    data.roles[0] ??
    null

  return (
    <div className="flex flex-col gap-4">
      {data.currentRoleId === null && (
        <Alert data-testid="roles-no-current-alert">
          <AlertCircleIcon />
          <AlertTitle>{t("roles.noCurrentRole")}</AlertTitle>
        </Alert>
      )}
      <div className="grid gap-4 lg:grid-cols-[minmax(16rem,0.8fr)_minmax(0,2fr)]">
        <RolesList
          onSelectRole={setSelectedRoleId}
          roles={data.roles}
          selectedRoleId={selectedRole?.id ?? null}
        />
        {selectedRole ? <RoleDetails role={selectedRole} /> : <RolesNoSelectionState />}
      </div>
    </div>
  )
}
