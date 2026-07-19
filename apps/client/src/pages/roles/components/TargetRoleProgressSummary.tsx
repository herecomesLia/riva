import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { ProfileContext, TargetRole } from "@/models/roles"

import { RoleStatusBadges } from "./RoleStatusBadges"

export function TargetRoleProgressSummary({
  profileContext,
  role,
}: {
  profileContext: ProfileContext
  role: TargetRole
}) {
  const { i18n, t } = useTranslation()
  const matchingStatus = role.matchingAnalysis?.status ?? "none"
  const currentScore =
    role.matchingAnalysis?.status === "current"
      ? `${role.matchingAnalysis.result.overallMatchScore}%`
      : role.matchingAnalysis?.status === "stale"
        ? t("roles.summary.scoreStale")
        : t("roles.summary.scoreUnavailable")
  const profileStatus = !profileContext.exists
    ? "missing"
    : profileContext.completed
      ? "complete"
      : "incomplete"
  const updatedAt = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(role.updatedAt))

  return (
    <Card data-testid="target-role-progress-summary" size="sm">
      <CardHeader>
        <CardTitle>
          <h2>{t("roles.summary.title")}</h2>
        </CardTitle>
        <CardDescription className="truncate">{role.title}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <RoleStatusBadges role={role} />
        <dl className="grid gap-3 text-sm">
          <SummaryRow
            label={t("roles.summary.profile")}
            value={
              <Badge variant="outline">{t(`roles.summary.profileStatus.${profileStatus}`)}</Badge>
            }
          />
          <SummaryRow
            label={t("roles.summary.jobDescription")}
            value={
              <Badge variant="outline">
                {t(`roles.jobDescriptionStatus.${role.jobDescription.status}.label`)}
              </Badge>
            }
          />
          <SummaryRow
            label={t("roles.summary.matchingAnalysis")}
            value={
              <Badge variant={matchingStatus === "failed" ? "destructive" : "outline"}>
                {t(`roles.matchingAnalysisStatus.${matchingStatus}.label`)}
              </Badge>
            }
          />
          <SummaryRow label={t("roles.summary.currentScore")} value={currentScore} />
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
      <dd className="min-w-0 text-right font-medium">{value}</dd>
    </div>
  )
}
