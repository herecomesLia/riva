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
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

import type { PracticeInteractionResult } from "../practice-interaction"
import { PracticeActionErrorAlert, PracticeBottomActionBar } from "./PracticeBottomActionBar"
import { PracticeFlagActions } from "./PracticeFlagActions"

export function PracticeReviewActions({
  interactionLocked,
  isWeak,
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
  isWeak: boolean
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
      await onSetWeak(!isWeak)
    } catch {
      setError("weak")
    }
  }

  return (
    <>
      <PracticeBottomActionBar
        actionsTestId="practice-review-actions"
        ariaLabel={t("practice.review.actionsTitle")}
        error={
          error && error !== "end" ? (
            <PracticeActionErrorAlert description={t(`practice.errors.${error}Description`)} />
          ) : undefined
        }
        testId="practice-review-actions-bar"
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
        <PracticeFlagActions
          disabled={interactionLocked}
          isWeak={isWeak}
          isSaved={isSaved}
          isSavedPending={isSavedPending}
          isWeakPending={isWeakPending}
          onSavedClick={() => void updateSaved()}
          onWeakClick={() => void updateWeak()}
          variant="secondary"
        />
      </PracticeBottomActionBar>
      <AlertDialog open={endOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("practice.review.endConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("practice.review.endConfirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error === "end" ? (
            <PracticeActionErrorAlert description={t("practice.errors.reviewEndDescription")} />
          ) : null}
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
    </>
  )
}
