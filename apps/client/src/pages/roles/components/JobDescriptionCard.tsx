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
  type LucideIcon,
} from "lucide-react"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import type {
  HardSkillsResponse,
  JobDescriptionResponse,
  JobRequirementsResponse,
} from "@/api/generated/models"
import type { JdField, RoleView } from "@/models/target-role-workflow"

export function JobDescriptionCard({
  onEdit,
  onEditAnalysisModule,
  onRetrySynchronization,
  onRetryExtraction,
  onAbortExtraction,
  pending,
  role,
  synchronizationError,
}: {
  onEdit?: () => void
  onEditAnalysisModule?: (field: JdField) => void
  onRetrySynchronization?: () => void
  onRetryExtraction?: () => void
  onAbortExtraction?: () => void
  pending?: boolean
  role: RoleView
  synchronizationError: boolean
}) {
  const { t } = useTranslation()
  const { jdState } = role
  const showSections = jdState.status === "missing" || jdState.status === "ready"

  return (
    <Card className="bg-card shadow-none ring-border" data-testid="job-description-card" size="sm">
      <CardHeader>
        <div className="flex flex-col gap-1">
          <div className="flex min-h-9 flex-wrap items-center justify-between gap-3">
            <CardTitle>
              <h3>{t("roles.details.sections.jobDescription")}</h3>
            </CardTitle>
            {showSections && onEdit && (
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
        {jdState.status === "extracting" && (
          <ExtractingState
            phase={jdState.phase}
            onAbortExtraction={onAbortExtraction}
            onRetrySynchronization={onRetrySynchronization}
            pending={pending}
            synchronizationError={synchronizationError}
          />
        )}
        {jdState.status === "failed" && (
          <FailedState
            failureReason={jdState.reason}
            onEdit={onEdit}
            onRetryExtraction={onRetryExtraction}
            pending={pending}
          />
        )}
        {showSections && (
          <JobDescriptionSections
            analysis={role.jd}
            canEditAnalysis={!role.isArchived}
            onEditAnalysisModule={onEditAnalysisModule}
          />
        )}
      </CardContent>
    </Card>
  )
}

function ExtractingState({
  phase,
  onAbortExtraction,
  onRetrySynchronization,
  pending,
  synchronizationError,
}: {
  phase: "queued" | "running" | "aborting"
  onAbortExtraction?: () => void
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
        {phase === "aborting"
          ? t("roles.jd.aborting")
          : t("roles.jobDescriptionStatus.extracting.description")}
      </p>
      {onAbortExtraction && (
        <Button
          disabled={pending || phase === "aborting"}
          onClick={onAbortExtraction}
          size="sm"
          variant="outline"
        >
          {t("roles.jd.actions.abortExtraction")}
        </Button>
      )}
    </div>
  )
}

function FailedState({
  failureReason,
  onEdit,
  onRetryExtraction,
  pending,
}: {
  failureReason: string
  onEdit?: () => void
  onRetryExtraction?: () => void
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
        {onRetryExtraction && (
          <Button disabled={pending} onClick={onRetryExtraction} size="sm" variant="outline">
            <RefreshCwIcon data-icon="inline-start" />
            {t("roles.jd.actions.retryExtraction")}
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

function JobDescriptionSections({
  analysis,
  canEditAnalysis,
  onEditAnalysisModule,
}: {
  analysis: JobDescriptionResponse
  canEditAnalysis: boolean
  onEditAnalysisModule?: (field: JdField) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-5" data-testid="job-description-analysis">
      <AnalysisList
        field="responsibilities"
        items={analysis.responsibilities}
        icon={ListChecksIcon}
        onEdit={canEditAnalysis ? onEditAnalysisModule : undefined}
        title={t("roles.jd.analysis.responsibilities")}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <AnalysisCategorizedList
          field="requirements"
          groups={analysis.requirements}
          icon={GraduationCapIcon}
          labels={{
            education: t("roles.jd.analysis.qualificationCategories.education"),
            graduationCohorts: t("roles.jd.analysis.qualificationCategories.graduationCohorts"),
            majors: t("roles.jd.analysis.qualificationCategories.majors"),
            experience: t("roles.jd.analysis.qualificationCategories.experience"),
            languages: t("roles.jd.analysis.qualificationCategories.languages"),
            certifications: t("roles.jd.analysis.qualificationCategories.certifications"),
          }}
          onEdit={canEditAnalysis ? onEditAnalysisModule : undefined}
          title={t("roles.jd.analysis.qualificationRequirements")}
        />
        <AnalysisCategorizedList
          field="hardSkills"
          groups={analysis.hardSkills}
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
  field?: JdField
  icon: LucideIcon
  onEdit?: (field: JdField) => void
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
            onClick={() => onEdit(field)}
            size="xs"
            variant="ghost"
            className="border-primary text-primary hover:bg-primary/10 hover:text-primary dark:hover:bg-primary/10"
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
  field: "requirements" | "hardSkills"
  groups: JobRequirementsResponse | HardSkillsResponse
  icon: LucideIcon
  labels: Record<string, string>
  onEdit?: (field: JdField) => void
  title: string
}) {
  const { t } = useTranslation()
  const entries = Object.entries({ ...groups }).filter(([, items]) => items.length > 0)
  return (
    <AnalysisSection field={field} icon={icon} onEdit={onEdit} title={title}>
      {entries.length === 0 ? (
        <p className="text-sm leading-6 text-muted-foreground">
          {t(`roles.jd.emptyHints.${field}`)}
        </p>
      ) : (
        <dl className="grid grid-cols-[fit-content(40%)_minmax(0,1fr)] gap-x-6 gap-y-3 text-sm leading-6">
          {entries.map(([key, items]) => (
            <div className="col-span-2 grid grid-cols-subgrid" key={String(key)}>
              <dt className="min-w-0 wrap-anywhere text-muted-foreground">{labels[key]}</dt>
              <dd className="min-w-0 wrap-anywhere">
                <ul className="flex flex-col gap-1">
                  {items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </dd>
            </div>
          ))}
        </dl>
      )}
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
  field: JdField
  icon: LucideIcon
  items: string[]
  onEdit?: (field: JdField) => void
  title: string
}) {
  const { t } = useTranslation()
  return (
    <AnalysisSection field={field} icon={icon} onEdit={onEdit} title={title}>
      {items.length === 0 ? (
        <p className="text-sm leading-6 text-muted-foreground">
          {t(`roles.jd.emptyHints.${field}`)}
        </p>
      ) : (
        <ul className="flex list-disc flex-col gap-2 pl-5 text-sm leading-6">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </AnalysisSection>
  )
}
