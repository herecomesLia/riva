import {
  AwardIcon,
  BrainIcon,
  BriefcaseBusinessIcon,
  CodeXmlIcon,
  FilePenLineIcon,
  GraduationCapIcon,
  ListChecksIcon,
  PencilIcon,
  RefreshCwIcon,
  SparklesIcon,
  type LucideIcon,
} from "lucide-react"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import type {
  JobDescriptionAnalysis,
  JobDescriptionAnalysisModuleField,
  QualificationRequirements,
  RequiredSkillGroups,
  TargetRole,
} from "@/models/roles"

export function JobDescriptionCard({
  onEdit,
  onEditAnalysisModule,
  onRetry,
  onRetrySynchronization,
  pending,
  role,
  synchronizationError,
}: {
  onEdit?: () => void
  onEditAnalysisModule?: (field: JobDescriptionAnalysisModuleField) => void
  onRetry?: () => void
  onRetrySynchronization?: () => void
  pending?: boolean
  role: TargetRole
  synchronizationError: boolean
}) {
  const { t } = useTranslation()
  const { jobDescription } = role

  return (
    <Card
      className="border border-border/70 bg-card shadow-none"
      data-testid="job-description-card"
      size="sm"
    >
      <CardHeader>
        <div className="flex flex-col gap-1">
          <div className="flex min-h-9 flex-wrap items-center justify-between gap-3">
            <CardTitle>
              <h3>{t("roles.details.sections.jobDescription")}</h3>
            </CardTitle>
            {jobDescription.status === "ready" && onEdit && (
              <Button
                className="h-9 gap-2 border-primary px-3 text-sm text-primary translate-y-3 hover:bg-primary/10 hover:text-primary"
                disabled={pending}
                onClick={onEdit}
                size="default"
                variant="outline"
              >
                <FilePenLineIcon className="size-4" data-icon="inline-start" />
                {t("roles.jd.actions.replace")}
              </Button>
            )}
          </div>
          <CardDescription className="min-h-5 leading-5">
            {t("roles.jd.cardDescription")}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {jobDescription.status === "missing" && (
          <JobDescriptionEmpty onEdit={onEdit} pending={pending} />
        )}
        {jobDescription.status === "parsing" && (
          <ParsingState
            onRetrySynchronization={onRetrySynchronization}
            pending={pending}
            synchronizationError={synchronizationError}
          />
        )}
        {jobDescription.status === "failed" && (
          <FailedState
            failureReason={jobDescription.parsingFailureReason}
            onEdit={onEdit}
            onRetry={onRetry}
            pending={pending}
          />
        )}
        {jobDescription.status === "ready" && role.jobDescriptionAnalysis && (
          <ReadyState
            analysis={role.jobDescriptionAnalysis}
            canEditAnalysis={role.preparationStatus !== "archived"}
            onEditAnalysisModule={onEditAnalysisModule}
          />
        )}
      </CardContent>
    </Card>
  )
}

function JobDescriptionEmpty({ onEdit, pending }: { onEdit?: () => void; pending?: boolean }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-start gap-3">
      <p className="text-sm leading-6 text-muted-foreground">
        {t("roles.jobDescriptionStatus.missing.description")}
      </p>
      {onEdit && (
        <Button
          className="border-primary text-primary hover:bg-primary/10 hover:text-primary"
          disabled={pending}
          onClick={onEdit}
          size="sm"
          variant="outline"
        >
          <FilePenLineIcon className="size-4" data-icon="inline-start" />
          {t("roles.jd.actions.add")}
        </Button>
      )}
    </div>
  )
}

function ParsingState({
  onRetrySynchronization,
  pending,
  synchronizationError,
}: {
  onRetrySynchronization?: () => void
  pending?: boolean
  synchronizationError: boolean
}) {
  const { t } = useTranslation()
  if (synchronizationError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>{t("roles.jd.synchronization.title")}</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-3">
          <span>{t("roles.jd.synchronization.description")}</span>
          {onRetrySynchronization && (
            <Button disabled={pending} onClick={onRetrySynchronization} size="sm" variant="outline">
              <RefreshCwIcon data-icon="inline-start" />
              {t("roles.jd.actions.resynchronize")}
            </Button>
          )}
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="flex items-center gap-3" aria-live="polite">
      <Spinner />
      <p className="text-sm text-muted-foreground">
        {t("roles.jobDescriptionStatus.parsing.description")}
      </p>
    </div>
  )
}

function FailedState({
  failureReason,
  onEdit,
  onRetry,
  pending,
}: {
  failureReason: string
  onEdit?: () => void
  onRetry?: () => void
  pending?: boolean
}) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-4">
      <Alert variant="destructive">
        <AlertTitle>{t("roles.jd.failed.title")}</AlertTitle>
        <AlertDescription>{failureReason}</AlertDescription>
      </Alert>
      <div className="flex flex-wrap gap-2">
        {onRetry && (
          <Button disabled={pending} onClick={onRetry} size="sm">
            {pending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <RefreshCwIcon data-icon="inline-start" />
            )}
            {t("roles.jd.actions.retry")}
          </Button>
        )}
        {onEdit && (
          <Button
            className="border-primary text-primary hover:bg-primary/10 hover:text-primary"
            disabled={pending}
            onClick={onEdit}
            size="sm"
            variant="outline"
          >
            <FilePenLineIcon className="size-4" data-icon="inline-start" />
            {t("roles.jd.actions.replace")}
          </Button>
        )}
      </div>
    </div>
  )
}

