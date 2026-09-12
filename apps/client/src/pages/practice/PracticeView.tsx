import { Link, useBlocker } from "@tanstack/react-router"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { defaultHistorySearch } from "@/pages/history/history-navigation"
import { TrainingEntryPreparationFailure } from "@/components/training-entry-preparation-alert"
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import type {
  ActiveSelection,
  AnsweringFollowUpSession,
  AnsweringSession,
  EvaluatingSession,
  PracticeData,
  ReviewSession,
  CompletedSession,
  PracticeSelection,
} from "@/models/practice-workflow"
import type { PracticeTrainingEntryResolution } from "@/models/training-entry"

import {
  PracticeGeneratingState,
  PracticeGenerationErrorState,
  PracticeLoadErrorState,
  PracticeLoadingState,
  PracticeNoRolesState,
} from "./components/PracticePageStates"
import { PracticeSetupForm } from "./components/PracticeSetupForm"
import { PracticeAnswerComposer } from "./components/PracticeAnswerComposer"
import { PracticeQuestionActions } from "./components/PracticeQuestionActions"
import { PracticeQuestionCard } from "./components/PracticeQuestionCard"
import { PracticeQuestionGuidance } from "./components/PracticeQuestionGuidance"
import { PracticeSessionHeader } from "./components/PracticeSessionHeader"
import { PracticeConversationTimeline } from "./components/PracticeConversationTimeline"
import { PracticeFollowUpComposer } from "./components/PracticeFollowUpComposer"
import { PracticeFollowUpAssistance } from "./components/PracticeFollowUpAssistance"
import { PracticeQuestionReview } from "./components/PracticeQuestionReview"
import { PracticeEvaluationStatus } from "./components/PracticeEvaluationStatus"
import { PracticeScoreOverview } from "./components/PracticeScoreOverview"
import { PracticeDimensionScores } from "./components/PracticeDimensionScores"
import {
  PracticeReusableStructure,
  PracticeReviewSummary,
  PracticeWeaknesses,
} from "./components/PracticeReviewDetails"
import { PracticeRecommendationCard } from "./components/PracticeRecommendationCard"
import { PracticeReviewActions } from "./components/PracticeReviewActions"
import { PracticeReferenceAnswer } from "./components/PracticeReferenceAnswer"
import type { PracticeInteractionResult } from "./practice-interaction"

export type PracticeAnsweringActions = {
  onEnd: () => Promise<PracticeInteractionResult>
  onRequestFramework: () => Promise<PracticeInteractionResult>
  onRequestHint: () => Promise<PracticeInteractionResult>
  onRequestReferenceAnswer: () => Promise<PracticeInteractionResult>
  onSetSaved: (value: boolean) => Promise<PracticeInteractionResult>
  onSetWeak: (value: boolean) => Promise<PracticeInteractionResult>
  onSkip: () => Promise<PracticeInteractionResult>
  onSubmitAnswer: (content: string) => Promise<PracticeInteractionResult>
}

export type PracticeFollowUpActions = {
  onRequestHint: () => Promise<PracticeInteractionResult>
  onRequestFramework: () => Promise<PracticeInteractionResult>
  onRequestReferenceAnswer: () => Promise<PracticeInteractionResult>
  onEndFollowUps: () => Promise<PracticeInteractionResult>
  onSubmitFollowUp: (content: string) => Promise<PracticeInteractionResult>
}

export type PracticeFollowUpPending = {
  end: boolean
  framework: boolean
  hint: boolean
  interactionLocked: boolean
  referenceAnswer: boolean
  submit: boolean
}

export type PracticeAnsweringPending = {
  end: boolean
  framework: boolean
  hint: boolean
  referenceAnswer: boolean
  interactionLocked: boolean
  saved: boolean
  skip: boolean
  submitAnswer: boolean
  weak: boolean
}

export type PracticeReviewActions = {
  onEndSession: () => Promise<PracticeInteractionResult>
  onNextQuestion: () => Promise<PracticeInteractionResult>
  onRetryCurrent: () => Promise<PracticeInteractionResult>
  onSetSaved: (value: boolean) => Promise<PracticeInteractionResult>
  onSetWeak: (value: boolean) => Promise<PracticeInteractionResult>
}

