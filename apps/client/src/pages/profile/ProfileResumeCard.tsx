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
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type {
  JobProfile,
  ResumeProcessingStatus,
  ResumeRecognition,
  ResumeUpdate,
} from "@/models/profile"

import { ResumeProcessingBadge } from "./ProfileStatusBadge"
import { formatDate, formatFileSize } from "./profile-formatters"

type ProfileResumeCardProps = {
  profile: JobProfile
  recognition: ResumeRecognition | null
  resumeUpdate: ResumeUpdate | null
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

export function ProfileResumeCard({ profile, recognition, resumeUpdate }: ProfileResumeCardProps) {
  const { i18n, t } = useTranslation()
  const resume = profile.resume
  const pendingReviewCount = recognition?.pendingReviewCount ?? profile.pendingReviewCount

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("profile.resume.title")}</CardTitle>
        <CardDescription>{t("profile.resume.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {resume ? (
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
        ) : (
          <p className="text-sm text-muted-foreground">{t("profile.resume.noResume")}</p>
        )}

        {resume && (
          <dl className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
            <div>
              <dt className="sr-only">{t("profile.resume.uploadedAt", { value: "" })}</dt>
              <dd>
                {t("profile.resume.uploadedAt", {
                  value: formatDate(resume.uploadedAt, i18n.language),
                })}
              </dd>
            </div>
            {resume.parsedAt && (
              <div>
                <dt className="sr-only">{t("profile.resume.parsedAt", { value: "" })}</dt>
                <dd>
                  {t("profile.resume.parsedAt", {
                    value: formatDate(resume.parsedAt, i18n.language),
                  })}
                </dd>
              </div>
            )}
          </dl>
        )}

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
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        <Button disabled size="sm" variant="outline">
          <UploadIcon data-icon="inline-start" />
          {t("profile.actions.replaceResume")}
        </Button>
        <Button disabled size="sm" variant="outline">
          <RotateCcwIcon data-icon="inline-start" />
          {t("profile.actions.recognizeAgain")}
        </Button>
      </CardFooter>
    </Card>
  )
}
