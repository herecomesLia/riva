import { FileTextIcon, RotateCcwIcon, UploadIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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
import type {
  JobProfile,
  ResumeProcessingStatus,
  ResumeRecognition,
  ResumeUpdate,
} from "@/models/profile"

import { ResumeImportForm, ResumeUpdateReview } from "./ProfileImportPanels"
import { ResumeProcessingBadge } from "./ProfileStatusBadge"
import { formatDate, formatFileSize } from "./profile-formatters"

export type ResumeDialogMode = "details" | "import"

type ProfileResumeDialogProps = {
  importError: string | null
  isApplying: boolean
  isCancelling: boolean
  isSubmitting: boolean
  mode: ResumeDialogMode
  onApplyUpdate: () => void
  onCancelUpdate: () => void
  onModeChange: (mode: ResumeDialogMode) => void
  onOpenChange: (open: boolean) => void
  onSubmit: (input: { file?: File; text?: string }) => Promise<void>
  open: boolean
  profile: JobProfile
  recognition: ResumeRecognition | null
  resumeUpdate: ResumeUpdate | null
  updateError: string | null
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
  isApplying,
  isCancelling,
  isSubmitting,
  mode,
  onApplyUpdate,
  onCancelUpdate,
  onModeChange,
  onOpenChange,
  onSubmit,
  open,
  profile,
  recognition,
  resumeUpdate,
  updateError,
}: ProfileResumeDialogProps) {
  const { i18n, t } = useTranslation()
  const resume = profile.resume
  const isImportForm = mode === "import" || !resume
  const pendingReviewCount = recognition?.pendingReviewCount ?? profile.pendingReviewCount

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

            {pendingReviewCount > 0 && (
              <p className="text-sm text-muted-foreground">
                {t("profile.resume.pendingReview", { count: pendingReviewCount })}
              </p>
            )}

            {resumeUpdate && (
              <Alert>
                <FileTextIcon />
                <AlertTitle>{t("profile.resume.updatePendingTitle")}</AlertTitle>
                <AlertDescription>{t("profile.resume.updatePendingDescription")}</AlertDescription>
              </Alert>
            )}

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => onModeChange("import")} size="sm" variant="outline">
                <UploadIcon data-icon="inline-start" />
                {t("profile.actions.updateResume")}
              </Button>
              <Button disabled size="sm" variant="outline">
                <RotateCcwIcon data-icon="inline-start" />
                {t("profile.actions.recognizeAgain")}
              </Button>
            </div>

            {resumeUpdate && (
              <div className="border-t pt-5">
                <ResumeUpdateReview
                  embedded
                  isApplying={isApplying}
                  isCancelling={isCancelling}
                  onApply={onApplyUpdate}
                  onCancel={onCancelUpdate}
                  resumeUpdate={resumeUpdate}
                />
                {updateError && (
                  <Alert className="mt-4" variant="destructive">
                    <AlertDescription>{updateError}</AlertDescription>
                  </Alert>
                )}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
