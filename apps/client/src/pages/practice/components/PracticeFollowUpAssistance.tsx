import { LightbulbIcon, ListTreeIcon, SparklesIcon } from "lucide-react"
import { useRef, useState } from "react"
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import type { PracticeFollowUpQuestion, PracticeGuidance } from "@/models/practice"

import type { PracticeInteractionResult } from "../practice-interaction"

type Props = {
  question: PracticeFollowUpQuestion
  pending: { hint: boolean; framework: boolean; referenceAnswer: boolean }
  interactionLocked: boolean
  onRequestHint: () => Promise<PracticeInteractionResult>
  onRequestFramework: () => Promise<PracticeInteractionResult>
  onRequestReferenceAnswer: () => Promise<PracticeInteractionResult>
}

export function PracticeFollowUpAssistance({
  question,
  pending,
  interactionLocked,
  onRequestHint,
  onRequestFramework,
  onRequestReferenceAnswer,
}: Props) {
  const { t } = useTranslation()
  const [error, setError] = useState<"hint" | "framework" | "referenceAnswer" | null>(null)
  const [confirmationOpen, setConfirmationOpen] = useState(false)
  const referenceRequestLock = useRef(false)

  async function request(
    kind: "hint" | "framework",
    operation: () => Promise<PracticeInteractionResult>,
  ) {
    if (interactionLocked) return
    setError(null)
    try {
      await operation()
    } catch {
      setError(kind)
    }
  }

  async function confirmReference() {
    if (interactionLocked || pending.referenceAnswer || referenceRequestLock.current) return
    referenceRequestLock.current = true
    setError(null)
    try {
      const result = await onRequestReferenceAnswer()
      if (result === "executed") setConfirmationOpen(false)
    } catch {
      setConfirmationOpen(false)
      setError("referenceAnswer")
    } finally {
      referenceRequestLock.current = false
    }
  }

  return (
    <section
      aria-label={t("practice.followUpAssistance.title")}
      className="flex min-w-0 flex-col gap-4"
      data-testid="practice-follow-up-assistance"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <FollowUpGuidanceCard
          description={t("practice.followUpAssistance.hintDescription")}
          error={error === "hint"}
          icon={LightbulbIcon}
          isPending={pending.hint}
          interactionLocked={interactionLocked}
          onRequest={() => void request("hint", onRequestHint)}
          pendingLabel={t("practice.followUpAssistance.hintGenerating")}
          requestLabel={t("practice.followUpAssistance.viewHint")}
          state={question.answerHints}
          title={t("practice.followUpAssistance.hintTitle")}
        />
        <FollowUpGuidanceCard
          arrow
          description={t("practice.followUpAssistance.frameworkDescription")}
          error={error === "framework"}
          icon={ListTreeIcon}
          isPending={pending.framework}
          interactionLocked={interactionLocked}
          onRequest={() => void request("framework", onRequestFramework)}
          pendingLabel={t("practice.followUpAssistance.frameworkGenerating")}
          requestLabel={t("practice.followUpAssistance.viewFramework")}
          state={question.answerFramework}
          title={t("practice.followUpAssistance.frameworkTitle")}
        />
      </div>

      <Card className="min-w-0" data-testid="practice-follow-up-reference">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SparklesIcon aria-hidden="true" />
            {t("practice.followUpAssistance.referenceTitle")}
          </CardTitle>
          <CardDescription>{t("practice.followUpAssistance.referenceDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="flex min-w-0 flex-col gap-4">
          {question.referenceAnswer.status === "notRequested" ? (
            <Button
              className="self-start"
              disabled={interactionLocked || pending.referenceAnswer}
              onClick={() => setConfirmationOpen(true)}
              type="button"
            >
              {pending.referenceAnswer ? (
                <Spinner aria-hidden="true" data-icon="inline-start" />
              ) : (
                <SparklesIcon data-icon="inline-start" />
              )}
              {pending.referenceAnswer
                ? t("practice.followUpAssistance.referenceGenerating")
                : t("practice.followUpAssistance.viewReference")}
            </Button>
          ) : null}
          {question.referenceAnswer.status === "revealed" ? (
            <div className="flex min-w-0 flex-col gap-4 break-words [overflow-wrap:anywhere]">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">
                  {t(`practice.followUpAssistance.kind.${question.referenceAnswer.content.kind}`)}
                </Badge>
                {question.referenceAnswer.viewedBeforeSubmission ? (
                  <Badge variant="outline">
                    {t("practice.followUpAssistance.viewedBeforeSubmission")}
                  </Badge>
                ) : null}
              </div>
              <p className="text-sm text-muted-foreground">
                {question.referenceAnswer.content.addressedGap}
              </p>
              <p className="whitespace-pre-wrap text-sm leading-7">
                {question.referenceAnswer.content.answer}
              </p>
              <AssistanceList
                items={question.referenceAnswer.content.keyPoints}
                title={t("practice.followUpAssistance.keyPoints")}
              />
              <AssistanceList
                items={question.referenceAnswer.content.commonMistakes}
                title={t("practice.followUpAssistance.commonMistakes")}
              />
            </div>
          ) : null}
          {question.referenceAnswer.status === "unavailable" ? (
            <p className="text-sm text-muted-foreground" role="status">
              {t("practice.followUpAssistance.unavailable")}
            </p>
          ) : null}
          {error === "referenceAnswer" ? <AssistanceError /> : null}
        </CardContent>
      </Card>

      <AlertDialog onOpenChange={setConfirmationOpen} open={confirmationOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("practice.followUpAssistance.confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("practice.followUpAssistance.confirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending.referenceAnswer || interactionLocked}>
              {t("practice.followUpAssistance.continueIndependently")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={pending.referenceAnswer || interactionLocked}
              onClick={(event) => {
                event.preventDefault()
                void confirmReference()
              }}
            >
              {pending.referenceAnswer ? (
                <Spinner aria-hidden="true" data-icon="inline-start" />
              ) : null}
              {pending.referenceAnswer
                ? t("practice.followUpAssistance.referenceGenerating")
                : t("practice.followUpAssistance.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}

function FollowUpGuidanceCard({
  arrow = false,
  description,
  error,
  icon: Icon,
  interactionLocked,
  isPending,
  onRequest,
  pendingLabel,
  requestLabel,
  state,
  title,
}: {
  arrow?: boolean
  description: string
  error: boolean
  icon: typeof LightbulbIcon
  interactionLocked: boolean
  isPending: boolean
  onRequest: () => void
  pendingLabel: string
  requestLabel: string
  state: PracticeGuidance<string[]>
  title: string
}) {
  const { t } = useTranslation()

  return (
    <Card className="min-w-0" data-testid="practice-follow-up-guidance-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon aria-hidden="true" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-4">
        {state.status === "notRequested" ? (
          <Button
            disabled={interactionLocked || isPending}
            onClick={onRequest}
            type="button"
            variant="outline"
          >
            {isPending ? <Spinner aria-hidden="true" data-icon="inline-start" /> : null}
            {isPending ? pendingLabel : requestLabel}
          </Button>
        ) : null}
        {state.status === "revealed" ? (
          <AssistanceItems arrow={arrow} items={state.content} />
        ) : null}
        {state.status === "unavailable" ? (
          <p className="text-sm text-muted-foreground" role="status">
            {t("practice.followUpAssistance.unavailable")}
          </p>
        ) : null}
        {error ? <AssistanceError /> : null}
      </CardContent>
    </Card>
  )
}

function AssistanceItems({ arrow = false, items }: { arrow?: boolean; items: string[] }) {
  return (
    <ol className={arrow ? "flex flex-col gap-1 text-sm" : "list-disc pl-5 text-sm leading-6"}>
      {items.map((item, index) => (
        <li className="break-words [overflow-wrap:anywhere]" key={item}>
          {arrow && index > 0 ? <span aria-hidden="true">→ </span> : null}
          {item}
        </li>
      ))}
    </ol>
  )
}

function AssistanceError() {
  const { t } = useTranslation()

  return (
    <Alert role="alert" variant="destructive">
      <AlertTitle>{t("practice.followUpAssistance.requestErrorTitle")}</AlertTitle>
      <AlertDescription>
        {t("practice.followUpAssistance.requestErrorDescription")}
      </AlertDescription>
    </Alert>
  )
}

function AssistanceList({ items, title }: { items: string[]; title: string }) {
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <h3 className="font-heading text-sm font-medium">{title}</h3>
      <AssistanceItems items={items} />
    </section>
  )
}
