import { Link } from "@tanstack/react-router"
import { AlertCircleIcon, ArrowLeftIcon, RotateCcwIcon } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useEffect, useRef } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { toPracticeDifficulty, toPracticeQuestionType } from "@/models/training-entry"
import type {
  TargetedPracticeRecordDetailResponse,
  TrainingRecordStatus,
} from "@/models/training-records"

import { TargetedPracticeQuestionRecord } from "./components/TargetedPracticeQuestionRecord"
import { TrainingRecommendationCard } from "./components/TrainingRecommendationCard"
import type { HistoryRouteSearch } from "./history-navigation"
import type { HistoryReferenceAnswerSubject } from "./hooks/useHistoryReferenceAnswerGeneration"
import type { TargetedPracticeHistoryViewState } from "./targeted-practice-history-types"

export function TargetedPracticeHistoryView({
  historySearch,
  isReferenceAnswerRequesting = () => false,
  onGenerateReferenceAnswer = () => {},
  onRetry,
  state,
}: {
  historySearch: HistoryRouteSearch
  isReferenceAnswerRequesting?: (subject: HistoryReferenceAnswerSubject) => boolean
  onGenerateReferenceAnswer?: (subject: HistoryReferenceAnswerSubject) => void
  onRetry: () => void
  state: TargetedPracticeHistoryViewState
}) {
  const { t } = useTranslation()
  const stateRegionRef = useRef<HTMLDivElement>(null)
  const stateKey = state.status === "ready" ? `ready:${state.data.id}` : state.status
  const previousStateKey = useRef(stateKey)

  useEffect(() => {
    if (previousStateKey.current === stateKey) return
    previousStateKey.current = stateKey
    stateRegionRef.current?.focus({ preventScroll: true })
  }, [stateKey])

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <header className="flex flex-col gap-4">
        <Button
          className="w-fit"
          nativeButton={false}
          render={<Link search={historySearch} to="/history" />}
          variant="ghost"
        >
          <ArrowLeftIcon aria-hidden="true" data-icon="inline-start" />
          {t("history.detail.back")}
        </Button>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex max-w-3xl flex-col gap-2.5">
            <h1 className="font-heading text-3xl font-semibold leading-tight tracking-tight">
              {t("history.detail.title")}
            </h1>
            <p className="text-base leading-7 text-muted-foreground">
              {t("history.detail.description")}
            </p>
          </div>
          {state.status === "ready" && (
            <Button
              nativeButton={false}
              render={
                <Link
                  search={{
                    entry: "history",
                    roleId: state.data.role.id,
                    questionType: toPracticeQuestionType(state.data.setup.questionType),
                    difficulty: toPracticeDifficulty(state.data.setup.difficulty),
                  }}
                  to="/practice"
                />
              }
            >
              <RotateCcwIcon aria-hidden="true" data-icon="inline-start" />
              {t("history.detail.retry")}
            </Button>
          )}
        </div>
      </header>

      <div
        className="rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        data-testid="targeted-history-state-region"
        ref={stateRegionRef}
        tabIndex={-1}
      >
        {state.status === "loading" && <DetailLoading />}
        {state.status === "error" && (
          <DetailError isRetrying={state.isRetrying} onRetry={onRetry} />
        )}
        {state.status === "notFound" && <DetailNotFound historySearch={historySearch} />}
        {state.status === "ready" && (
          <DetailReady
            isReferenceAnswerRequesting={isReferenceAnswerRequesting}
            onGenerateReferenceAnswer={onGenerateReferenceAnswer}
            record={state.data}
          />
        )}
      </div>
    </div>
  )
}

function DetailReady({
  isReferenceAnswerRequesting,
  onGenerateReferenceAnswer,
  record,
}: {
  isReferenceAnswerRequesting: (subject: HistoryReferenceAnswerSubject) => boolean
  onGenerateReferenceAnswer: (subject: HistoryReferenceAnswerSubject) => void
  record: TargetedPracticeRecordDetailResponse
}) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-6">
      <Summary record={record} />
      <section className="flex flex-col gap-3" aria-labelledby="history-detail-questions">
        <div className="flex flex-col gap-1">
          <h2 className="font-heading text-xl font-semibold" id="history-detail-questions">
            {t("history.detail.questionsTitle")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("history.detail.questionsDescription")}
          </p>
        </div>
        {record.questions.map((question) => (
          <TargetedPracticeQuestionRecord
            isReferenceAnswerRequesting={isReferenceAnswerRequesting}
            key={question.id}
            onGenerateReferenceAnswer={onGenerateReferenceAnswer}
            question={question}
          />
        ))}
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <PracticeWeaknesses items={record.exposedWeaknesses} />
        <Recommendation recommendation={record.recommendation} roleId={record.role.id} />
      </div>
    </div>
  )
}

