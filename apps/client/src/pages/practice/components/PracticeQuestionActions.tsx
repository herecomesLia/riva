import { LogOutIcon, SkipForwardIcon } from "lucide-react"
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

import type { PracticeInteractionResult } from "../practice-interaction"
import { PracticeActionErrorAlert, PracticeBottomActionBar } from "./PracticeBottomActionBar"
import { PracticeFlagActions } from "./PracticeFlagActions"

type PracticeQuestionActionsProps = {
  interactionLocked: boolean
  isEndPending: boolean
  isMarkedWeak: boolean
  isSaved: boolean
  isSavedPending: boolean
  isSkipPending: boolean
  isWeakPending: boolean
  onEnd: () => Promise<PracticeInteractionResult>
  onSetSaved: (isSaved: boolean) => Promise<PracticeInteractionResult>
  onSetWeak: (isMarkedWeak: boolean) => Promise<PracticeInteractionResult>
  onSkip: () => Promise<PracticeInteractionResult>
}

type ActionError = "saved" | "weak" | "skip" | "end" | null

export function PracticeQuestionActions({
  interactionLocked,
  isEndPending,
  isMarkedWeak,
  isSaved,
  isSavedPending,
  isSkipPending,
  isWeakPending,
  onEnd,
  onSetSaved,
  onSetWeak,
  onSkip,
}: PracticeQuestionActionsProps) {
  const { t } = useTranslation()
  const [actionError, setActionError] = useState<ActionError>(null)
  const [skipOpen, setSkipOpen] = useState(false)
  const [endOpen, setEndOpen] = useState(false)

  async function setSaved() {
    if (interactionLocked) return
    setActionError(null)
    try {
      await onSetSaved(!isSaved)
    } catch {
      setActionError("saved")
    }
  }

  async function setWeak() {
    if (interactionLocked) return
    setActionError(null)
    try {
      await onSetWeak(!isMarkedWeak)
    } catch {
      setActionError("weak")
    }
  }

  async function skip() {
    if (interactionLocked) return
    setActionError(null)
    try {
      const result = await onSkip()
      if (result === "executed") setSkipOpen(false)
    } catch {
      setActionError("skip")
    }
  }

  async function end() {
    if (interactionLocked) return
    setActionError(null)
    try {
      const result = await onEnd()
      if (result === "executed") setEndOpen(false)
    } catch {
      setActionError("end")
    }
  }

  return (
    <PracticeBottomActionBar
      actionsTestId="practice-question-actions"
      ariaLabel={t("practice.questionActions.title")}
      error={
        actionError === "saved" || actionError === "weak" ? (
          <PracticeActionErrorAlert
            description={t(
              actionError === "saved"
                ? "practice.errors.savedDescription"
                : "practice.errors.weakDescription",
            )}
          />
        ) : undefined
      }
      testId="practice-question-actions-bar"
    >
      <PracticeFlagActions
        disabled={interactionLocked}
        isMarkedWeak={isMarkedWeak}
        isSaved={isSaved}
        isSavedPending={isSavedPending}
        isWeakPending={isWeakPending}
        onSavedClick={() => void setSaved()}
        onWeakClick={() => void setWeak()}
        variant="outline"
      />
      <AlertDialog onOpenChange={setSkipOpen} open={skipOpen}>
        <AlertDialogTrigger
          render={
            <Button
              className="w-full sm:w-auto"
              disabled={interactionLocked}
              type="button"
              variant="outline"
            >
              <SkipForwardIcon data-icon="inline-start" />
              {t("practice.questionActions.skip")}
            </Button>
          }
        />
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("practice.dialog.skipTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("practice.dialog.skipDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          {actionError === "skip" ? (
            <PracticeActionErrorAlert description={t("practice.errors.skipDescription")} />
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={interactionLocked}>
              {t("practice.dialog.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction disabled={interactionLocked} onClick={() => void skip()}>
              {isSkipPending ? <Spinner aria-hidden="true" data-icon="inline-start" /> : null}
              {t("practice.dialog.confirmSkip")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog onOpenChange={setEndOpen} open={endOpen}>
        <AlertDialogTrigger
          render={
            <Button
              className="w-full sm:w-auto"
              disabled={interactionLocked}
              type="button"
              variant="outline"
            >
              <LogOutIcon data-icon="inline-start" />
              {t("practice.questionActions.end")}
            </Button>
          }
        />
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("practice.dialog.endTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("practice.dialog.endDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          {actionError === "end" ? (
            <PracticeActionErrorAlert description={t("practice.errors.endDescription")} />
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={interactionLocked}>
              {t("practice.dialog.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={interactionLocked}
              onClick={() => void end()}
              variant="destructive"
            >
              {isEndPending ? <Spinner aria-hidden="true" data-icon="inline-start" /> : null}
              {t("practice.dialog.confirmEnd")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PracticeBottomActionBar>
  )
}
