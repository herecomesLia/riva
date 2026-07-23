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
      if (action === "end") setEndOpen(false)
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
    <section
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur transition-[left] duration-200 ease-linear md:left-(--sidebar-width) md:group-has-data-[collapsible=icon]/sidebar-wrapper:left-(--sidebar-width-icon)"
      aria-label={t("practice.review.actionsTitle")}
      data-testid="practice-review-actions-bar"
    >
      <div className="px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-6">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-3">
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
          <div
            className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2 sm:flex sm:flex-wrap"
            data-testid="practice-review-actions"
          >
            <Button
              className="w-full sm:w-auto"
              disabled={interactionLocked}
              onClick={() => void run("retry", onRetryCurrent)}
              type="button"
              variant="outline"
            >
              {isRetryPending && <Spinner aria-hidden="true" data-icon="inline-start" />}
              {t("practice.review.retryCurrent")}
            </Button>
            <Button
              className="w-full sm:w-auto"
              disabled={interactionLocked}
              onClick={() => void run("next", onNextQuestion)}
              type="button"
            >
              {isNextPending && <Spinner aria-hidden="true" data-icon="inline-start" />}
              {t("practice.review.nextQuestion")}
            </Button>
            <Button
              className="w-full sm:w-auto"
              disabled={interactionLocked}
              onClick={() => {
                if (!interactionLocked) setEndOpen(true)
              }}
              type="button"
              variant="outline"
            >
              {isEndPending && <Spinner aria-hidden="true" data-icon="inline-start" />}
              {t("practice.review.endSession")}
            </Button>
            <Button
              className="w-full sm:w-auto"
              aria-pressed={isSaved}
              disabled={interactionLocked}
              onClick={() => void updateSaved()}
              type="button"
              variant="secondary"
            >
              {isSavedPending && <Spinner aria-hidden="true" data-icon="inline-start" />}
              {isSaved ? t("practice.questionActions.unsave") : t("practice.questionActions.save")}
            </Button>
            <Button
              className="w-full sm:w-auto"
              aria-pressed={isMarkedWeak}
              disabled={interactionLocked}
              onClick={() => void updateWeak()}
              type="button"
              variant="secondary"
            >
              {isWeakPending && <Spinner aria-hidden="true" data-icon="inline-start" />}
              {isMarkedWeak
                ? t("practice.questionActions.unmarkWeak")
                : t("practice.questionActions.markWeak")}
            </Button>
          </div>
        </div>
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
    </section>
  )
}
