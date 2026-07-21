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

type PracticeQuestionActionsProps = {
  isEndPending: boolean
  isMarkedWeak: boolean
  isSaved: boolean
  isSavedPending: boolean
  isSkipPending: boolean
  isWeakPending: boolean
  onEnd: () => Promise<void>
  onSetSaved: (isSaved: boolean) => Promise<void>
  onSetWeak: (isMarkedWeak: boolean) => Promise<void>
  onSkip: () => Promise<void>
}

type ActionError = "saved" | "weak" | "skip" | "end" | null

export function PracticeQuestionActions({
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
    if (isSavedPending) return
    setActionError(null)
    try {
      await onSetSaved(!isSaved)
    } catch {
      setActionError("saved")
    }
  }

  async function setWeak() {
    if (isWeakPending) return
    setActionError(null)
    try {
      await onSetWeak(!isMarkedWeak)
    } catch {
      setActionError("weak")
    }
  }

  async function skip() {
    if (isSkipPending) return
    setActionError(null)
    try {
      await onSkip()
      setSkipOpen(false)
    } catch {
      setActionError("skip")
    }
  }

  async function end() {
    if (isEndPending) return
    setActionError(null)
    try {
      await onEnd()
      setEndOpen(false)
    } catch {
      setActionError("end")
    }
  }

  return (
    <section className="flex flex-col gap-3" aria-label={t("practice.questionActions.title")}>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button
          aria-pressed={isSaved}
          disabled={isSavedPending}
          onClick={() => void setSaved()}
          type="button"
          variant="outline"
        >
          {isSavedPending ? (
            <Spinner aria-hidden="true" data-icon="inline-start" />
          ) : (
            <BookmarkIcon data-icon="inline-start" />
          )}
          {isSaved ? t("practice.questionActions.unsave") : t("practice.questionActions.save")}
        </Button>
        <Button
          aria-pressed={isMarkedWeak}
          disabled={isWeakPending}
          onClick={() => void setWeak()}
          type="button"
          variant="outline"
        >
          {isWeakPending ? (
            <Spinner aria-hidden="true" data-icon="inline-start" />
          ) : (
            <BrainIcon data-icon="inline-start" />
          )}
          {isMarkedWeak
            ? t("practice.questionActions.unmarkWeak")
            : t("practice.questionActions.markWeak")}
        </Button>
        <AlertDialog onOpenChange={setSkipOpen} open={skipOpen}>
          <AlertDialogTrigger
            render={
              <Button disabled={isSkipPending} type="button" variant="outline">
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
              <AlertDialogCancel disabled={isSkipPending}>
                {t("practice.dialog.cancel")}
              </AlertDialogCancel>
              <AlertDialogAction disabled={isSkipPending} onClick={() => void skip()}>
                {isSkipPending ? <Spinner aria-hidden="true" data-icon="inline-start" /> : null}
                {t("practice.dialog.confirmSkip")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <AlertDialog onOpenChange={setEndOpen} open={endOpen}>
          <AlertDialogTrigger
            render={
              <Button disabled={isEndPending} type="button" variant="ghost">
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
              <ActionErrorAlert description={t("practice.errors.endDescription")} />
            ) : null}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isEndPending}>
                {t("practice.dialog.cancel")}
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={isEndPending}
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
      {actionError === "saved" || actionError === "weak" ? (
        <ActionErrorAlert
          description={t(
            actionError === "saved"
              ? "practice.errors.savedDescription"
              : "practice.errors.weakDescription",
          )}
        />
      ) : null}
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
