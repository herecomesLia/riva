import { BookmarkIcon, BrainIcon, LogOutIcon, SkipForwardIcon } from "lucide-react"
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

import type { PracticeInteractionResult } from "../practice-interaction"

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
    <section
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur transition-[left] duration-200 ease-linear md:left-(--sidebar-width) md:group-has-data-[collapsible=icon]/sidebar-wrapper:left-(--sidebar-width-icon)"
      aria-label={t("practice.questionActions.title")}
      data-testid="practice-question-actions-bar"
    >
      <div className="px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-6">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-3">
          {actionError === "saved" || actionError === "weak" ? (
            <ActionErrorAlert
              description={t(
                actionError === "saved"
                  ? "practice.errors.savedDescription"
                  : "practice.errors.weakDescription",
              )}
            />
          ) : null}
          <div
            className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2 sm:flex sm:flex-wrap"
            data-testid="practice-question-actions"
          >
            <Button
              className="w-full sm:w-auto"
              aria-pressed={isSaved}
              disabled={interactionLocked}
              onClick={() => void setSaved()}
              type="button"
              variant="outline"
            >
              {isSavedPending ? (
                <Spinner aria-hidden="true" data-icon="inline-start" />
              ) : (
                <BookmarkIcon
                  className={cn(isSaved && "fill-destructive text-destructive")}
                  data-icon="inline-start"
                />
              )}
              {isSaved ? t("practice.questionActions.unsave") : t("practice.questionActions.save")}
            </Button>
            <Button
              className="w-full sm:w-auto"
              aria-pressed={isMarkedWeak}
              disabled={interactionLocked}
              onClick={() => void setWeak()}
              type="button"
              variant="outline"
            >
              {isWeakPending ? (
                <Spinner aria-hidden="true" data-icon="inline-start" />
              ) : (
                <BrainIcon
                  className={cn(isMarkedWeak && "text-amber-500")}
                  data-icon="inline-start"
                />
              )}
              {isMarkedWeak
                ? t("practice.questionActions.unmarkWeak")
                : t("practice.questionActions.markWeak")}
            </Button>
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
                  <AlertDialogDescription>
                    {t("practice.dialog.skipDescription")}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                {actionError === "skip" ? (
                  <ActionErrorAlert description={t("practice.errors.skipDescription")} />
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
                  <AlertDialogDescription>
                    {t("practice.dialog.endDescription")}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                {actionError === "end" ? (
                  <ActionErrorAlert description={t("practice.errors.endDescription")} />
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
          </div>
        </div>
      </div>
    </section>
  )
}

function ActionErrorAlert({ description }: { description: string }) {
  const { t } = useTranslation()

  return (
    <Alert role="alert" variant="destructive">
      <AlertTitle>{t("practice.errors.actionTitle")}</AlertTitle>
      <AlertDescription>{description}</AlertDescription>
    </Alert>
  )
}
