import { LogOutIcon } from "lucide-react"
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
import { PracticeActionErrorAlert } from "./PracticeBottomActionBar"

export function PracticeAbandonAction({
  interactionLocked,
  isPending,
  onAbandon,
}: {
  interactionLocked: boolean
  isPending: boolean
  onAbandon: () => Promise<PracticeInteractionResult>
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [hasError, setHasError] = useState(false)

  async function abandon() {
    if (interactionLocked) return
    setHasError(false)
    try {
      const result = await onAbandon()
      if (result === "executed") setOpen(false)
    } catch {
      setHasError(true)
    }
  }

  return (
    <AlertDialog
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen) setHasError(false)
      }}
      open={open}
    >
      <AlertDialogTrigger
        render={
          <Button
            className="w-full sm:w-auto"
            disabled={interactionLocked}
            type="button"
            variant="outline"
          />
        }
      >
        <LogOutIcon aria-hidden="true" data-icon="inline-start" />
        {t("practice.abandon.action")}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("practice.abandon.confirmTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("practice.abandon.confirmDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {hasError ? (
          <PracticeActionErrorAlert description={t("practice.errors.abandonDescription")} />
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={interactionLocked}>
            {t("practice.abandon.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={interactionLocked}
            onClick={(event) => {
              event.preventDefault()
              void abandon()
            }}
            variant="destructive"
          >
            {isPending ? <Spinner aria-hidden="true" data-icon="inline-start" /> : null}
            {t("practice.abandon.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