function ReadyState({
  analysis,
  canEditAnalysis,
  onEditAnalysisModule,
}: {
  analysis: JobDescriptionAnalysis
  canEditAnalysis: boolean
  onEditAnalysisModule?: (field: JobDescriptionAnalysisModuleField) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-5" data-testid="job-description-analysis">
      <AnalysisSection icon={SparklesIcon} title={t("roles.jd.analysis.rivaSummary")}>
        <p className="text-sm leading-6">{analysis.rivaSummary}</p>
      </AnalysisSection>
      <AnalysisList
        field="responsibilities"
        items={analysis.responsibilities}
        icon={ListChecksIcon}
        onEdit={canEditAnalysis ? onEditAnalysisModule : undefined}
        title={t("roles.jd.analysis.responsibilities")}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <AnalysisCategorizedList
          field="qualificationRequirements"
          groups={analysis.qualificationRequirements}
          icon={GraduationCapIcon}
          labels={{
            education: t("roles.jd.analysis.qualificationCategories.education"),
            graduationCohorts: t("roles.jd.analysis.qualificationCategories.graduationCohorts"),
            majors: t("roles.jd.analysis.qualificationCategories.majors"),
            experience: t("roles.jd.analysis.qualificationCategories.experience"),
            languages: t("roles.jd.analysis.qualificationCategories.languages"),
            certifications: t("roles.jd.analysis.qualificationCategories.certifications"),
            other: t("roles.jd.analysis.qualificationCategories.other"),
          }}
          onEdit={canEditAnalysis ? onEditAnalysisModule : undefined}
          title={t("roles.jd.analysis.qualificationRequirements")}
        />
        <AnalysisCategorizedList
          field="requiredSkills"
          groups={analysis.requiredSkills}
          icon={CodeXmlIcon}
          labels={{
            programmingLanguages: t("roles.jd.analysis.skillCategories.programmingLanguages"),
            frameworksAndLibraries: t("roles.jd.analysis.skillCategories.frameworksAndLibraries"),
            platforms: t("roles.jd.analysis.skillCategories.platforms"),
            tools: t("roles.jd.analysis.skillCategories.tools"),
            conceptsAndMethods: t("roles.jd.analysis.skillCategories.conceptsAndMethods"),
            databasesAndMiddleware: t("roles.jd.analysis.skillCategories.databasesAndMiddleware"),
            other: t("roles.jd.analysis.skillCategories.other"),
          }}
          onEdit={canEditAnalysis ? onEditAnalysisModule : undefined}
          title={t("roles.jd.analysis.requiredSkills")}
        />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <AnalysisList
          field="preferredQualifications"
          icon={AwardIcon}
          items={analysis.preferredQualifications}
          onEdit={canEditAnalysis ? onEditAnalysisModule : undefined}
          title={t("roles.jd.analysis.preferredQualifications")}
        />
        <AnalysisList
          field="softSkills"
          icon={BrainIcon}
          items={analysis.softSkills}
          onEdit={canEditAnalysis ? onEditAnalysisModule : undefined}
          title={t("roles.jd.analysis.softSkills")}
        />
        <AnalysisList
          field="businessDomains"
          icon={BriefcaseBusinessIcon}
          items={analysis.businessDomains}
          onEdit={canEditAnalysis ? onEditAnalysisModule : undefined}
          title={t("roles.jd.analysis.businessDomains")}
        />
      </div>
    </div>
  )
}

function AnalysisSection({
  children,
  field,
  icon: Icon,
  onEdit,
  title,
}: {
  children: ReactNode
  field?: JobDescriptionAnalysisModuleField
  icon: LucideIcon
  onEdit?: (field: JobDescriptionAnalysisModuleField) => void
  title: string
}) {
  const { t } = useTranslation()
  return (
    <section className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <h4 className="flex items-center gap-2 font-heading font-medium">
          <Icon aria-hidden="true" className="size-4 text-primary" />
          {title}
        </h4>
        {onEdit && field && (
          <Button
            aria-label={t("roles.jd.actions.editModuleLabel", { module: title })}
            className="border-primary text-primary hover:bg-primary/10 hover:text-primary"
            onClick={() => onEdit(field)}
            size="xs"
            variant="outline"
          >
            <PencilIcon data-icon="inline-start" />
            {t("roles.jd.actions.editModule")}
          </Button>
        )}
      </div>
      {children}
    </section>
  )
}

function AnalysisCategorizedList({
  field,
  groups,
  icon,
  labels,
  onEdit,
  title,
}: {
  field: "qualificationRequirements" | "requiredSkills"
  groups: QualificationRequirements | RequiredSkillGroups
  icon: LucideIcon
  labels: Record<string, string>
  onEdit?: (field: JobDescriptionAnalysisModuleField) => void
  title: string
}) {
  const entries = Object.keys(labels).filter((key) => groups[key as keyof typeof groups].length > 0)
  if (!entries.length) return null
  return (
    <AnalysisSection field={field} icon={icon} onEdit={onEdit} title={title}>
      <dl className="flex flex-col gap-3 text-sm leading-6">
        {entries.map((key) => (
          <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-3" key={String(key)}>
            <dt className="text-muted-foreground">{labels[key]}</dt>
            <dd>
              <ul className="flex flex-col gap-1">
                {groups[key as keyof typeof groups].map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </dd>
          </div>
        ))}
      </dl>
    </AnalysisSection>
  )
}

function AnalysisList({
  field,
  icon,
  items,
  onEdit,
  title,
}: {
  field: JobDescriptionAnalysisModuleField
  icon: LucideIcon
  items: string[]
  onEdit?: (field: JobDescriptionAnalysisModuleField) => void
  title: string
}) {
  if (!items.length) return null
  return (
    <AnalysisSection field={field} icon={icon} onEdit={onEdit} title={title}>
      <ul className="flex list-disc flex-col gap-2 pl-5 text-sm leading-6">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </AnalysisSection>
  )
}
