import { BriefcaseBusinessIcon, Building2Icon, MapPinIcon, TimerIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import type { TargetRole, TargetRoleExperienceRange } from "@/models/roles"

import { RoleStatusBadges } from "./RoleStatusBadges"

export function RoleDetails({ role }: { role: TargetRole }) {
  const { t } = useTranslation()

  return (
    <Card data-testid="role-details-card">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <CardTitle>
              <h2>{role.title}</h2>
            </CardTitle>
            <CardDescription>{role.company ?? t("roles.fallbackValue")}</CardDescription>
          </div>
          <RoleStatusBadges role={role} />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <section aria-labelledby="role-basics-title" className="flex flex-col gap-3">
          <h3 className="font-heading font-medium" id="role-basics-title">
            {t("roles.details.sections.basics")}
          </h3>
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
            <RoleField
              icon={TimerIcon}
              label={t("roles.details.fields.experience")}
              value={formatExperience(role.experienceRange, t)}
            />
          </dl>
        </section>

        <Separator />

        <div className="grid gap-4 xl:grid-cols-2">
          <StatusSummary
            description={
              role.jobDescription.status === "failed"
                ? role.jobDescription.parsingFailureReason
                : t(`roles.jobDescriptionStatus.${role.jobDescription.status}.description`)
            }
            label={t(`roles.jobDescriptionStatus.${role.jobDescription.status}.label`)}
            title={t("roles.details.sections.jobDescription")}
            variant={role.jobDescription.status === "failed" ? "destructive" : "outline"}
          />
          <StatusSummary
            description={t(
              `roles.matchingAnalysisStatus.${role.matchingAnalysis?.status ?? "none"}.description`,
            )}
            label={t(
              `roles.matchingAnalysisStatus.${role.matchingAnalysis?.status ?? "none"}.label`,
            )}
            title={t("roles.details.sections.matchingAnalysis")}
            variant={role.matchingAnalysis?.status === "failed" ? "destructive" : "outline"}
          />
        </div>
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

function StatusSummary({
  description,
  label,
  title,
  variant,
}: {
  description: string
  label: string
  title: string
  variant: "destructive" | "outline"
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>
            <h3>{title}</h3>
          </CardTitle>
          <Badge variant={variant}>{label}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-6 text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  )
}

function formatExperience(
  range: TargetRoleExperienceRange | null,
  t: ReturnType<typeof useTranslation>["t"],
) {
  if (!range || (range.minYears === null && range.maxYears === null)) {
    return t("roles.experience.unspecified")
  }
  if (range.minYears !== null && range.maxYears !== null) {
    return t("roles.experience.range", { min: range.minYears, max: range.maxYears })
  }
  if (range.minYears !== null) return t("roles.experience.minimum", { min: range.minYears })
  return t("roles.experience.maximum", { max: range.maxYears })
}
