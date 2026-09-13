import {
  CircleCheckIcon,
  ClipboardCheckIcon,
  FileCheckIcon,
  FileWarningIcon,
  LightbulbIcon,
  type LucideIcon,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import type {
  RoleMatchingResponse,
  RoleMatchingResultResponse,
  TaskStatusResponse,
  TaskFailureResponse,
} from "@/api/generated/models"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"

export function MatchingAnalysisCard({
  matching,
  matchingState,
  isMatchingStateError,
  onStartMatching,
  onAbortMatching,
  onRetryMatchingState,
  pending,
}: {
  matching: RoleMatchingResponse
  matchingState: TaskStatusResponse | TaskFailureResponse | undefined
  isMatchingStateError: boolean
  onStartMatching?: () => void
  onAbortMatching?: () => void
  onRetryMatchingState?: () => void
  pending?: boolean
}) {
  const { t } = useTranslation()
  const status = matchingState?.status
  const active = status === "queued" || status === "running" || status === "aborting"
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
          {matching.result && (
            <div className="flex items-end gap-2 whitespace-nowrap">
              <span className="font-heading text-4xl leading-none font-bold text-primary">
                {matching.result.score}%
              </span>
              <span className="text-sm leading-none text-muted-foreground">
                {t("roles.matching.result.overallMatch")}
              </span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {matching.result && matching.isStale && (
          <Alert>
            <AlertTitle>{t("roles.matching.stale.title")}</AlertTitle>
            <AlertDescription>{t("roles.matching.stale.description")}</AlertDescription>
          </Alert>
        )}
        {isMatchingStateError ? (
          <Alert variant="destructive">
            <AlertTitle>{t("roles.matching.synchronization.title")}</AlertTitle>
            <AlertDescription className="flex flex-col items-start gap-3">
              <span>{t("roles.matching.synchronization.description")}</span>
              {onRetryMatchingState && (
                <Button
                  disabled={pending}
                  onClick={onRetryMatchingState}
                  size="sm"
                  variant="outline"
                >
                  {t("roles.matching.actions.resynchronize")}
                </Button>
              )}
            </AlertDescription>
          </Alert>
        ) : !matchingState ? (
          <Spinner />
        ) : (
          <>
            {active && (
              <div className="flex items-center gap-3" aria-live="polite">
                <Spinner />
                <span>{t(`roles.matchingAnalysisStatus.${matchingState.status}.label`)}</span>
                {onAbortMatching && (
                  <Button
                    disabled={pending || status === "aborting"}
                    onClick={onAbortMatching}
                    size="sm"
                    variant="outline"
                  >
                    {t("roles.matching.actions.abort")}
                  </Button>
                )}
              </div>
            )}
            {matchingState.status === "failed" && (
              <Alert variant="destructive">
                <AlertTitle>{t("roles.matching.failed.title")}</AlertTitle>
                <AlertDescription>
                  {t(`roles.matching.failureCodes.${matchingState.error.code}`)}
                </AlertDescription>
              </Alert>
            )}
            {!active && (
              <>
                {!matching.result && status === "idle" && (
                  <p className="text-sm text-muted-foreground">
                    {t("roles.matchingAnalysisStatus.none.description")}
                  </p>
                )}
                {onStartMatching && (
                  <div>
                    <Button disabled={pending} onClick={onStartMatching} size="sm">
                      {pending && <Spinner data-icon="inline-start" />}
                      {t(
                        status === "failed"
                          ? "roles.matching.actions.retry"
                          : matching.result
                            ? "roles.matching.actions.regenerate"
                            : "roles.matching.actions.generate",
                      )}
                    </Button>
                  </div>
                )}
              </>
            )}
          </>
        )}
        {matching.result && <MatchingAnalysisResultView result={matching.result} />}
      </CardContent>
    </Card>
  )
}

function MatchingAnalysisResultView({ result }: { result: RoleMatchingResultResponse }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-4" data-testid="matching-analysis-result">
      <ResultText
        icon={ClipboardCheckIcon}
        text={result.coreRequirements}
        title={t("roles.matching.result.coreRequirements")}
      />
      <div className="grid gap-4 xl:grid-cols-2">
        <ResultList
          icon={CircleCheckIcon}
          items={result.resumeStrengths}
          title={t("roles.matching.result.resumeStrengths")}
        />
        <ResultList
          icon={FileWarningIcon}
          items={result.resumeGaps}
          title={t("roles.matching.result.resumeGaps")}
        />
        <ResultList
          icon={FileCheckIcon}
          items={result.resumeOptimizationSuggestions}
          title={t("roles.matching.result.resumeOptimizationSuggestions")}
        />
        <ResultList
          icon={LightbulbIcon}
          items={result.interviewPreparationSuggestions}
          title={t("roles.matching.result.interviewPreparationSuggestions")}
        />
      </div>
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
