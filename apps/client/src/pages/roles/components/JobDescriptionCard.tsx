import { FilePenLineIcon, RefreshCwIcon } from "lucide-react"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import type { JobDescriptionAnalysis, TargetRole } from "@/models/roles"

export function JobDescriptionCard({
  onEdit,
  onRetry,
  onRetrySynchronization,
  pending,
  role,
  synchronizationError,
}: {
  onEdit?: () => void
  onRetry?: () => void
  onRetrySynchronization?: () => void
  pending?: boolean
  role: TargetRole
  synchronizationError: boolean
}) {
  const { t } = useTranslation()
  const { jobDescription } = role

  return (
    <Card data-testid="job-description-card" size="sm">
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
          <ReadyState analysis={role.jobDescriptionAnalysis} onEdit={onEdit} pending={pending} />
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
  onEdit,
  pending,
}: {
  analysis: JobDescriptionAnalysis
  onEdit?: () => void
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
      <AnalysisSection title={t("roles.jd.analysis.summary")}>
        <p className="text-sm leading-6">{analysis.coreRequirementsSummary}</p>
      </AnalysisSection>
      <div className="grid gap-4 xl:grid-cols-2">
        <AnalysisList
          items={analysis.responsibilities}
          title={t("roles.jd.analysis.responsibilities")}
        />
        <AnalysisList
          items={analysis.experienceRequirements}
          title={t("roles.jd.analysis.experienceRequirements")}
        />
        <AnalysisBadges
          items={analysis.requiredSkills}
          title={t("roles.jd.analysis.requiredSkills")}
        />
        <AnalysisBadges
          items={analysis.preferredSkills}
          title={t("roles.jd.analysis.preferredSkills")}
        />
        <AnalysisBadges items={analysis.softSkills} title={t("roles.jd.analysis.softSkills")} />
        <AnalysisBadges
          items={analysis.businessDomains}
          title={t("roles.jd.analysis.businessDomains")}
        />
      </div>
      <AnalysisBadges items={analysis.frequentKeywords} title={t("roles.jd.analysis.keywords")} />
    </div>
  )
}

function AnalysisSection({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border p-4">
      <h4 className="font-heading font-medium">{title}</h4>
      {children}
    </section>
  )
}

function AnalysisList({ items, title }: { items: string[]; title: string }) {
  return (
    <AnalysisSection title={title}>
      <ul className="flex list-disc flex-col gap-2 pl-5 text-sm leading-6">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </AnalysisSection>
  )
}

function AnalysisBadges({ items, title }: { items: string[]; title: string }) {
  return (
    <AnalysisSection title={title}>
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
