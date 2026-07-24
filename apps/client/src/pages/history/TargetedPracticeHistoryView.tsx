import { Link } from "@tanstack/react-router"
import { AlertCircleIcon, ArrowLeftIcon, RotateCcwIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

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
import type {
  TargetedPracticeRecordDetailResponse,
  TrainingRecordRecommendation,
  TrainingRecordStatus,
} from "@/models/training-records"
import { PracticeWeaknesses } from "@/pages/practice/components/PracticeReviewDetails"

import { TargetedPracticeQuestionRecord } from "./components/TargetedPracticeQuestionRecord"
import type { TargetedPracticeHistoryViewState } from "./targeted-practice-history-types"

export function TargetedPracticeHistoryView({
  onRetry,
  state,
}: {
  onRetry: () => void
  state: TargetedPracticeHistoryViewState
}) {
  const { t } = useTranslation()

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <header className="flex flex-col gap-4">
        <Button
          className="w-fit"
          nativeButton={false}
          render={<Link to="/history" />}
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
            <Button nativeButton={false} render={<Link to="/practice" />}>
              <RotateCcwIcon aria-hidden="true" data-icon="inline-start" />
              {t("history.detail.retry")}
            </Button>
          )}
        </div>
      </header>

      {state.status === "loading" && <DetailLoading />}
      {state.status === "error" && <DetailError onRetry={onRetry} />}
      {state.status === "notFound" && <DetailNotFound />}
      {state.status === "ready" && <DetailReady record={state.data} />}
    </div>
  )
}

function DetailReady({ record }: { record: TargetedPracticeRecordDetailResponse }) {
  const { t } = useTranslation()

  return (
    <>
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
          <TargetedPracticeQuestionRecord key={question.id} question={question} />
        ))}
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <PracticeWeaknesses items={record.exposedWeaknesses} />
        <Recommendation recommendation={record.recommendation} />
      </div>
    </>
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
}: {
  recommendation: TrainingRecordRecommendation | null
}) {
  const { t } = useTranslation()

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{t("history.detail.recommendation")}</CardTitle>
        <CardDescription>
          {recommendation?.reason ?? t("history.detail.recommendationNone")}
        </CardDescription>
      </CardHeader>
      {recommendation && recommendation.action !== "none" && (
        <CardContent className="flex flex-wrap gap-2">
          {recommendation.focusAreas.map((area) => (
            <Badge key={area} variant="secondary">
              {area}
            </Badge>
          ))}
        </CardContent>
      )}
    </Card>
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

function DetailError({ onRetry }: { onRetry: () => void }) {
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
        <Button onClick={onRetry}>{t("common.pageState.error.retry")}</Button>
      </CardFooter>
    </Card>
  )
}

function DetailNotFound() {
  const { t } = useTranslation()
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("history.detail.notFound.title")}</CardTitle>
        <CardDescription>{t("history.detail.notFound.description")}</CardDescription>
      </CardHeader>
      <CardFooter>
        <Button nativeButton={false} render={<Link to="/history" />}>
          <ArrowLeftIcon aria-hidden="true" data-icon="inline-start" />
          {t("history.detail.notFound.action")}
        </Button>
      </CardFooter>
    </Card>
  )
}

function formatRole(record: TargetedPracticeRecordDetailResponse) {
  return record.targetRole.company
    ? `${record.targetRole.company} · ${record.targetRole.title}`
    : record.targetRole.title
}

function statusVariant(status: TrainingRecordStatus): "default" | "secondary" | "outline" {
  if (status === "completed") return "default"
  if (status === "partiallyCompleted") return "secondary"
  return "outline"
}
