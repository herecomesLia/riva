import { useTranslation } from "react-i18next"

import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { CareerProfileTextExtractionRequest } from "@/api/generated/models"

import { CareerProfileExtractionForm } from "./CareerProfileExtractionForm"

type CareerProfileExtractionDialogProps = {
  hasProfile: boolean
  actionError: string | null
  isSubmitting: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (input: CareerProfileTextExtractionRequest) => Promise<void>
  open: boolean
}

export function CareerProfileExtractionDialog({
  hasProfile,
  actionError,
  isSubmitting,
  onOpenChange,
  onSubmit,
  open,
}: CareerProfileExtractionDialogProps) {
  const { t } = useTranslation()

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="min-w-0 max-h-[calc(100dvh-2rem)] overflow-x-hidden overflow-y-auto sm:max-w-2xl">
        <DialogHeader className="min-w-0">
          <DialogTitle className="text-xl font-semibold">
            {hasProfile ? t("profile.actions.updateResume") : t("profile.actions.uploadResume")}
          </DialogTitle>
          <DialogDescription>{t("profile.import.description")}</DialogDescription>
        </DialogHeader>
        <div className="flex min-w-0 flex-col gap-4">
          <CareerProfileExtractionForm
            embedded
            isSubmitting={isSubmitting}
            onSubmit={onSubmit}
            title={t("profile.import.title")}
          />
          {actionError && (
            <Alert variant="destructive">
              <AlertDescription>{actionError}</AlertDescription>
            </Alert>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