export type PracticeReviewPending = {
  end: boolean
  interactionLocked: boolean
  next: boolean
  retry: boolean
  saved: boolean
  weak: boolean
}

export type PracticeCompletedActions = {
  onPrepareNextRound: () => Promise<PracticeInteractionResult>
}

type PracticeViewProps =
  | {
      variant: "error"
      isRetrying: boolean
      onRetry: () => void
    }
  | {
      variant: "historyEntryError"
      isRetrying: boolean
      onRetry: () => void
    }
  | {
      variant: "default"
      content: { status: "loading" }
    }
  | {
      variant: "default"
      content: { status: "ready"; data: PracticeData }
      completedActions: PracticeCompletedActions
      completedPending: boolean
      answeringActions: PracticeAnsweringActions
      answeringPending: PracticeAnsweringPending
      followUpActions: PracticeFollowUpActions
      followUpPending: PracticeFollowUpPending
      reviewActions: PracticeReviewActions
      reviewPending: PracticeReviewPending
      evaluationError: boolean
      isEvaluationRetrying: boolean
      generationError: boolean
      isGenerationRetrying: boolean
      isStarting: boolean
      onRetryGeneration: () => void
      onRetryEvaluation: () => void
      onStart: (input: ActiveSelection) => Promise<void>
      historyEntryResolution?: PracticeTrainingEntryResolution
    }

export function PracticeView(props: PracticeViewProps) {
  const stateRegionRef = useRef<HTMLDivElement>(null)
  const stateKey = getPracticeStateKey(props)
  const previousStateKey = useRef(stateKey)

  useEffect(() => {
    if (previousStateKey.current === stateKey) return

    previousStateKey.current = stateKey
    stateRegionRef.current?.focus()
  }, [stateKey])

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-6">
      <PracticeHeader />
      <div
        className="min-w-0 rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        data-testid="practice-state-region"
        ref={stateRegionRef}
        tabIndex={-1}
      >
        <PracticeViewContent {...props} />
      </div>
    </div>
  )
}

function getPracticeStateKey(props: PracticeViewProps) {
  if (props.variant === "error") return "load-error"
  if (props.variant === "historyEntryError") return "history-entry-error"
  if (props.content.status === "loading") return "loading"
  return `session:${props.content.data.session.status}`
}

function PracticeHeader() {
  const { t } = useTranslation()

  return (
    <header className="flex max-w-3xl flex-col gap-2">
      <h1 className="font-heading text-3xl font-semibold leading-tight tracking-tight">
        {t("practice.title")}
      </h1>
      <p className="text-base leading-7 text-muted-foreground">{t("practice.description")}</p>
    </header>
  )
}

function assertNever(value: never): never {
  throw new Error(`Unhandled practice session state: ${String(value)}`)
}

