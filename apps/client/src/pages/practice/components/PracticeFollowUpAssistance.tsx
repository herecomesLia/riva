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
import { Spinner } from "@/components/ui/spinner"
import type { PracticeFollowUpQuestion } from "@/models/practice"

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
      aria-labelledby="practice-follow-up-assistance-title"
      className="flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-4"
      data-testid="practice-follow-up-assistance"
    >
      <div className="flex flex-col gap-1">
        <h2 className="font-heading font-medium" id="practice-follow-up-assistance-title">
          {t("practice.followUpAssistance.title")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t("practice.followUpAssistance.description")}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {question.answerHints.status === "notRequested" ? (
          <Button
            disabled={interactionLocked}
            onClick={() => void request("hint", onRequestHint)}
            size="sm"
            type="button"
            variant="outline"
          >
            {pending.hint ? (
              <Spinner aria-hidden="true" data-icon="inline-start" />
            ) : (
              <LightbulbIcon data-icon="inline-start" />
            )}
            {pending.hint
              ? t("practice.followUpAssistance.hintGenerating")
              : t("practice.followUpAssistance.viewHint")}
          </Button>
        ) : null}
        {question.answerFramework.status === "notRequested" ? (
          <Button
            disabled={interactionLocked}
            onClick={() => void request("framework", onRequestFramework)}
            size="sm"
            type="button"
            variant="outline"
          >
            {pending.framework ? (
              <Spinner aria-hidden="true" data-icon="inline-start" />
            ) : (
              <ListTreeIcon data-icon="inline-start" />
            )}
            {pending.framework
              ? t("practice.followUpAssistance.frameworkGenerating")
              : t("practice.followUpAssistance.viewFramework")}
          </Button>
        ) : null}
        {question.referenceAnswer.status === "notRequested" ? (
          <Button
            disabled={interactionLocked}
            onClick={() => setConfirmationOpen(true)}
            size="sm"
            type="button"
            variant="outline"
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
      </div>

      {question.answerHints.status === "revealed" ? (
        <AssistanceList
          items={question.answerHints.content}
          title={t("practice.followUpAssistance.hintTitle")}
        />
      ) : null}
      {question.answerFramework.status === "revealed" ? (
        <AssistanceList
          arrow
          items={question.answerFramework.content}
          title={t("practice.followUpAssistance.frameworkTitle")}
        />
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
      {question.answerHints.status === "unavailable" ||
      question.answerFramework.status === "unavailable" ||
      question.referenceAnswer.status === "unavailable" ? (
        <p className="text-sm text-muted-foreground" role="status">
          {t("practice.followUpAssistance.unavailable")}
        </p>
      ) : null}
      {error ? (
        <Alert role="alert" variant="destructive">
          <AlertTitle>{t("practice.followUpAssistance.requestErrorTitle")}</AlertTitle>
          <AlertDescription>
            {t("practice.followUpAssistance.requestErrorDescription")}
          </AlertDescription>
        </Alert>
      ) : null}

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

function AssistanceList({
  arrow = false,
  items,
  title,
}: {
  arrow?: boolean
  items: string[]
  title: string
}) {
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <h3 className="font-heading text-sm font-medium">{title}</h3>
      <ol className={arrow ? "flex flex-col gap-1 text-sm" : "list-disc pl-5 text-sm leading-6"}>
        {items.map((item, index) => (
          <li className="break-words [overflow-wrap:anywhere]" key={item}>
            {arrow && index > 0 ? <span aria-hidden="true">→ </span> : null}
            {item}
          </li>
        ))}
      </ol>
    </section>
  )
}
