import { FileTextIcon, UploadIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Attachment,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { JobProfile, ResumeProcessingStatus } from "@/models/profile"

import { ResumeImportForm } from "./ProfileImportPanels"
import { ResumeProcessingBadge } from "./ProfileStatusBadge"
import { formatDate, formatFileSize } from "./profile-formatters"

export type ResumeDialogMode = "details" | "import"

type ProfileResumeDialogProps = {
  importError: string | null
  isSubmitting: boolean
  mode: ResumeDialogMode
  onModeChange: (mode: ResumeDialogMode) => void
  onOpenChange: (open: boolean) => void
  onSubmit: (input: { file?: File; text?: string }) => Promise<void>
  open: boolean
  profile: JobProfile
}

function attachmentState(status: ResumeProcessingStatus) {
  if (status === "failed") {
    return "error" as const
  }

  if (status === "parsing") {
    return "processing" as const
  }

  if (status === "uploaded") {
    return "idle" as const
  }

  return "done" as const
}

export function ProfileResumeDialog({
  importError,
  isSubmitting,
  mode,
  onModeChange,
  onOpenChange,
  onSubmit,
  open,
  profile,
}: ProfileResumeDialogProps) {
  const { i18n, t } = useTranslation()
  const resume = profile.resume
  const isImportForm = mode === "import" || !resume

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="min-w-0 max-h-[calc(100dvh-2rem)] overflow-x-hidden overflow-y-auto sm:max-w-2xl">
        <DialogHeader className="min-w-0">
          <DialogTitle className="text-xl font-semibold">
            {isImportForm
              ? resume
                ? t("profile.actions.updateResume")
                : t("profile.actions.uploadResume")
              : t("profile.resume.title")}
          </DialogTitle>
          <DialogDescription>
            {isImportForm ? t("profile.import.description") : t("profile.resume.description")}
          </DialogDescription>
        </DialogHeader>

        {isImportForm ? (
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
        ) : (
          <div className="flex min-w-0 flex-col gap-5">
            <Attachment className="w-full" state={attachmentState(resume.processingStatus)}>
              <AttachmentMedia>
                <FileTextIcon />
              </AttachmentMedia>
              <AttachmentContent>
                <AttachmentTitle>{resume.fileName}</AttachmentTitle>
                <AttachmentDescription>
                  {t("profile.resume.typeAndSize", {
                    size: formatFileSize(resume.fileSize, i18n.language),
                    type: resume.mimeType,
                  })}
                </AttachmentDescription>
              </AttachmentContent>
              <ResumeProcessingBadge status={resume.processingStatus} />
            </Attachment>

            <dl className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
              <div>
                <dt className="sr-only">{t("profile.resume.uploadedAt", { value: "" })}</dt>
                <dd>
                  {t("profile.resume.uploadedAt", {
                    value: formatDate(resume.uploadedAt, i18n.language),
                  })}
                </dd>
              </div>
            </dl>

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => onModeChange("import")} size="sm" variant="outline">
                <UploadIcon data-icon="inline-start" />
                {t("profile.actions.updateResume")}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
