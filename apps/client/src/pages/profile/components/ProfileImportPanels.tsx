import { AlertCircleIcon, FileTextIcon, LoaderCircleIcon, UploadIcon } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { ResumeUpdate } from "@/models/profile"

export function ResumeImportForm({
  isSubmitting,
  onSubmit,
  title,
}: {
  isSubmitting: boolean
  onSubmit: (input: { file?: File; text?: string }) => Promise<void>
  title: string
}) {
  const { t } = useTranslation()
  const [file, setFile] = useState<File | undefined>()
  const [text, setText] = useState("")
  const [errorVisible, setErrorVisible] = useState(false)

  return (
    <Card data-testid="profile-resume-import-form">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{t("profile.import.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium" htmlFor="profile-resume-file">
            {t("profile.import.file")}
          </label>
          <Input
            accept=".pdf,.doc,.docx,.txt"
            id="profile-resume-file"
            onChange={(event) => {
              setFile(event.target.files?.[0])
              setErrorVisible(false)
            }}
            type="file"
          />
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium" htmlFor="profile-resume-text">
            {t("profile.import.text")}
          </label>
          <Textarea
            id="profile-resume-text"
            onChange={(event) => {
              setText(event.target.value)
              setErrorVisible(false)
            }}
            placeholder={t("profile.import.textPlaceholder")}
            value={text}
          />
        </div>
        {errorVisible && (
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertDescription>{t("profile.import.required")}</AlertDescription>
          </Alert>
        )}
      </CardContent>
      <CardFooter>
        <Button
          disabled={isSubmitting}
          onClick={() => {
            if (!file && !text.trim()) {
              setErrorVisible(true)
              return
            }

            void onSubmit({ file, text })
          }}
        >
          {isSubmitting ? (
            <LoaderCircleIcon data-icon="inline-start" />
          ) : (
            <UploadIcon data-icon="inline-start" />
          )}
          {isSubmitting ? t("profile.import.submitting") : t("profile.import.submit")}
        </Button>
      </CardFooter>
    </Card>
  )
}

export function ResumeUpdateReview({
  isApplying,
  isCancelling,
  onApply,
  onCancel,
  resumeUpdate,
}: {
  isApplying: boolean
  isCancelling: boolean
  onApply: () => void
  onCancel: () => void
  resumeUpdate: ResumeUpdate
}) {
  const { t } = useTranslation()
  const summary = resumeUpdate.changeSummary

  return (
    <Card data-testid="profile-resume-update-review">
      <CardHeader>
        <CardTitle>{t("profile.import.updateTitle")}</CardTitle>
        <CardDescription>{t("profile.import.updateDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {resumeUpdate.status === "parsing" || resumeUpdate.status === "uploading" ? (
          <Alert>
            <LoaderCircleIcon />
            <AlertDescription>{t("profile.import.processing")}</AlertDescription>
          </Alert>
        ) : resumeUpdate.status === "failed" ? (
          <Alert variant="destructive">
            <AlertCircleIcon />
            <AlertDescription>
              {resumeUpdate.failureReason ?? t("profile.import.failed")}
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <Alert>
              <FileTextIcon />
              <AlertDescription>{t("profile.import.manualChangesProtected")}</AlertDescription>
            </Alert>
            {summary && (
              <dl className="grid gap-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-muted-foreground">{t("profile.import.newItems")}</dt>
                  <dd className="text-lg font-medium">{summary.newItems}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("profile.import.changedItems")}</dt>
                  <dd className="text-lg font-medium">{summary.changedItems}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("profile.import.missingItems")}</dt>
                  <dd className="text-lg font-medium">{summary.missingItems}</dd>
                </div>
              </dl>
            )}
          </>
        )}
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        <Button
          disabled={isApplying || isCancelling || resumeUpdate.status !== "awaitingConfirmation"}
          onClick={onApply}
        >
          {isApplying ? t("profile.import.applying") : t("profile.import.apply")}
        </Button>
        <Button disabled={isApplying || isCancelling} onClick={onCancel} variant="outline">
          {isCancelling ? t("profile.import.cancelling") : t("profile.import.cancel")}
        </Button>
      </CardFooter>
    </Card>
  )
}
