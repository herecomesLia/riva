import { Link } from "@tanstack/react-router"
import {
  ArrowRightIcon,
  CircleCheckIcon,
  CircleXIcon,
  ClipboardCheckIcon,
  EyeOffIcon,
  FileCheckIcon,
  FileWarningIcon,
  LightbulbIcon,
  MessageCircleQuestionIcon,
  RefreshCwIcon,
  SparklesIcon,
  type LucideIcon,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import type { MatchingAnalysisResult, MatchingAnalysisState } from "@/mocks/models/role"

export function MatchingAnalysisCard({
  onGenerate,
  onRetrySynchronization,
  pending,
  analysis,
  synchronizationError,
}: {
  onGenerate?: () => void
  onRetrySynchronization?: () => void
  pending?: boolean
  analysis: MatchingAnalysisState | undefined
  synchronizationError: boolean
}) {
  const { t } = useTranslation()
  const status = analysis?.status ?? "loading"
  const result = analysis && "result" in analysis ? analysis.result : null

  return (
    <Card
      className="bg-card shadow-none ring-border"
      data-testid="matching-analysis-card"
      size="sm"
    >
      <CardHeader>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:gap-x-6">
          <div className="flex flex-col gap-1">
            <div className="flex min-h-9 items-center">
              <CardTitle>
                <h3>{t("roles.details.sections.matchingAnalysis")}</h3>
              </CardTitle>
            </div>
            <CardDescription className="min-h-5 leading-5">
              {t("roles.matching.cardDescription")}
            </CardDescription>
          </div>
          <div className="flex items-end justify-between gap-4 sm:justify-end">
            {result && (
              <div className="flex items-end gap-2 whitespace-nowrap">
                <span className="font-heading text-4xl leading-none font-bold text-primary">
                  {result.overallMatchScore}%
                </span>
                <span className="text-sm leading-none text-muted-foreground">
                  {t("roles.matching.result.overallMatch")}
                </span>
              </div>
            )}
            {status !== "current" && (
              <Badge variant={status === "failed" ? "destructive" : "outline"}>
                {t(`roles.matchingAnalysisStatus.${status}.label`)}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {synchronizationError ? (
          <AnalysisGenerating
            onRetrySynchronization={onRetrySynchronization}
            pending={pending}
            synchronizationError
          />
        ) : !analysis ? (
          <Spinner />
        ) : analysis.status === "blocked" ? (
          <>
            {analysis.result && (
              <Alert>
                <AlertTitle>{t("roles.matching.stale.title")}</AlertTitle>
                <AlertDescription>{t("roles.matching.stale.description")}</AlertDescription>
              </Alert>
            )}
            <MatchingPrerequisite reason={analysis.reason} />
            {analysis.result && <MatchingAnalysisResultView result={analysis.result} />}
          </>
        ) : analysis.status === "stale" ? (
          <>
            <Alert>
              <AlertTitle>{t("roles.matching.stale.title")}</AlertTitle>
              <AlertDescription>{t("roles.matching.stale.description")}</AlertDescription>
            </Alert>
            {onGenerate && (
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
            <MatchingAnalysisResultView result={analysis.result} />
          </>
        ) : analysis.status === "none" ? (
          <AnalysisEmpty onGenerate={onGenerate} pending={pending} />
        ) : analysis.status === "generating" ? (
          <AnalysisGenerating
            onRetrySynchronization={onRetrySynchronization}
            pending={pending}
            synchronizationError={false}
          />
        ) : analysis.status === "failed" ? (
          <AnalysisFailed failureReason={analysis.reason} onRetry={onGenerate} pending={pending} />
        ) : (
          <MatchingAnalysisResultView result={analysis.result} />
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

function MatchingPrerequisite({
  reason,
}: {
  reason: Extract<MatchingAnalysisState, { status: "blocked" }>["reason"]
}) {
  if (reason === "profileMissing" || reason === "profileIncomplete") {
    return <ProfilePrerequisite exists={reason === "profileIncomplete"} />
  }
  const status =
    reason === "jobDescriptionMissing"
      ? "missing"
      : reason === "jobDescriptionFailed"
        ? "failed"
        : "extracting"
  return <JobDescriptionPrerequisite status={status} />
}

function JobDescriptionPrerequisite({ status }: { status: "missing" | "failed" | "extracting" }) {
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
      <ResultText
        icon={ClipboardCheckIcon}
        text={result.coreRequirementsSummary}
        title={t("roles.matching.result.coreRequirements")}
      />
      <div className="grid gap-4 xl:grid-cols-2">
        <ResultList
          icon={CircleCheckIcon}
          items={result.matchedCapabilities}
          title={t("roles.matching.result.matchedCapabilities")}
        />
        <ResultList
          icon={CircleXIcon}
          items={result.missingCapabilities}
          title={t("roles.matching.result.missingCapabilities")}
        />
        <ResultList
          icon={EyeOffIcon}
          items={result.underrepresentedCapabilities}
          title={t("roles.matching.result.underrepresentedCapabilities")}
        />
        <ResultList
          icon={FileCheckIcon}
          items={result.resumeHighlights}
          title={t("roles.matching.result.resumeHighlights")}
        />
        <ResultList
          icon={FileWarningIcon}
          items={result.resumeGaps}
          title={t("roles.matching.result.resumeGaps")}
        />
        <ResultList
          icon={MessageCircleQuestionIcon}
          items={result.highRiskQuestions}
          title={t("roles.matching.result.highRiskQuestions")}
        />
      </div>
      <ResultList
        icon={LightbulbIcon}
        items={result.preparationRecommendations}
        title={t("roles.matching.result.preparationRecommendations")}
      />
    </div>
  )
}

function ResultText({
  icon: Icon,
  text,
  title,
}: {
  icon: LucideIcon
  text: string
  title: string
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>
          <h4 className="flex items-center gap-2">
            <Icon aria-hidden="true" className="size-4 text-primary" />
            {title}
          </h4>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-6">{text}</p>
      </CardContent>
    </Card>
  )
}

function ResultList({
  icon: Icon,
  items,
  title,
}: {
  icon: LucideIcon
  items: string[]
  title: string
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>
          <h4 className="flex items-center gap-2">
            <Icon aria-hidden="true" className="size-4 text-primary" />
            {title}
          </h4>
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
