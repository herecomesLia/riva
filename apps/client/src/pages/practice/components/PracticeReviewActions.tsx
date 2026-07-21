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
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"

import type { PracticeInteractionResult } from "../practice-interaction"

export function PracticeReviewActions({
  interactionLocked,
  isMarkedWeak,
  isEndPending,
  isNextPending,
  isRetryPending,
  isSaved,
  isSavedPending,
  isWeakPending,
  onSetSaved,
  onSetWeak,
  onEndSession,
  onNextQuestion,
  onRetryCurrent,
}: {
  interactionLocked: boolean
  isEndPending: boolean
  isNextPending: boolean
  isRetryPending: boolean
  isMarkedWeak: boolean
  isSaved: boolean
  isSavedPending: boolean
  isWeakPending: boolean
  onSetSaved: (value: boolean) => Promise<PracticeInteractionResult>
  onSetWeak: (value: boolean) => Promise<PracticeInteractionResult>
  onEndSession: () => Promise<PracticeInteractionResult>
  onNextQuestion: () => Promise<PracticeInteractionResult>
  onRetryCurrent: () => Promise<PracticeInteractionResult>
}) {
  const { t } = useTranslation()
  const [error, setError] = useState<"retry" | "next" | "end" | "saved" | "weak" | null>(null)
  const [endOpen, setEndOpen] = useState(false)

  async function run(
    action: "retry" | "next" | "end",
    operation: () => Promise<PracticeInteractionResult>,
  ) {
    setError(null)
    try {
      const result = await operation()
      if (result === "ignored") return
      if (action === "end") setEndOpen(false)
    } catch {
      setError(action)
    }
  }

  async function updateSaved() {
    setError(null)
    try {
      await onSetSaved(!isSaved)
    } catch {
      setError("saved")
    }
  }

  async function updateWeak() {
    setError(null)
    try {
      await onSetWeak(!isMarkedWeak)
    } catch {
      setError("weak")
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("practice.review.actionsTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && (
          <Alert variant="destructive">
            <AlertTitle>{t("practice.errors.actionTitle")}</AlertTitle>
            <AlertDescription>
              {t(
                error === "end"
                  ? "practice.errors.reviewEndDescription"
                  : `practice.errors.${error}Description`,
              )}
            </AlertDescription>
          </Alert>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={interactionLocked}
            onClick={() => void run("retry", onRetryCurrent)}
            variant="outline"
          >
            {isRetryPending && <Spinner aria-hidden="true" data-icon="inline-start" />}
            {t("practice.review.retryCurrent")}
          </Button>
          <Button disabled={interactionLocked} onClick={() => void run("next", onNextQuestion)}>
            {isNextPending && <Spinner aria-hidden="true" data-icon="inline-start" />}
            {t("practice.review.nextQuestion")}
          </Button>
          <Button disabled={interactionLocked} onClick={() => setEndOpen(true)} variant="outline">
            {isEndPending && <Spinner aria-hidden="true" data-icon="inline-start" />}
            {t("practice.review.endSession")}
          </Button>
          <Button
            aria-pressed={isSaved}
            disabled={interactionLocked}
            onClick={() => void updateSaved()}
            variant="secondary"
          >
            {isSavedPending && <Spinner aria-hidden="true" data-icon="inline-start" />}
            {isSaved ? t("practice.questionActions.unsave") : t("practice.questionActions.save")}
          </Button>
          <Button
            aria-pressed={isMarkedWeak}
            disabled={interactionLocked}
            onClick={() => void updateWeak()}
            variant="secondary"
          >
            {isWeakPending && <Spinner aria-hidden="true" data-icon="inline-start" />}
            {isMarkedWeak
              ? t("practice.questionActions.unmarkWeak")
              : t("practice.questionActions.markWeak")}
          </Button>
        </div>
        <AlertDialog open={endOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("practice.review.endConfirmTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("practice.review.endConfirmDescription")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={interactionLocked} onClick={() => setEndOpen(false)}>
                {t("practice.dialog.stay")}
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={interactionLocked}
                onClick={() => void run("end", onEndSession)}
                variant="destructive"
              >
                {isEndPending && <Spinner aria-hidden="true" data-icon="inline-start" />}
                {t("practice.review.endSession")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  )
}
