import { useState } from "react"
import { useTranslation } from "react-i18next"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"

import type { PracticeInteractionResult } from "../practice-interaction"

export function PracticeReviewActions({
  interactionLocked,
  isMarkedWeak,
  isSaved,
  isSavedPending,
  isWeakPending,
  onEndSession,
  onNextQuestion,
  onRetryCurrent,
  onSetSaved,
  onSetWeak,
}: {
  interactionLocked: boolean
  isMarkedWeak: boolean
  isSaved: boolean
  isSavedPending: boolean
  isWeakPending: boolean
  onEndSession: () => void
  onNextQuestion: () => void
  onRetryCurrent: () => void
  onSetSaved: (value: boolean) => Promise<PracticeInteractionResult>
  onSetWeak: (value: boolean) => Promise<PracticeInteractionResult>
}) {
  const { t } = useTranslation()
  const [error, setError] = useState<"saved" | "weak" | null>(null)

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
        <CardDescription>{t("practice.review.actionsDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && (
          <Alert variant="destructive">
            <AlertTitle>{t("practice.errors.actionTitle")}</AlertTitle>
            <AlertDescription>
              {t(
                error === "saved"
                  ? "practice.errors.savedDescription"
                  : "practice.errors.weakDescription",
              )}
            </AlertDescription>
          </Alert>
        )}
        <div className="flex flex-wrap gap-2">
          <Button onClick={onRetryCurrent} variant="outline">
            {t("practice.review.retryCurrent")}
          </Button>
          <Button onClick={onNextQuestion}>{t("practice.review.nextQuestion")}</Button>
          <Button onClick={onEndSession} variant="outline">
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
      </CardContent>
    </Card>
  )
}
