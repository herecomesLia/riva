import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  BriefcaseBusinessIcon,
  Building2Icon,
  MapPinIcon,
  PencilIcon,
  StarIcon,
  Trash2Icon,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import type { RoleView } from "@/models/target-role-workflow"

import type { RoleDetailsActions } from "./RoleDetails"

export function TargetRoleOverview({
  actions,
  isCurrent,
  pending,
  role,
}: {
  actions?: RoleDetailsActions
  isCurrent: boolean
  pending?: boolean
  role: RoleView
}) {
  const { t } = useTranslation()

  return (
    <Card
      aria-label={t("roles.details.sections.basics")}
      className="bg-card shadow-none ring-border"
      data-testid="target-role-overview"
      size="sm"
    >
      <CardContent className="flex flex-col gap-6">
        <h3 className="text-base font-medium">{t("roles.details.sections.basics")}</h3>
        {actions && (
          <div className="flex flex-wrap gap-2" data-testid="role-actions">
            <Button disabled={pending} onClick={actions.edit} size="sm" variant="outline">
              <PencilIcon data-icon="inline-start" />
              {t("roles.actions.edit")}
            </Button>
            {!isCurrent && !role.isArchived && (
              <Button disabled={pending} onClick={actions.setCurrent} size="sm" variant="outline">
                <StarIcon data-icon="inline-start" />
                {t("roles.actions.setCurrent")}
              </Button>
            )}
            {!role.isArchived && (
              <Button disabled={pending} onClick={actions.archive} size="sm" variant="outline">
                <ArchiveIcon data-icon="inline-start" />
                {t("roles.actions.archive")}
              </Button>
            )}
            {role.isArchived && (
              <Button disabled={pending} onClick={actions.restore} size="sm" variant="outline">
                <ArchiveRestoreIcon data-icon="inline-start" />
                {t("roles.actions.restore")}
              </Button>
            )}
            <Button
              className="text-destructive hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
              disabled={pending}
              onClick={actions.delete}
              size="sm"
              variant="outline"
            >
              <Trash2Icon data-icon="inline-start" />
              {t("roles.actions.delete")}
            </Button>
          </div>
        )}
        <dl className="grid gap-4 @lg/role:grid-cols-3">
          <RoleField
            icon={Building2Icon}
            label={t("roles.details.fields.company")}
            value={role.company ?? t("roles.fallbackValue")}
          />
          <RoleField
            icon={BriefcaseBusinessIcon}
            label={t("roles.details.fields.recruitmentType")}
            value={
              role.recruitmentTrack
                ? t(`roles.recruitmentType.${role.recruitmentTrack}`)
                : t("roles.fallbackValue")
            }
          />
          <RoleField
            icon={MapPinIcon}
            label={t("roles.details.fields.location")}
            value={role.location ?? t("roles.fallbackValue")}
          />
        </dl>
      </CardContent>
    </Card>
  )
}

function RoleField({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Building2Icon
  label: string
  value: string
}) {
  return (
    <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-1">
      <Icon aria-hidden="true" className="row-span-2 mt-0.5 size-5 text-muted-foreground" />
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-sm font-medium">{value}</dd>
    </div>
  )
}
