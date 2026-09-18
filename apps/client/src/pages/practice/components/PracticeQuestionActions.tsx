import { SkipForwardIcon } from "lucide-react"
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

type PracticeQuestionActionsProps = {
  interactionLocked: boolean
  isSkipPending: boolean
  onSkip: () => Promise<PracticeInteractionResult>
}

type ActionError = "skip" | null

export function PracticeQuestionActions({
  interactionLocked,
  isSkipPending,
  onSkip,
}: PracticeQuestionActionsProps) {
  const { t } = useTranslation()
  const [actionError, setActionError] = useState<ActionError>(null)
  const [skipOpen, setSkipOpen] = useState(false)

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

  return (
    <PracticeBottomActionBar
      actionsTestId="practice-question-actions"
      ariaLabel={t("practice.questionActions.title")}
      testId="practice-question-actions-bar"
    >
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
    </PracticeBottomActionBar>
  )
}
