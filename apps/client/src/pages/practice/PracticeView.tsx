import { useBlocker } from "@tanstack/react-router"
import { useState } from "react"
import { useTranslation } from "react-i18next"

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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type {
  ActivePracticeSelection,
  PracticeAnsweringState,
  PracticePageResponse,
  RequestAnswerFrameworkInput,
  RequestEndPracticeSessionInput,
  RequestPracticeHintInput,
  SetPracticeQuestionSavedInput,
  SetPracticeQuestionWeakInput,
  SkipPracticeQuestionInput,
  PracticeSetupSelection,
  SubmitPracticeAnswerInput,
} from "@/models/practice"

import {
  PracticeGeneratingState,
  PracticeGenerationErrorState,
  PracticeLoadErrorState,
  PracticeLoadingState,
  PracticeNoRolesState,
  PracticeQuestionReadyState,
} from "./components/PracticePageStates"
import { PracticeSetupForm } from "./components/PracticeSetupForm"
import { PracticeAnswerComposer } from "./components/PracticeAnswerComposer"
import { PracticeQuestionActions } from "./components/PracticeQuestionActions"
import { PracticeQuestionCard } from "./components/PracticeQuestionCard"
import { PracticeQuestionGuidance } from "./components/PracticeQuestionGuidance"
import { PracticeSessionHeader } from "./components/PracticeSessionHeader"

export type PracticeAnsweringActions = {
  onEnd: (input: RequestEndPracticeSessionInput) => Promise<void>
  onRequestFramework: (input: RequestAnswerFrameworkInput) => Promise<void>
  onRequestHint: (input: RequestPracticeHintInput) => Promise<void>
  onSetSaved: (input: SetPracticeQuestionSavedInput) => Promise<void>
  onSetWeak: (input: SetPracticeQuestionWeakInput) => Promise<void>
  onSkip: (input: SkipPracticeQuestionInput) => Promise<void>
  onSubmitAnswer: (input: SubmitPracticeAnswerInput) => Promise<void>
}

export type PracticeAnsweringPending = {
  end: boolean
  framework: boolean
  hint: boolean
  interactionLocked: boolean
  saved: boolean
  skip: boolean
  submitAnswer: boolean
  weak: boolean
}

type PracticeViewProps =
  | {
      variant: "error"
      isRetrying: boolean
      onRetry: () => void
    }
  | {
      variant: "default"
      content: { status: "loading" }
    }
  | {
      variant: "default"
      content: { status: "ready"; data: PracticePageResponse }
      answeringActions: PracticeAnsweringActions
      answeringPending: PracticeAnsweringPending
      generationError: boolean
      isGenerationRetrying: boolean
      isStarting: boolean
      onRetryGeneration: () => void
      onStart: (input: ActivePracticeSelection) => Promise<void>
    }

export function PracticeView(props: PracticeViewProps) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <PracticeHeader />
      <PracticeViewContent {...props} />
    </div>
  )
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

function PracticeViewContent(props: PracticeViewProps) {
  const { t } = useTranslation()

  if (props.variant === "error") {
    return <PracticeLoadErrorState isRetrying={props.isRetrying} onRetry={props.onRetry} />
  }

  if (props.content.status === "loading") return <PracticeLoadingState />
  if (!("generationError" in props)) return <PracticeLoadingState />

  const response = props.content.data
  const { session, setupContext } = response

  if (session.status === "setup") {
    if (setupContext.targetRoles.length === 0) return <PracticeNoRolesState />

    const selection = resolveActiveSelection(session.selection, setupContext)
    if (!selection) return <PracticeNoRolesState />

    return (
      <Card data-testid="practice-setup-state">
        <CardHeader>
          <CardTitle>
            <h2>{t("practice.setup.title")}</h2>
          </CardTitle>
          <CardDescription>{t("practice.setup.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <PracticeSetupForm
            context={setupContext}
            initialSelection={selection}
            isPending={props.isStarting}
            onStart={props.onStart}
          />
        </CardContent>
      </Card>
    )
  }

  if (session.status === "generatingQuestion") {
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
  }

  if (session.status === "answering") {
    return (
      <PracticeAnsweringView
        actions={props.answeringActions}
        context={setupContext}
        pending={props.answeringPending}
        session={session}
      />
    )
  }

  if (session.status === "evaluating") {
    return (
      <Card aria-live="polite" data-testid="practice-evaluating-state">
        <CardHeader>
          <CardTitle>{t("practice.evaluating.title")}</CardTitle>
          <CardDescription>{t("practice.evaluating.description")}</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (session.status === "completed") {
    return (
      <Card data-testid="practice-completed-state">
        <CardHeader>
          <CardTitle>{t("practice.completed.title")}</CardTitle>
          <CardDescription>{t("practice.completed.description")}</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if ("question" in session) return <PracticeQuestionReadyState question={session.question} />

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("practice.ready.title")}</CardTitle>
        <CardDescription>{t("practice.ready.description")}</CardDescription>
      </CardHeader>
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
  context: PracticePageResponse["setupContext"]
  pending: PracticeAnsweringPending
  session: PracticeAnsweringState
}) {
  const { t } = useTranslation()
  const [isDraftDirty, setIsDraftDirty] = useState(false)
  const blocker = useBlocker({
    disabled: !isDraftDirty,
    enableBeforeUnload: isDraftDirty,
    shouldBlockFn: () => isDraftDirty,
    withResolver: true,
  })
  const mutationInput = {
    sessionId: session.sessionId,
    version: session.version,
    questionId: session.question.id,
  }

  return (
    <div className="flex flex-col gap-5" data-testid="practice-answering-state">
      <PracticeSessionHeader context={context} selection={session.selection} />
      <PracticeQuestionCard question={session.question} />
      <PracticeAnswerComposer
        interactionLocked={pending.interactionLocked}
        isPending={pending.submitAnswer}
        onDraftChange={setIsDraftDirty}
        onSubmit={(content) => actions.onSubmitAnswer({ ...mutationInput, content })}
      />
      <PracticeQuestionGuidance
        answerFramework={session.question.answerFramework}
        answerHints={session.question.answerHints}
        interactionLocked={pending.interactionLocked}
        isFrameworkPending={pending.framework}
        isHintPending={pending.hint}
        onRequestFramework={() => actions.onRequestFramework(mutationInput)}
        onRequestHint={() => actions.onRequestHint(mutationInput)}
      />
      <PracticeQuestionActions
        interactionLocked={pending.interactionLocked}
        isEndPending={pending.end}
        isMarkedWeak={session.question.isMarkedWeak}
        isSaved={session.question.isSaved}
        isSavedPending={pending.saved}
        isSkipPending={pending.skip}
        isWeakPending={pending.weak}
        onEnd={() => actions.onEnd(mutationInput)}
        onSetSaved={(isSaved) => actions.onSetSaved({ ...mutationInput, isSaved })}
        onSetWeak={(isMarkedWeak) => actions.onSetWeak({ ...mutationInput, isMarkedWeak })}
        onSkip={() => actions.onSkip(mutationInput)}
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
    </div>
  )
}

function resolveActiveSelection(
  selection: PracticeSetupSelection,
  context: PracticePageResponse["setupContext"],
): ActivePracticeSelection | null {
  const targetRoleId = selection.targetRoleId
  if (!targetRoleId) return null

  const role = context.targetRoles.find((candidate) => candidate.id === targetRoleId)
  if (!role) return null
  const questionType = role.supportedQuestionTypes.includes(selection.questionType)
    ? selection.questionType
    : role.supportedQuestionTypes[0]
  if (!questionType) return null

  return { ...selection, targetRoleId, questionType }
}
