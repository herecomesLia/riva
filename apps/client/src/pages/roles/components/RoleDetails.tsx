import {
  ArchiveIcon,
  BriefcaseBusinessIcon,
  Building2Icon,
  MapPinIcon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
  StarIcon,
  TimerIcon,
  Trash2Icon,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import type { ProfileContext, TargetRole, TargetRoleExperienceRange } from "@/models/roles"

import { JobDescriptionCard } from "./JobDescriptionCard"
import { MatchingAnalysisCard } from "./MatchingAnalysisCard"
import { RoleStatusBadges } from "./RoleStatusBadges"

export type RoleDetailsActions = {
  archive: () => void
  delete: () => void
  edit: () => void
  setCurrent: () => void
  togglePreparationStatus: () => void
  editJobDescription: () => void
  retryJobDescriptionParsing: () => void
  retryJobDescriptionSynchronization: () => void
  generateMatchingAnalysis: () => void
  retryMatchingAnalysisSynchronization: () => void
}

export function RoleDetails({
  actions,
  pending,
  profileContext,
  role,
  jobDescriptionSynchronizationError = false,
  matchingAnalysisSynchronizationError = false,
}: {
  actions?: RoleDetailsActions
  jobDescriptionSynchronizationError?: boolean
  matchingAnalysisSynchronizationError?: boolean
  pending?: boolean
  profileContext: ProfileContext
  role: TargetRole
}) {
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
        {actions && (
          <div className="flex flex-wrap gap-2" data-testid="role-actions">
            <Button disabled={pending} onClick={actions.edit} size="sm" variant="outline">
              <PencilIcon data-icon="inline-start" />
              {t("roles.actions.edit")}
            </Button>
            {!role.isCurrent && role.preparationStatus !== "archived" && (
              <Button disabled={pending} onClick={actions.setCurrent} size="sm" variant="outline">
                <StarIcon data-icon="inline-start" />
                {t("roles.actions.setCurrent")}
              </Button>
            )}
            {role.preparationStatus !== "archived" && (
              <Button
                disabled={pending}
                onClick={actions.togglePreparationStatus}
                size="sm"
                variant="outline"
              >
                {role.preparationStatus === "preparing" ? (
                  <PauseIcon data-icon="inline-start" />
                ) : (
                  <PlayIcon data-icon="inline-start" />
                )}
                {t(
                  role.preparationStatus === "preparing"
                    ? "roles.actions.pause"
                    : "roles.actions.resume",
                )}
              </Button>
            )}
            {role.preparationStatus !== "archived" && (
              <Button disabled={pending} onClick={actions.archive} size="sm" variant="outline">
                <ArchiveIcon data-icon="inline-start" />
                {t("roles.actions.archive")}
              </Button>
            )}
            <Button disabled={pending} onClick={actions.delete} size="sm" variant="destructive">
              <Trash2Icon data-icon="inline-start" />
              {t("roles.actions.delete")}
            </Button>
          </div>
        )}

        <Separator />

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

        <JobDescriptionCard
          onEdit={actions?.editJobDescription}
          onRetry={actions?.retryJobDescriptionParsing}
          onRetrySynchronization={actions?.retryJobDescriptionSynchronization}
          pending={pending}
          role={role}
          synchronizationError={jobDescriptionSynchronizationError}
        />

        <MatchingAnalysisCard
          onGenerate={actions?.generateMatchingAnalysis}
          onRetrySynchronization={actions?.retryMatchingAnalysisSynchronization}
          pending={pending}
          profileContext={profileContext}
          role={role}
          synchronizationError={matchingAnalysisSynchronizationError}
        />
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
