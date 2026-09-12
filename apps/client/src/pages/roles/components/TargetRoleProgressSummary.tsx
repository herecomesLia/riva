import type { RoleResources } from "../types"
import { getJobDescriptionUiStatus } from "../job-description-status"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { TargetRoleResponse } from "@/api/generated/models"

export function TargetRoleProgressSummary({
  isCurrent,
  role,
  jdTask,
  analysis,
}: {
  isCurrent: boolean
  jdTask: RoleResources["jdTasksByRoleId"][string]
  analysis: RoleResources["matchingByRoleId"][string]
  role: TargetRoleResponse
}) {
  const { i18n, t } = useTranslation()
  const matchingStatus = analysis?.status ?? "loading"
  const roleStatus = role.isArchived ? "archived" : "active"
  const updatedAt = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(role.updatedAt))

  return (
    <Card data-testid="target-role-progress-summary">
      <CardHeader>
        <CardTitle>
          <h2>{t("roles.summary.title")}</h2>
        </CardTitle>
        <CardDescription className="truncate">{role.title}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <dl className="grid gap-3 text-sm">
          <SummaryRow
            label={t("roles.summary.roleStatus")}
            value={
              isCurrent
                ? `${t("roles.badges.current")} · ${t(`roles.status.${roleStatus}`)}`
                : t(`roles.status.${roleStatus}`)
            }
          />
          <SummaryRow
            label={t("roles.summary.jobDescription")}
            value={t(`roles.jobDescriptionStatus.${getJobDescriptionUiStatus(role, jdTask)}.label`)}
          />
          <SummaryRow
            label={t("roles.summary.matchingAnalysis")}
            value={t(`roles.matchingAnalysisStatus.${matchingStatus}.label`)}
          />
          <SummaryRow label={t("roles.summary.updatedAt")} value={updatedAt} />
        </dl>
      </CardContent>
    </Card>
  )
}

function SummaryRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right text-sm font-medium">{value}</dd>
    </div>
  )
}
