import { LightbulbIcon, ListTreeIcon } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import type { PracticeGuidance } from "@/models/practice"

import type { PracticeInteractionResult } from "../practice-interaction"

type PracticeQuestionGuidanceProps = {
  answerFramework: PracticeGuidance<string[]>
  answerHints: PracticeGuidance<string[]>
  interactionLocked: boolean
  isFrameworkPending: boolean
  isHintPending: boolean
  onRequestFramework: () => Promise<PracticeInteractionResult>
  onRequestHint: () => Promise<PracticeInteractionResult>
}

export function PracticeQuestionGuidance({
  answerFramework,
  answerHints,
  interactionLocked,
  isFrameworkPending,
  isHintPending,
  onRequestFramework,
  onRequestHint,
}: PracticeQuestionGuidanceProps) {
  const { t } = useTranslation()
  const [hintError, setHintError] = useState(false)
  const [frameworkError, setFrameworkError] = useState(false)

  async function requestHint() {
    if (interactionLocked || answerHints.status !== "notRequested") return
    setHintError(false)
    try {
      await onRequestHint()
    } catch {
      setHintError(true)
    }
  }

  async function requestFramework() {
    if (interactionLocked || answerFramework.status !== "notRequested") return
    setFrameworkError(false)
    try {
      await onRequestFramework()
    } catch {
      setFrameworkError(true)
    }
  }

  return (
    <section className="grid gap-4 md:grid-cols-2" aria-label={t("practice.guidance.title")}>
      <GuidanceCard
        content={answerHints.content}
        description={t("practice.guidance.hintDescription")}
        error={hintError}
        errorDescription={t("practice.errors.hintDescription")}
        errorTitle={t("practice.errors.hintTitle")}
        icon={LightbulbIcon}
        isPending={isHintPending}
        interactionLocked={interactionLocked}
        onRequest={() => void requestHint()}
        requestLabel={t("practice.guidance.requestHint")}
        status={answerHints.status}
        title={t("practice.guidance.hintTitle")}
        unavailableLabel={t("practice.guidance.hintUnavailable")}
      />
      <GuidanceCard
        content={answerFramework.content}
        description={t("practice.guidance.frameworkDescription")}
        error={frameworkError}
        errorDescription={t("practice.errors.frameworkDescription")}
        errorTitle={t("practice.errors.frameworkTitle")}
        icon={ListTreeIcon}
        isPending={isFrameworkPending}
        interactionLocked={interactionLocked}
        onRequest={() => void requestFramework()}
        requestLabel={t("practice.guidance.requestFramework")}
        status={answerFramework.status}
        title={t("practice.guidance.frameworkTitle")}
        unavailableLabel={t("practice.guidance.frameworkUnavailable")}
      />
    </section>
  )
}

type GuidanceCardProps = {
  content: string[] | null
  description: string
  error: boolean
  errorDescription: string
  errorTitle: string
  icon: typeof LightbulbIcon
  interactionLocked: boolean
  isPending: boolean
  onRequest: () => void
  requestLabel: string
  status: PracticeGuidance<string[]>["status"]
  title: string
  unavailableLabel: string
}

function GuidanceCard({
  content,
  description,
  error,
  errorDescription,
  errorTitle,
  icon: Icon,
  interactionLocked,
  isPending,
  onRequest,
  requestLabel,
  status,
  title,
  unavailableLabel,
}: GuidanceCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon aria-hidden="true" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {status === "revealed" && content ? (
          <ul
            className="flex list-disc flex-col gap-2 pl-5"
            data-testid="practice-guidance-content"
          >
            {content.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : null}
        {status === "unavailable" ? (
          <p className="text-sm text-muted-foreground">{unavailableLabel}</p>
        ) : null}
        {status === "notRequested" ? (
          <Button disabled={interactionLocked} onClick={onRequest} type="button" variant="outline">
            {isPending ? <Spinner aria-hidden="true" data-icon="inline-start" /> : null}
            {requestLabel}
          </Button>
        ) : null}
        {error ? (
          <Alert role="alert" variant="destructive">
            <AlertTitle>{errorTitle}</AlertTitle>
            <AlertDescription>{errorDescription}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  )
}
