import { useTranslation } from "react-i18next"

import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { ResumeImportInput } from "@/models/resume"

import { ResumeImportForm } from "./ProfileImportPanels"

type ProfileResumeDialogProps = {
  hasProfile: boolean
  importError: string | null
  isSubmitting: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (input: ResumeImportInput) => Promise<void>
  open: boolean
}

export function ProfileResumeDialog({
  hasProfile,
  importError,
  isSubmitting,
  onOpenChange,
  onSubmit,
  open,
}: ProfileResumeDialogProps) {
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
          <ResumeImportForm
            embedded
            isSubmitting={isSubmitting}
            onSubmit={onSubmit}
            title={t("profile.import.title")}
          />
          {importError && (
            <Alert variant="destructive">
              <AlertDescription>{importError}</AlertDescription>
            </Alert>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
