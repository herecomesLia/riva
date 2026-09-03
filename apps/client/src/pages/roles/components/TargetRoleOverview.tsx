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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import type { TargetRole } from "@/models/roles"

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
  role: TargetRole
}) {
  const { t } = useTranslation()

  return (
    <Card
      className="border border-border/70 bg-card shadow-none"
      data-testid="target-role-overview"
      size="sm"
    >
      <CardHeader>
        <CardTitle>
          <h3>{t("roles.details.sections.basics")}</h3>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {actions && (
          <div className="flex flex-wrap gap-2" data-testid="role-actions">
            <Button
              className="border-primary text-primary hover:bg-primary/10 hover:text-primary"
              disabled={pending}
              onClick={actions.edit}
              size="sm"
              variant="outline"
            >
              <PencilIcon className="size-4" data-icon="inline-start" />
              {t("roles.actions.edit")}
            </Button>
            {!isCurrent && role.status !== "archived" && (
              <Button disabled={pending} onClick={actions.setCurrent} size="sm" variant="outline">
                <StarIcon data-icon="inline-start" />
                {t("roles.actions.setCurrent")}
              </Button>
            )}
            {role.status !== "archived" && (
              <Button disabled={pending} onClick={actions.archive} size="sm" variant="outline">
                <ArchiveIcon data-icon="inline-start" />
                {t("roles.actions.archive")}
              </Button>
            )}
            {role.status === "archived" && (
              <Button disabled={pending} onClick={actions.restore} size="sm" variant="outline">
                <ArchiveRestoreIcon data-icon="inline-start" />
                {t("roles.actions.restore")}
              </Button>
            )}
            <Button disabled={pending} onClick={actions.delete} size="sm" variant="destructive">
              <Trash2Icon data-icon="inline-start" />
              {t("roles.actions.delete")}
            </Button>
          </div>
        )}

        {actions && <Separator />}

        <dl className="grid gap-4 sm:grid-cols-2">
          <RoleField
            icon={Building2Icon}
            label={t("roles.details.fields.company")}
            value={role.company ?? t("roles.fallbackValue")}
          />
          <RoleField
            icon={BriefcaseBusinessIcon}
            label={t("roles.details.fields.recruitmentType")}
            value={
              role.recruitmentType
                ? t(`roles.recruitmentType.${role.recruitmentType}`)
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
    <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
      <Icon aria-hidden="true" className="row-span-2 mt-0.5 size-5 text-muted-foreground" />
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm font-medium">{value}</dd>
    </div>
  )
}
