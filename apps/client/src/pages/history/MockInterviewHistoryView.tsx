import { Link } from "@tanstack/react-router"
import {
  AlertCircleIcon,
  ArrowLeftIcon,
  ChartNoAxesCombinedIcon,
  CheckCircle2Icon,
  CircleAlertIcon,
  CircleOffIcon,
  ClipboardCheckIcon,
  LightbulbIcon,
  MessageCircleQuestionIcon,
  RotateCcwIcon,
  ShieldAlertIcon,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import { useEffect, useRef } from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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
import type {
  MockInterviewOverallReview,
  MockInterviewRecordDetailResponse,
  TrainingRecordStatus,
} from "@/models/training-records"
import { InterviewReviewListCard } from "@/pages/interview/components/InterviewReviewListCard"

import { MockInterviewQuestionRecord } from "./components/MockInterviewQuestionRecord"
import { TrainingRecommendationCard } from "./components/TrainingRecommendationCard"
import type { HistoryRouteSearch } from "./history-navigation"
import type { HistoryReferenceAnswerSubject } from "./hooks/useHistoryReferenceAnswerGeneration"
import type { MockInterviewHistoryViewState } from "./mock-interview-history-types"

export function MockInterviewHistoryView({
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
  state: MockInterviewHistoryViewState
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
          {t("history.mockDetail.back")}
        </Button>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex max-w-3xl flex-col gap-2.5">
            <h1 className="font-heading text-3xl font-semibold leading-tight tracking-tight">
              {t("history.mockDetail.title")}
            </h1>
            <p className="text-base leading-7 text-muted-foreground">
              {t("history.mockDetail.description")}
            </p>
          </div>
          {state.status === "ready" && (
            <Button
              nativeButton={false}
              render={
                <Link
                  search={{
                    entry: "history",
                    targetRoleId: state.data.targetRole.id,
                    round: state.data.setup.round,
                    difficulty: state.data.setup.difficulty,
                    durationMinutes: state.data.setup.plannedDurationMinutes,
                  }}
                  to="/interview"
                />
              }
            >
              <RotateCcwIcon aria-hidden="true" data-icon="inline-start" />
              {t("history.mockDetail.retry")}
            </Button>
          )}
        </div>
      </header>

      <div
        className="rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        data-testid="mock-history-state-region"
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
  record: MockInterviewRecordDetailResponse
}) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-6">
      <Summary record={record} />
      <OverallReview record={record} />
      <section className="flex flex-col gap-3" aria-labelledby="mock-history-questions">
        <div className="flex flex-col gap-1">
          <h2 className="font-heading text-xl font-semibold" id="mock-history-questions">
            {t("history.mockDetail.questionsTitle")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("history.mockDetail.questionsDescription")}
          </p>
        </div>
        {record.questions.map((question) => (
          <MockInterviewQuestionRecord
            isReferenceAnswerRequesting={isReferenceAnswerRequesting}
            key={question.id}
            onGenerateReferenceAnswer={onGenerateReferenceAnswer}
            question={question}
          />
        ))}
      </section>
      <CandidateQuestions exchanges={record.candidateQuestionExchanges} />
      <Recommendation recommendation={record.recommendation} targetRoleId={record.targetRole.id} />
    </div>
  )
}

