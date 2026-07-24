import {
  AlertCircleIcon,
  ArrowLeftIcon,
  BotIcon,
  CircleStopIcon,
  PlayIcon,
  RotateCcwIcon,
} from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
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
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import type {
  InterviewCandidateQuestionExchangeResponse,
  InterviewConversationRecordViewData,
  InterviewDifficulty,
  InterviewRound,
} from "@/models/interview"

import { CandidateQuestionsStage } from "./components/CandidateQuestionsStage"
import { InterviewAnswerComposer } from "./components/InterviewAnswerComposer"
import { InterviewConversationHistory } from "./components/InterviewConversationHistory"

export type InterviewSessionSummary = {
  targetRole: string
  company: string | null
  round: InterviewRound
  difficulty: InterviewDifficulty
  completedQuestions: number
  totalQuestions: number
}

export type InterviewPromptViewData = {
  id: string
  kind: "question" | "followUp"
  content: string
  questionOrder: number
  answer: string | null
}

type ActiveSessionActions = {
  isEnding: boolean
  isInteractionLocked: boolean
  onEnd: () => Promise<void>
}

export type InterviewSessionViewProps =
  | { status: "loading" }
  | {
      status: "error"
      isRetrying: boolean
      onRetry: () => void
      onBack: () => void
    }
  | {
      status: "unavailable"
      reason: "missing" | "completed"
      onBack: () => void
    }
  | ({
      status: "opening"
      summary: InterviewSessionSummary
      openingMessage: string
      isBeginning: boolean
      beginFailed: boolean
      onBegin: () => Promise<void>
    } & ActiveSessionActions)
  | ({
      status: "question"
      summary: InterviewSessionSummary
      prompt: InterviewPromptViewData
      history: readonly InterviewConversationRecordViewData[]
      isSubmitting: boolean
      advanceStatus: "idle" | "ready" | "advancing" | "failed"
      onSubmit: (content: string) => Promise<void>
      onRetryAdvance: () => void
    } & ActiveSessionActions)
  | {
      status: "candidateQuestions"
      summary: InterviewSessionSummary
      prompt: string
      history: readonly InterviewConversationRecordViewData[]
      exchanges: readonly InterviewCandidateQuestionExchangeResponse[]
      isSubmittingQuestion: boolean
      isFinishing: boolean
      isInteractionLocked: boolean
      onSubmitQuestion: (content: string) => Promise<void>
      onFinish: () => Promise<void>
    }

export function InterviewSessionView(props: InterviewSessionViewProps) {
  if (props.status === "loading") return <InterviewSessionLoading />
  if (props.status === "error") {
    return (
      <InterviewSessionError
        isRetrying={props.isRetrying}
        onBack={props.onBack}
        onRetry={props.onRetry}
      />
    )
  }
  if (props.status === "unavailable") {
    return <InterviewSessionUnavailable onBack={props.onBack} reason={props.reason} />
  }

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-5xl flex-col gap-6 px-4 sm:px-0">
      {props.status === "candidateQuestions" ? (
        <SessionSummaryHeader summary={props.summary} />
      ) : (
        <SessionHeader
          isEnding={props.isEnding}
          isInteractionLocked={props.isInteractionLocked}
          onEnd={props.onEnd}
          summary={props.summary}
        />
      )}
      {props.status === "opening" ? (
        <OpeningContent
          beginFailed={props.beginFailed}
          isBeginning={props.isBeginning}
          onBegin={props.onBegin}
          openingMessage={props.openingMessage}
        />
      ) : props.status === "question" ? (
        <QuestionContent {...props} />
      ) : (
        <>
          <InterviewConversationHistory records={props.history} />
          <CandidateQuestionsStage
            exchanges={props.exchanges}
            isFinishing={props.isFinishing}
            isInteractionLocked={props.isInteractionLocked}
            isSubmittingQuestion={props.isSubmittingQuestion}
            onFinish={props.onFinish}
            onSubmitQuestion={props.onSubmitQuestion}
            prompt={props.prompt}
          />
        </>
      )}
    </div>
  )
}

function SessionSummaryHeader({ summary }: { summary: InterviewSessionSummary }) {
  const { t } = useTranslation()

  return (
    <header className="flex flex-col gap-2 border-b pb-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{t(`interview.rounds.${summary.round}`)}</Badge>
        <Badge variant="outline">{t(`interview.difficulty.${summary.difficulty}`)}</Badge>
      </div>
      <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
        {summary.targetRole}
      </h1>
      {summary.company ? <p className="text-sm text-muted-foreground">{summary.company}</p> : null}
      <p className="text-sm text-muted-foreground">
        {t("interview.session.progress", {
          completed: summary.completedQuestions,
          total: summary.totalQuestions,
        })}
      </p>
    </header>
  )
}

