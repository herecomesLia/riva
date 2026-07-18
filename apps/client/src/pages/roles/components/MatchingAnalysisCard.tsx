import { Link } from "@tanstack/react-router"
import { ArrowRightIcon, RefreshCwIcon, SparklesIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import type { MatchingAnalysisResult, ProfileContext, TargetRole } from "@/models/roles"

export function MatchingAnalysisCard({
  onGenerate,
  onRetrySynchronization,
  pending,
  profileContext,
  role,
  synchronizationError,
}: {
  onGenerate?: () => void
  onRetrySynchronization?: () => void
  pending?: boolean
  profileContext: ProfileContext
  role: TargetRole
  synchronizationError: boolean
}) {
  const { t } = useTranslation()
  const status = role.matchingAnalysis?.status ?? "none"

  return (
    <Card data-testid="matching-analysis-card" size="sm">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-1">
            <CardTitle>
              <h3>{t("roles.details.sections.matchingAnalysis")}</h3>
            </CardTitle>
            <CardDescription>{t("roles.matching.cardDescription")}</CardDescription>
          </div>
          <Badge variant={status === "failed" ? "destructive" : "outline"}>
            {t(`roles.matchingAnalysisStatus.${status}.label`)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {!profileContext.exists ? (
          <ProfilePrerequisite exists={false} />
        ) : !profileContext.completed ? (
          <ProfilePrerequisite exists />
        ) : role.jobDescription.status !== "ready" ? (
          <JobDescriptionPrerequisite status={role.jobDescription.status} />
        ) : role.matchingAnalysis === null ? (
          <AnalysisEmpty onGenerate={onGenerate} pending={pending} />
        ) : role.matchingAnalysis.status === "generating" ? (
          <AnalysisGenerating
            onRetrySynchronization={onRetrySynchronization}
            pending={pending}
            synchronizationError={synchronizationError}
          />
        ) : role.matchingAnalysis.status === "failed" ? (
          <AnalysisFailed
            failureReason={role.matchingAnalysis.failureReason}
            onRetry={onGenerate}
            pending={pending}
          />
        ) : (
          <>
            {role.matchingAnalysis.status === "stale" && (
              <Alert>
                <AlertTitle>{t("roles.matching.stale.title")}</AlertTitle>
                <AlertDescription>{t("roles.matching.stale.description")}</AlertDescription>
              </Alert>
            )}
            {role.matchingAnalysis.status === "stale" && onGenerate && (
              <div className="flex justify-end">
                <Button disabled={pending} onClick={onGenerate} size="sm">
                  {pending ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <RefreshCwIcon data-icon="inline-start" />
                  )}
                  {t("roles.matching.actions.regenerate")}
                </Button>
              </div>
            )}
            <MatchingAnalysisResultView result={role.matchingAnalysis.result} />
          </>
        )}
      </CardContent>
    </Card>
  )
}

function ProfilePrerequisite({ exists }: { exists: boolean }) {
  const { t } = useTranslation()
  const key = exists ? "incomplete" : "missing"
  return (
    <Alert>
      <AlertTitle>{t(`roles.matching.prerequisites.profile.${key}.title`)}</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-3">
        <span>{t(`roles.matching.prerequisites.profile.${key}.description`)}</span>
        <Button nativeButton={false} render={<Link to="/profile" />} size="sm" variant="outline">
          {t(`roles.matching.prerequisites.profile.${key}.action`)}
          <ArrowRightIcon data-icon="inline-end" />
        </Button>
      </AlertDescription>
    </Alert>
  )
}

function JobDescriptionPrerequisite({
  status,
}: {
  status: Exclude<TargetRole["jobDescription"]["status"], "ready">
}) {
  const { t } = useTranslation()
  return (
    <Alert>
      <AlertTitle>{t(`roles.matching.prerequisites.jd.${status}.title`)}</AlertTitle>
      <AlertDescription className="flex flex-col items-start gap-3">
        <span>{t(`roles.matching.prerequisites.jd.${status}.description`)}</span>
      </AlertDescription>
    </Alert>
  )
}

function AnalysisEmpty({ onGenerate, pending }: { onGenerate?: () => void; pending?: boolean }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-start gap-3">
      <p className="text-sm leading-6 text-muted-foreground">
        {t("roles.matchingAnalysisStatus.none.description")}
      </p>
      {onGenerate && (
        <Button disabled={pending} onClick={onGenerate} size="sm">
          <SparklesIcon data-icon="inline-start" />
          {t("roles.matching.actions.generate")}
        </Button>
      )}
    </div>
  )
}

function AnalysisGenerating({
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
        <AlertTitle>{t("roles.matching.synchronization.title")}</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-3">
          <span>{t("roles.matching.synchronization.description")}</span>
          {onRetrySynchronization && (
            <Button disabled={pending} onClick={onRetrySynchronization} size="sm" variant="outline">
              <RefreshCwIcon data-icon="inline-start" />
              {t("roles.matching.actions.resynchronize")}
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
        {t("roles.matchingAnalysisStatus.generating.description")}
      </p>
    </div>
  )
}

function AnalysisFailed({
  failureReason,
  onRetry,
  pending,
}: {
  failureReason: string
  onRetry?: () => void
  pending?: boolean
}) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-3">
      <Alert variant="destructive">
        <AlertTitle>{t("roles.matching.failed.title")}</AlertTitle>
        <AlertDescription>{failureReason}</AlertDescription>
      </Alert>
      {onRetry && (
        <div>
          <Button disabled={pending} onClick={onRetry} size="sm">
            {pending ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <RefreshCwIcon data-icon="inline-start" />
            )}
            {t("roles.matching.actions.retry")}
          </Button>
        </div>
      )}
    </div>
  )
}

function MatchingAnalysisResultView({ result }: { result: MatchingAnalysisResult }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-4" data-testid="matching-analysis-result">
      <Card size="sm">
        <CardHeader>
          <CardTitle>
            <h4>{t("roles.matching.result.overallMatch")}</h4>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="font-heading text-4xl font-medium">{result.overallMatchScore}%</p>
        </CardContent>
      </Card>
      <ResultText
        text={result.coreRequirementsSummary}
        title={t("roles.matching.result.coreRequirements")}
      />
      <div className="grid gap-4 xl:grid-cols-2">
        <ResultList
          items={result.matchedCapabilities}
          title={t("roles.matching.result.matchedCapabilities")}
        />
        <ResultList
          items={result.missingCapabilities}
          title={t("roles.matching.result.missingCapabilities")}
        />
        <ResultList
          items={result.underrepresentedCapabilities}
          title={t("roles.matching.result.underrepresentedCapabilities")}
        />
        <ResultList
          items={result.resumeHighlights}
          title={t("roles.matching.result.resumeHighlights")}
        />
        <ResultList items={result.resumeGaps} title={t("roles.matching.result.resumeGaps")} />
        <ResultList
          items={result.highRiskQuestions}
          title={t("roles.matching.result.highRiskQuestions")}
        />
      </div>
      <ResultList
        items={result.preparationRecommendations}
        title={t("roles.matching.result.preparationRecommendations")}
      />
    </div>
  )
}

function ResultText({ text, title }: { text: string; title: string }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>
          <h4>{title}</h4>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-6">{text}</p>
      </CardContent>
    </Card>
  )
}

function ResultList({ items, title }: { items: string[]; title: string }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>
          <h4>{title}</h4>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex list-disc flex-col gap-2 pl-5 text-sm leading-6">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