function PracticeViewContent(props: PracticeViewProps) {
  const { t } = useTranslation()

  if (props.variant === "error") {
    return <PracticeLoadErrorState isRetrying={props.isRetrying} onRetry={props.onRetry} />
  }
  if (props.variant === "historyEntryError") {
    return (
      <Card>
        <CardContent>
          <TrainingEntryPreparationFailure isRetrying={props.isRetrying} onRetry={props.onRetry} />
        </CardContent>
      </Card>
    )
  }

  if (props.content.status === "loading") return <PracticeLoadingState />
  if (!("generationError" in props)) return <PracticeLoadingState />

  const response = props.content.data
  const { session, setupContext } = response

  switch (session.status) {
    case "setup": {
      if (setupContext.roles.length === 0) return <PracticeNoRolesState />

      const selection =
        props.historyEntryResolution?.status === "roleUnavailable"
          ? session.selection
          : resolveActiveSelection(session.selection, setupContext)
      if (!selection) return <PracticeNoRolesState />

      return (
        <Card data-testid="practice-setup-state">
          <CardHeader className="border-b">
            <CardTitle>
              <h2>{t("practice.setup.title")}</h2>
            </CardTitle>
            <CardDescription>{t("practice.setup.description")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <PracticeSetupForm
              context={setupContext}
              historyEntryResolution={props.historyEntryResolution}
              initialSelection={selection}
              isPending={props.isStarting}
              onStart={props.onStart}
            />
          </CardContent>
        </Card>
      )
    }

    case "generatingQuestion":
      if (props.generationError) {
        return (
          <PracticeGenerationErrorState
            context={setupContext}
            isRetrying={props.isGenerationRetrying}
            onRetry={props.onRetryGeneration}
            selection={session.selection}
          />
        )
      }

      return <PracticeGeneratingState context={setupContext} selection={session.selection} />

    case "answering":
      return (
        <PracticeAnsweringView
          actions={props.answeringActions}
          context={setupContext}
          pending={props.answeringPending}
          session={session}
        />
      )

    case "answeringFollowUp":
      return (
        <PracticeFollowUpView
          actions={props.followUpActions}
          context={setupContext}
          pending={props.followUpPending}
          session={session}
        />
      )

    case "evaluating":
      return (
        <PracticeEvaluatingView
          context={setupContext}
          evaluationError={props.evaluationError}
          isEvaluationRetrying={props.isEvaluationRetrying}
          onRetryEvaluation={props.onRetryEvaluation}
          session={session}
        />
      )

    case "review":
      return (
        <PracticeReviewView
          actions={props.reviewActions}
          context={setupContext}
          pending={props.reviewPending}
          session={session}
        />
      )

    case "completed":
      return (
        <PracticeCompletedView
          actions={props.completedActions}
          isPreparingNextRound={props.completedPending}
          session={session}
        />
      )
  }

  return assertNever(session)
}

function PracticeFollowUpView({
  actions,
  context,
  pending,
  session,
}: {
  actions: PracticeFollowUpActions
  context: PracticeData["setupContext"]
  pending: PracticeFollowUpPending
  session: AnsweringFollowUpSession
}) {
  const { t } = useTranslation()
  const [isDraftDirty, setIsDraftDirty] = useState(false)
  const blocker = useBlocker({
    disabled: !isDraftDirty,
    enableBeforeUnload: isDraftDirty,
    shouldBlockFn: () => isDraftDirty,
    withResolver: true,
  })

  return (
    <div className="flex flex-col gap-5" data-testid="practice-answering-follow-up-state">
      <PracticeSessionHeader context={context} selection={session.selection} />
      <PracticeConversationTimeline
        currentFollowUp={session.currentFollowUp}
        followUps={session.followUps}
        mainAnswer={session.mainAnswer}
        question={session.question}
      />
      <PracticeFollowUpComposer
        key={`composer:${session.followUps.length}`}
        interactionLocked={pending.interactionLocked}
        isEndPending={pending.end}
        isPending={pending.submit}
        onDraftChange={setIsDraftDirty}
        onEnd={() => actions.onEndFollowUps()}
        onSubmit={(content) => actions.onSubmitFollowUp(content)}
      />
      <PracticeFollowUpAssistance
        key={session.followUps.length}
        interactionLocked={pending.interactionLocked}
        onRequestFramework={() => actions.onRequestFramework()}
        onRequestHint={() => actions.onRequestHint()}
        onRequestReferenceAnswer={() => actions.onRequestReferenceAnswer()}
        pending={pending}
        question={session.currentFollowUp}
      />

      <AlertDialog open={blocker.status === "blocked"}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("practice.dialog.leaveFollowUpTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("practice.dialog.leaveFollowUpDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => blocker.reset?.()}>
              {t("practice.dialog.stay")}
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => blocker.proceed?.()} variant="destructive">
              {t("practice.dialog.leave")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function PracticeEvaluatingView({
  context,
  evaluationError,
  isEvaluationRetrying,
  onRetryEvaluation,
  session,
}: {
  context: PracticeData["setupContext"]
  evaluationError: boolean
  isEvaluationRetrying: boolean
  onRetryEvaluation: () => void
  session: EvaluatingSession
}) {
  return (
    <div className="flex flex-col gap-5" data-testid="practice-evaluating-state">
      <PracticeSessionHeader context={context} selection={session.selection} />
      <PracticeConversationTimeline
        followUpCompletion={session.followUpCompletion}
        followUps={session.followUps}
        mainAnswer={session.mainAnswer}
        question={session.question}
      />
      <PracticeEvaluationStatus
        error={evaluationError}
        isRetrying={isEvaluationRetrying}
        onRetry={onRetryEvaluation}
      />
    </div>
  )
}

function PracticeReviewView({
  actions,
  context,
  pending,
  session,
}: {
  actions: PracticeReviewActions
  context: PracticeData["setupContext"]
  pending: PracticeReviewPending
  session: ReviewSession
}) {
  const { t } = useTranslation()

  return (
    <div
      className="flex flex-col gap-5 pb-80 min-[360px]:pb-52 sm:pb-40 lg:pb-28"
      data-testid="practice-review-state"
    >
      <PracticeSessionHeader context={context} selection={session.selection} />
      <p className="text-sm text-muted-foreground">
        {t("practice.review.attempt", { count: session.attemptNumber })}
      </p>
      <PracticeScoreOverview
        evaluation={session.evaluation}
        overallPerformance={session.review.overallPerformance}
      />
      <PracticeConversationTimeline
        followUpCompletion={session.followUpCompletion}
        followUps={session.followUps}
        mainAnswer={session.mainAnswer}
        question={session.question}
      />
      <PracticeQuestionReview
        question={session.question}
        followUpCompletion={session.followUpCompletion}
        followUps={session.followUps}
      />
      <PracticeDimensionScores scores={session.evaluation.dimensionScores} />
      <PracticeReviewSummary review={session.review} />
      <PracticeReusableStructure items={session.review.reusableAnswerStructure} />
      <PracticeWeaknesses items={session.review.exposedWeaknesses} />
      <PracticeRecommendationCard recommendation={session.review.recommendation} />
      <PracticeReviewActions
        interactionLocked={pending.interactionLocked}
        isWeak={session.question.isWeak}
        isSaved={session.question.isSaved}
        isSavedPending={pending.saved}
        isWeakPending={pending.weak}
        isEndPending={pending.end}
        isNextPending={pending.next}
        isRetryPending={pending.retry}
        onEndSession={() => actions.onEndSession()}
        onNextQuestion={() => actions.onNextQuestion()}
        onRetryCurrent={() => actions.onRetryCurrent()}
        onSetSaved={(isSaved) => actions.onSetSaved(isSaved)}
        onSetWeak={(isWeak) => actions.onSetWeak(isWeak)}
      />
    </div>
  )
}

function PracticeCompletedView({
  actions,
  isPreparingNextRound,
  session,
}: {
  actions: PracticeCompletedActions
  isPreparingNextRound: boolean
  session: CompletedSession
}) {
  const { t } = useTranslation()
  const [error, setError] = useState(false)

  async function prepareNextRound() {
    setError(false)
    try {
      const result = await actions.onPrepareNextRound()
      if (result === "ignored") return
    } catch {
      setError(true)
    }
  }

  return (
    <Card data-testid="practice-completed-state">
      <CardHeader>
        <CardTitle>{t("practice.completed.title")}</CardTitle>
        <CardDescription>{t("practice.completed.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <p>{t("practice.completed.questions", { count: session.questionsCompleted })}</p>
        <p>{t("practice.completed.retries", { count: session.retryCount })}</p>
        <p>{t("practice.completed.saved", { count: session.savedQuestionCount })}</p>
        <p>{t("practice.completed.markedWeak", { count: session.weakQuestionCount })}</p>
        <p>
          {t("practice.completed.finalAttemptAverage", {
            score: session.finalAttemptAverageScore,
          })}
        </p>
        <p className="text-muted-foreground">{session.nextStepSuggestion}</p>
        {error && (
          <Alert variant="destructive">
            <AlertTitle>{t("practice.errors.prepareNextRoundTitle")}</AlertTitle>
            <AlertDescription>{t("practice.errors.prepareNextRoundDescription")}</AlertDescription>
          </Alert>
        )}
      </CardContent>
      <CardFooter className="flex flex-col gap-2 sm:flex-row">
        <Button disabled={isPreparingNextRound} onClick={() => void prepareNextRound()}>
          {isPreparingNextRound && <Spinner aria-hidden="true" data-icon="inline-start" />}
          {isPreparingNextRound
            ? t("practice.completed.preparingNextRound")
            : t("practice.completed.startNextRound")}
        </Button>
        <Button
          disabled={isPreparingNextRound}
          nativeButton={false}
          render={<Link search={defaultHistorySearch} to="/history" />}
          variant="outline"
        >
          {t("practice.completed.viewHistory")}
        </Button>
      </CardFooter>
    </Card>
  )
}

function PracticeAnsweringView({
  actions,
  context,
  pending,
  session,
}: {
  actions: PracticeAnsweringActions
  context: PracticeData["setupContext"]
  pending: PracticeAnsweringPending
  session: AnsweringSession
}) {
  const { t } = useTranslation()
  const [isDraftDirty, setIsDraftDirty] = useState(false)
  const blocker = useBlocker({
    disabled: !isDraftDirty,
    enableBeforeUnload: isDraftDirty,
    shouldBlockFn: () => isDraftDirty,
    withResolver: true,
  })

  return (
    <>
      <div
        className="flex flex-col gap-5 pb-56 min-[360px]:pb-40 sm:pb-28"
        data-testid="practice-answering-state"
      >
        <PracticeSessionHeader context={context} selection={session.selection} />
        <PracticeQuestionCard question={session.question} />
        <PracticeAnswerComposer
          interactionLocked={pending.interactionLocked}
          isPending={pending.submitAnswer}
          onDraftChange={setIsDraftDirty}
          onSubmit={(content) => actions.onSubmitAnswer(content)}
        />
        <PracticeQuestionGuidance
          framework={session.question.framework}
          hints={session.question.hints}
          interactionLocked={pending.interactionLocked}
          isFrameworkPending={pending.framework}
          isHintPending={pending.hint}
          onRequestFramework={() => actions.onRequestFramework()}
          onRequestHint={() => actions.onRequestHint()}
        />
        <PracticeReferenceAnswer
          assistedRetry={session.assistedRetry}
          interactionLocked={pending.interactionLocked}
          isPending={pending.referenceAnswer}
          mode="answering"
          onRequest={() => actions.onRequestReferenceAnswer()}
          state={session.question.referenceAnswer}
        />
      </div>
      <PracticeQuestionActions
        interactionLocked={pending.interactionLocked}
        isEndPending={pending.end}
        isWeak={session.question.isWeak}
        isSaved={session.question.isSaved}
        isSavedPending={pending.saved}
        isSkipPending={pending.skip}
        isWeakPending={pending.weak}
        onEnd={() => actions.onEnd()}
        onSetSaved={(isSaved) => actions.onSetSaved(isSaved)}
        onSetWeak={(isWeak) => actions.onSetWeak(isWeak)}
        onSkip={() => actions.onSkip()}
      />

      <AlertDialog open={blocker.status === "blocked"}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("practice.dialog.leaveTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("practice.dialog.leaveDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => blocker.reset?.()}>
              {t("practice.dialog.stay")}
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => blocker.proceed?.()} variant="destructive">
              {t("practice.dialog.leave")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function resolveActiveSelection(
  selection: PracticeSelection,
  context: PracticeData["setupContext"],
): ActiveSelection | null {
  const roleId = selection.roleId
  if (!roleId) return null

  const role = context.roles.find((candidate) => candidate.id === roleId)
  if (!role) return null
  const questionType = role.supportedQuestionTypes.includes(selection.questionType)
    ? selection.questionType
    : role.supportedQuestionTypes[0]
  if (!questionType) return null

  return { ...selection, roleId, questionType }
}