function SessionHeader({
  isEnding,
  isInteractionLocked,
  onEnd,
  summary,
}: {
  isEnding: boolean
  isInteractionLocked: boolean
  onEnd: () => Promise<void>
  summary: InterviewSessionSummary
}) {
  const { t } = useTranslation()
  const [endOpen, setEndOpen] = useState(false)
  const [endFailed, setEndFailed] = useState(false)

  async function confirmEnd() {
    setEndFailed(false)
    try {
      await onEnd()
      setEndOpen(false)
    } catch {
      setEndFailed(true)
    }
  }

  return (
    <>
      <header className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{t(`interview.rounds.${summary.round}`)}</Badge>
            <Badge variant="outline">{t(`interview.difficulty.${summary.difficulty}`)}</Badge>
          </div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
            {summary.targetRole}
          </h1>
          {summary.company ? (
            <p className="text-sm text-muted-foreground">{summary.company}</p>
          ) : null}
          <p className="text-sm text-muted-foreground">
            {t("interview.session.progress", {
              completed: summary.completedQuestions,
              total: summary.totalQuestions,
            })}
          </p>
        </div>
        <Button
          className="self-start"
          disabled={isInteractionLocked}
          onClick={() => setEndOpen(true)}
          type="button"
          variant="outline"
        >
          {isEnding ? (
            <Spinner aria-hidden="true" data-icon="inline-start" />
          ) : (
            <CircleStopIcon aria-hidden="true" data-icon="inline-start" />
          )}
          {t("interview.session.actions.end")}
        </Button>
      </header>

      <AlertDialog onOpenChange={setEndOpen} open={endOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("interview.session.endDialog.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("interview.session.endDialog.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {endFailed ? (
            <Alert variant="destructive">
              <AlertTitle>{t("interview.session.errors.endTitle")}</AlertTitle>
              <AlertDescription>{t("interview.session.errors.endDescription")}</AlertDescription>
            </Alert>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isInteractionLocked}>
              {t("interview.session.actions.continue")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isInteractionLocked}
              onClick={() => void confirmEnd()}
              variant="destructive"
            >
              {isEnding ? <Spinner aria-hidden="true" data-icon="inline-start" /> : null}
              {t("interview.session.actions.confirmEnd")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function OpeningContent({
  beginFailed,
  isBeginning,
  onBegin,
  openingMessage,
}: {
  beginFailed: boolean
  isBeginning: boolean
  onBegin: () => Promise<void>
  openingMessage: string
}) {
  const { t } = useTranslation()

  return (
    <main className="w-full max-w-4xl">
      <Card>
        <CardHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <BotIcon aria-hidden="true" className="size-5" />
          </div>
          <CardTitle>{t("interview.session.opening.title")}</CardTitle>
          <CardDescription>{t("interview.session.opening.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap text-base leading-8">{openingMessage}</p>
          {beginFailed ? (
            <Alert className="mt-6" variant="destructive">
              <AlertTitle>{t("interview.session.errors.beginTitle")}</AlertTitle>
              <AlertDescription>{t("interview.session.errors.beginDescription")}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
        <CardFooter className="border-t">
          <Button disabled={isBeginning} onClick={() => void onBegin()}>
            {isBeginning ? (
              <Spinner aria-hidden="true" data-icon="inline-start" />
            ) : (
              <PlayIcon aria-hidden="true" data-icon="inline-start" />
            )}
            {isBeginning
              ? t("interview.session.actions.beginning")
              : t("interview.session.actions.begin")}
          </Button>
        </CardFooter>
      </Card>
    </main>
  )
}

function QuestionContent(props: Extract<InterviewSessionViewProps, { status: "question" }>) {
  const { t } = useTranslation()

  return (
    <main className="grid min-w-0 gap-6">
      <InterviewConversationHistory records={props.history} />
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Badge>{t(`interview.session.promptKinds.${props.prompt.kind}`)}</Badge>
            <span className="text-sm text-muted-foreground">
              {t("interview.session.questionPosition", {
                current: props.prompt.questionOrder,
                total: props.summary.totalQuestions,
              })}
            </span>
          </div>
          <CardTitle className="pt-3 text-xl leading-8 break-words sm:text-2xl sm:leading-9">
            {props.prompt.content}
          </CardTitle>
          <CardDescription>{t("interview.session.questionDescription")}</CardDescription>
        </CardHeader>
      </Card>

      {props.prompt.answer === null ? (
        <InterviewAnswerComposer
          isPending={props.isSubmitting}
          key={props.prompt.id}
          onSubmit={props.onSubmit}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t("interview.session.answer.submittedTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap break-words text-sm leading-7">
              {props.prompt.answer}
            </p>
          </CardContent>
          <CardFooter aria-live="polite" className="border-t">
            {props.advanceStatus === "advancing" ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner aria-hidden="true" />
                {t("interview.session.advance.loading")}
              </div>
            ) : null}
            {props.advanceStatus === "failed" ? (
              <Alert variant="destructive">
                <AlertCircleIcon aria-hidden="true" />
                <AlertTitle>{t("interview.session.errors.advanceTitle")}</AlertTitle>
                <AlertDescription>
                  {t("interview.session.errors.advanceDescription")}
                </AlertDescription>
                <Button className="mt-3" onClick={props.onRetryAdvance} size="sm" variant="outline">
                  <RotateCcwIcon aria-hidden="true" data-icon="inline-start" />
                  {t("interview.session.actions.retryAdvance")}
                </Button>
              </Alert>
            ) : null}
            {props.advanceStatus === "ready" ? (
              <Button onClick={props.onRetryAdvance}>
                {t("interview.session.actions.continueToNext")}
              </Button>
            ) : null}
          </CardFooter>
        </Card>
      )}
    </main>
  )
}

function InterviewSessionLoading() {
  const { t } = useTranslation()

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 sm:px-0">
      <header className="space-y-3 border-b pb-5">
        <Badge variant="secondary">{t("interview.session.badge")}</Badge>
        <h1 className="font-heading text-2xl font-semibold sm:text-3xl">
          {t("interview.session.title")}
        </h1>
        <Skeleton className="h-4 w-48" />
      </header>
      <Card aria-busy="true" data-testid="interview-session-loading">
        <CardHeader>
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-8 w-4/5" />
          <Skeleton className="h-4 w-2/3" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-52 w-full" />
        </CardContent>
      </Card>
    </div>
  )
}

function InterviewSessionError({
  isRetrying,
  onBack,
  onRetry,
}: {
  isRetrying: boolean
  onBack: () => void
  onRetry: () => void
}) {
  const { t } = useTranslation()

  return (
    <SessionStateCard
      description={t("interview.session.errors.loadDescription")}
      icon={<AlertCircleIcon aria-hidden="true" />}
      title={t("interview.session.errors.loadTitle")}
    >
      <Button disabled={isRetrying} onClick={onRetry}>
        {isRetrying ? (
          <Spinner aria-hidden="true" data-icon="inline-start" />
        ) : (
          <RotateCcwIcon aria-hidden="true" data-icon="inline-start" />
        )}
        {t("interview.actions.retry")}
      </Button>
      <Button onClick={onBack} variant="outline">
        <ArrowLeftIcon aria-hidden="true" data-icon="inline-start" />
        {t("interview.session.actions.backToSetup")}
      </Button>
    </SessionStateCard>
  )
}

function InterviewSessionUnavailable({
  onBack,
  reason,
}: {
  onBack: () => void
  reason: "missing" | "completed"
}) {
  const { t } = useTranslation()

  return (
    <SessionStateCard
      description={t(`interview.session.unavailable.${reason}Description`)}
      icon={<BotIcon aria-hidden="true" />}
      title={t(`interview.session.unavailable.${reason}Title`)}
    >
      <Button onClick={onBack}>
        <ArrowLeftIcon aria-hidden="true" data-icon="inline-start" />
        {reason === "completed"
          ? t("interview.session.actions.viewReview")
          : t("interview.session.actions.backToSetup")}
      </Button>
    </SessionStateCard>
  )
}

function SessionStateCard({
  children,
  description,
  icon,
  title,
}: {
  children: React.ReactNode
  description: string
  icon: React.ReactNode
  title: string
}) {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 sm:px-0">
      <Card>
        <CardContent>
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">{icon}</EmptyMedia>
              <EmptyTitle aria-level={2} role="heading">
                {title}
              </EmptyTitle>
              <EmptyDescription>{description}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent className="flex-row flex-wrap">{children}</EmptyContent>
          </Empty>
        </CardContent>
      </Card>
    </div>
  )
}