function Summary({ record }: { record: MockInterviewRecordDetailResponse }) {
  const { i18n, t } = useTranslation()
  const values = [
    [t("history.mockDetail.role"), formatRole(record)],
    [t("history.mockDetail.round"), t(`history.rounds.${record.setup.round}`)],
    [t("history.mockDetail.difficulty"), t(`history.difficulty.${record.setup.difficulty}`)],
    [
      t("history.mockDetail.plannedDuration"),
      t("history.mockDetail.minutes", { count: record.setup.plannedDurationMinutes }),
    ],
    [
      t("history.mockDetail.actualDuration"),
      t("history.mockDetail.minutes", {
        count: Math.max(1, Math.round(record.durationSeconds / 60)),
      }),
    ],
    [
      t("history.mockDetail.startedAt"),
      new Intl.DateTimeFormat(i18n.language, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(record.startedAt)),
    ],
    [
      t("history.mockDetail.completionReason"),
      t(`history.mockDetail.completionReasons.${record.completionReason}`),
    ],
    [
      t("history.mockDetail.questionsAnswered"),
      t("history.mockDetail.questionProgress", {
        answered: record.answeredQuestionCount,
        total: record.totalQuestionCount,
      }),
    ],
  ]

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <CardTitle>{t("history.mockDetail.summaryTitle")}</CardTitle>
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
            {record.overallScore === null ? t("history.mockDetail.noScore") : "/ 100"}
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

function OverallReview({ record }: { record: MockInterviewRecordDetailResponse }) {
  const { t } = useTranslation()
  if (record.overallReview.status === "unavailable") {
    return (
      <section className="flex flex-col gap-3" aria-labelledby="mock-history-review">
        <h2 className="font-heading text-xl font-semibold" id="mock-history-review">
          {t("history.mockDetail.reviewTitle")}
        </h2>
        <Alert>
          <CircleOffIcon aria-hidden="true" />
          <AlertTitle>{t("history.mockDetail.unavailableReview")}</AlertTitle>
          <AlertDescription>{t("history.mockDetail.unavailableDescription")}</AlertDescription>
        </Alert>
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-4" aria-labelledby="mock-history-review">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-heading text-xl font-semibold" id="mock-history-review">
          {t("history.mockDetail.reviewTitle")}
        </h2>
        <Badge variant={record.overallReview.status === "complete" ? "default" : "secondary"}>
          {t(
            record.overallReview.status === "complete"
              ? "history.mockDetail.completeReview"
              : "history.mockDetail.partialReview",
          )}
        </Badge>
      </div>
      {record.overallReview.status === "partial" && (
        <Alert>
          <CircleAlertIcon aria-hidden="true" />
          <AlertTitle>{t("history.mockDetail.partialReview")}</AlertTitle>
          <AlertDescription>{t("history.mockDetail.partialDescription")}</AlertDescription>
        </Alert>
      )}
      <ReviewCards
        exposedWeaknesses={record.exposedWeaknesses}
        review={record.overallReview.content}
      />
    </section>
  )
}

function ReviewCards({
  exposedWeaknesses,
  review,
}: {
  exposedWeaknesses: string[]
  review: MockInterviewOverallReview
}) {
  const { t } = useTranslation()
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t("history.mockDetail.overallPerformance")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="max-w-prose text-sm leading-7">{review.summary}</p>
        </CardContent>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        <InterviewReviewListCard
          icon={<CheckCircle2Icon aria-hidden="true" />}
          items={review.mainStrengths}
          title={t("history.mockDetail.sections.strengths")}
        />
        <InterviewReviewListCard
          icon={<CircleAlertIcon aria-hidden="true" />}
          items={review.frequentIssues}
          title={t("history.mockDetail.sections.frequentIssues")}
        />
        <InterviewReviewListCard
          icon={<ChartNoAxesCombinedIcon aria-hidden="true" />}
          items={exposedWeaknesses}
          title={t("history.mockDetail.sections.weaknesses")}
        />
        <InterviewReviewListCard
          icon={<ShieldAlertIcon aria-hidden="true" />}
          items={review.riskPoints}
          title={t("history.mockDetail.sections.risks")}
        />
        <InterviewReviewListCard
          icon={<LightbulbIcon aria-hidden="true" />}
          items={review.communicationSuggestions}
          title={t("history.mockDetail.sections.communication")}
        />
        <InterviewReviewListCard
          icon={<ClipboardCheckIcon aria-hidden="true" />}
          items={review.preparationSuggestions}
          title={t("history.mockDetail.sections.preparation")}
        />
      </div>
    </>
  )
}

function CandidateQuestions({
  exchanges,
}: {
  exchanges: MockInterviewRecordDetailResponse["candidateQuestionExchanges"]
}) {
  const { t } = useTranslation()
  return (
    <section className="flex flex-col gap-3" aria-labelledby="mock-history-candidate-questions">
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-xl font-semibold" id="mock-history-candidate-questions">
          {t("history.mockDetail.candidateTitle")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t("history.mockDetail.candidateDescription")}
        </p>
      </div>
      {exchanges.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t("history.mockDetail.noCandidateQuestions")}
        </p>
      ) : (
        exchanges.map((exchange, index) => (
          <Card key={exchange.id} size="sm">
            <CardHeader>
              <Badge className="w-fit" variant="outline">
                {t("history.mockDetail.candidateQuestion", { order: index + 1 })}
              </Badge>
              <CardTitle className="text-base leading-7">{exchange.question}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <section className="flex flex-col gap-2">
                <h3 className="font-medium">{t("history.mockDetail.interviewerAnswer")}</h3>
                <p className="text-sm leading-7 text-muted-foreground">
                  {exchange.interviewerAnswer}
                </p>
              </section>
              <Alert>
                <MessageCircleQuestionIcon aria-hidden="true" />
                <AlertTitle>{t("history.mockDetail.feedback")}</AlertTitle>
                <AlertDescription>{exchange.feedback}</AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        ))
      )}
    </section>
  )
}

function Recommendation({
  recommendation,
  targetRoleId,
}: Pick<MockInterviewRecordDetailResponse, "recommendation"> & { targetRoleId: string }) {
  const { t } = useTranslation()
  return (
    <TrainingRecommendationCard
      recommendation={recommendation}
      showIcon
      targetRoleId={targetRoleId}
      title={t("history.mockDetail.sections.nextTraining")}
    />
  )
}

function DetailLoading() {
  const { t } = useTranslation()
  return (
    <div aria-label={t("history.mockDetail.loading")} className="flex flex-col gap-6" role="status">
      <Card>
        <CardHeader>
          <CardTitle>{t("history.mockDetail.summaryTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton className="h-14" key={index} />
          ))}
        </CardContent>
      </Card>
      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-xl font-semibold">
          {t("history.mockDetail.reviewTitle")}
        </h2>
        <Skeleton className="h-56" />
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-xl font-semibold">
          {t("history.mockDetail.questionsTitle")}
        </h2>
        <Skeleton className="h-72" />
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
          {t("history.mockDetail.error.title")}
        </CardTitle>
        <CardDescription>{t("history.mockDetail.error.description")}</CardDescription>
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
        <CardTitle>{t("history.mockDetail.notFound.title")}</CardTitle>
        <CardDescription>{t("history.mockDetail.notFound.description")}</CardDescription>
      </CardHeader>
      <CardFooter>
        <Button nativeButton={false} render={<Link search={historySearch} to="/history" />}>
          <ArrowLeftIcon aria-hidden="true" data-icon="inline-start" />
          {t("history.mockDetail.notFound.action")}
        </Button>
      </CardFooter>
    </Card>
  )
}

function formatRole(record: MockInterviewRecordDetailResponse) {
  return record.targetRole.company
    ? `${record.targetRole.company} · ${record.targetRole.title}`
    : record.targetRole.title
}

function statusVariant(status: TrainingRecordStatus): "default" | "secondary" | "outline" {
  if (status === "completed") return "default"
  if (status === "partiallyCompleted") return "secondary"
  return "outline"
}