function Summary({ record }: { record: TargetedPracticeRecordDetailResponse }) {
  const { i18n, t } = useTranslation()
  const retryCount = record.questions.filter((question) => question.retryOfQuestionId).length
  const values = [
    [t("history.detail.role"), formatRole(record)],
    [t("history.detail.questionType"), t(`history.questionTypes.${record.setup.questionType}`)],
    [t("history.detail.difficulty"), t(`history.difficulty.${record.setup.difficulty}`)],
    [
      t("history.detail.startedAt"),
      new Intl.DateTimeFormat(i18n.language, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(record.startedAt)),
    ],
    [
      t("history.detail.duration"),
      t("history.detail.minutes", { count: Math.max(1, Math.round(record.durationSeconds / 60)) }),
    ],
    [
      t("history.detail.questionsAnswered"),
      t("history.detail.questionProgress", {
        answered: record.answeredQuestionCount,
        total: record.totalQuestionCount,
      }),
    ],
    [t("history.detail.retries"), t("history.detail.retryCount", { count: retryCount })],
  ]

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>{t("history.detail.summaryTitle")}</CardTitle>
            <CardDescription className="mt-1">{t("history.detail.reviewSummary")}</CardDescription>
          </div>
          <Badge variant={statusVariant(record.status)}>
            {t(`history.status.${record.status}`)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-5 lg:grid-cols-[auto_minmax(0,1fr)]">
        <div className="flex min-w-32 flex-col justify-center rounded-xl bg-primary/5 p-5">
          <span className="font-heading text-5xl font-semibold tabular-nums">
            {record.overallScore ?? "—"}
          </span>
          <span className="mt-1 text-sm text-muted-foreground">
            {record.overallScore === null ? t("history.detail.noScore") : "/ 100"}
          </span>
        </div>
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {values.map(([label, value]) => (
            <div className="flex min-w-0 flex-col gap-1" key={label}>
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}

function Recommendation({
  recommendation,
  roleId,
}: Pick<TargetedPracticeRecordDetailResponse, "recommendation"> & { roleId: string }) {
  const { t } = useTranslation()

  return (
    <TrainingRecommendationCard
      recommendation={recommendation}
      size="sm"
      roleId={roleId}
      title={t("history.detail.recommendation")}
    />
  )
}

function DetailLoading() {
  const { t } = useTranslation()
  return (
    <div aria-label={t("history.detail.loading")} className="flex flex-col gap-6" role="status">
      <Card>
        <CardHeader>
          <CardTitle>{t("history.detail.summaryTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton className="h-14" key={index} />
          ))}
        </CardContent>
      </Card>
      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-xl font-semibold">{t("history.detail.questionsTitle")}</h2>
        <Skeleton className="h-80" />
      </section>
    </div>
  )
}

function DetailError({ isRetrying, onRetry }: { isRetrying: boolean; onRetry: () => void }) {
  const { t } = useTranslation()
  return (
    <Card role="alert">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertCircleIcon aria-hidden="true" />
          {t("history.detail.error.title")}
        </CardTitle>
        <CardDescription>{t("history.detail.error.description")}</CardDescription>
      </CardHeader>
      <CardFooter>
        <Button disabled={isRetrying} onClick={onRetry}>
          {isRetrying && <Spinner aria-hidden="true" />}
          {t("common.pageState.error.retry")}
        </Button>
      </CardFooter>
    </Card>
  )
}

function DetailNotFound({ historySearch }: { historySearch: HistoryRouteSearch }) {
  const { t } = useTranslation()
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("history.detail.notFound.title")}</CardTitle>
        <CardDescription>{t("history.detail.notFound.description")}</CardDescription>
      </CardHeader>
      <CardFooter>
        <Button nativeButton={false} render={<Link search={historySearch} to="/history" />}>
          <ArrowLeftIcon aria-hidden="true" data-icon="inline-start" />
          {t("history.detail.notFound.action")}
        </Button>
      </CardFooter>
    </Card>
  )
}

function formatRole(record: TargetedPracticeRecordDetailResponse) {
  return record.role.company ? `${record.role.company} · ${record.role.title}` : record.role.title
}

function statusVariant(status: TrainingRecordStatus): "default" | "secondary" | "outline" {
  if (status === "completed") return "default"
  if (status === "partiallyCompleted") return "secondary"
  return "outline"
}

function PracticeWeaknesses({ items }: { items: string[] }) {
  const { t } = useTranslation()

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{t("practice.review.weaknesses")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {items.length > 0 ? (
          items.map((item) => (
            <Badge key={item} variant="secondary">
              {item}
            </Badge>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">{t("practice.review.noNewWeaknesses")}</p>
        )}
      </CardContent>
    </Card>
  )
}
