import { useTranslation } from "react-i18next"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type {
  ActivePracticeSelection,
  PracticePageResponse,
  PracticeSetupSelection,
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
      generationError: boolean
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
          isRetrying={props.isStarting}
          onRetry={props.onRetryGeneration}
          selection={session.selection}
        />
      )
    }

    return <PracticeGeneratingState context={setupContext} selection={session.selection} />
  }

  if (session.status === "answering") {
    return <PracticeQuestionReadyState question={session.question} />
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
