import { FilePenLineIcon, PencilIcon, RefreshCwIcon } from "lucide-react"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import type {
  JobDescriptionAnalysis,
  JobDescriptionAnalysisModuleField,
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
      className="border border-border/70 bg-background/60 shadow-none"
      data-testid="job-description-card"
      size="sm"
    >
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-1">
            <CardTitle>
              <h3>{t("roles.details.sections.jobDescription")}</h3>
            </CardTitle>
            <CardDescription>{t("roles.jd.cardDescription")}</CardDescription>
          </div>
          <Badge variant={jobDescription.status === "failed" ? "destructive" : "outline"}>
            {t(`roles.jobDescriptionStatus.${jobDescription.status}.label`)}
          </Badge>
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
            onEdit={onEdit}
            onEditAnalysisModule={onEditAnalysisModule}
            pending={pending}
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
        <Button disabled={pending} onClick={onEdit} size="sm">
          <FilePenLineIcon data-icon="inline-start" />
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
          <Button disabled={pending} onClick={onEdit} size="sm" variant="outline">
            <FilePenLineIcon data-icon="inline-start" />
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
  onEdit,
  onEditAnalysisModule,
  pending,
}: {
  analysis: JobDescriptionAnalysis
  canEditAnalysis: boolean
  onEdit?: () => void
  onEditAnalysisModule?: (field: JobDescriptionAnalysisModuleField) => void
  pending?: boolean
}) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-5" data-testid="job-description-analysis">
      <div className="flex justify-end">
        {onEdit && (
          <Button disabled={pending} onClick={onEdit} size="sm" variant="outline">
            <FilePenLineIcon data-icon="inline-start" />
            {t("roles.jd.actions.replace")}
          </Button>
        )}
      </div>
      <p className="text-sm text-muted-foreground">{t("roles.jd.analysis.correctionHint")}</p>
      <AnalysisSection
        field="coreRequirementsSummary"
        onEdit={canEditAnalysis ? onEditAnalysisModule : undefined}
        title={t("roles.jd.analysis.summary")}
      >
        <p className="text-sm leading-6">{analysis.coreRequirementsSummary}</p>
      </AnalysisSection>
      <div className="grid gap-4 xl:grid-cols-2">
        <AnalysisList
          field="responsibilities"
          items={analysis.responsibilities}
          onEdit={canEditAnalysis ? onEditAnalysisModule : undefined}
          title={t("roles.jd.analysis.responsibilities")}
        />
        <AnalysisList
          field="experienceRequirements"
          items={analysis.experienceRequirements}
          onEdit={canEditAnalysis ? onEditAnalysisModule : undefined}
          title={t("roles.jd.analysis.experienceRequirements")}
        />
        <AnalysisBadges
          field="requiredSkills"
          items={analysis.requiredSkills}
          onEdit={canEditAnalysis ? onEditAnalysisModule : undefined}
          title={t("roles.jd.analysis.requiredSkills")}
        />
        <AnalysisBadges
          field="preferredSkills"
          items={analysis.preferredSkills}
          onEdit={canEditAnalysis ? onEditAnalysisModule : undefined}
          title={t("roles.jd.analysis.preferredSkills")}
        />
        <AnalysisBadges
          field="softSkills"
          items={analysis.softSkills}
          onEdit={canEditAnalysis ? onEditAnalysisModule : undefined}
          title={t("roles.jd.analysis.softSkills")}
        />
        <AnalysisBadges
          field="businessDomains"
          items={analysis.businessDomains}
          onEdit={canEditAnalysis ? onEditAnalysisModule : undefined}
          title={t("roles.jd.analysis.businessDomains")}
        />
      </div>
      <AnalysisBadges
        field="frequentKeywords"
        items={analysis.frequentKeywords}
        onEdit={canEditAnalysis ? onEditAnalysisModule : undefined}
        title={t("roles.jd.analysis.keywords")}
      />
    </div>
  )
}

function AnalysisSection({
  children,
  field,
  onEdit,
  title,
}: {
  children: ReactNode
  field: JobDescriptionAnalysisModuleField
  onEdit?: (field: JobDescriptionAnalysisModuleField) => void
  title: string
}) {
  const { t } = useTranslation()
  return (
    <section className="flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex items-center justify-between gap-3">
        <h4 className="font-heading font-medium">{title}</h4>
        {onEdit && (
          <Button
            aria-label={t("roles.jd.actions.editModuleLabel", { module: title })}
            onClick={() => onEdit(field)}
            size="xs"
            variant="ghost"
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

function AnalysisList({
  field,
  items,
  onEdit,
  title,
}: {
  field: JobDescriptionAnalysisModuleField
  items: string[]
  onEdit?: (field: JobDescriptionAnalysisModuleField) => void
  title: string
}) {
  return (
    <AnalysisSection field={field} onEdit={onEdit} title={title}>
      <ul className="flex list-disc flex-col gap-2 pl-5 text-sm leading-6">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </AnalysisSection>
  )
}

function AnalysisBadges({
  field,
  items,
  onEdit,
  title,
}: {
  field: JobDescriptionAnalysisModuleField
  items: string[]
  onEdit?: (field: JobDescriptionAnalysisModuleField) => void
  title: string
}) {
  return (
    <AnalysisSection field={field} onEdit={onEdit} title={title}>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <Badge key={item} variant="secondary">
            {item}
          </Badge>
        ))}
      </div>
    </AnalysisSection>
  )
}
