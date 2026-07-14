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
  embedded = false,
  isSubmitting,
  onSubmit,
  title,
}: {
  embedded?: boolean
  isSubmitting: boolean
  onSubmit: (input: { file?: File; text?: string }) => Promise<void>
  title: string
}) {
  const { t } = useTranslation()
  const [file, setFile] = useState<File | undefined>()
  const [text, setText] = useState("")
  const [errorVisible, setErrorVisible] = useState(false)

  const fields = (
    <>
      <div className="flex min-w-0 flex-col gap-2">
        <p className="text-sm font-medium">{t("profile.import.file")}</p>
        <label
          className="flex w-full min-w-0 max-w-full min-h-10 cursor-pointer items-center gap-3 rounded-md border bg-background px-3 text-sm transition-colors hover:bg-accent/50 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
          htmlFor="profile-resume-file"
        >
          <Input
            accept=".pdf,.doc,.docx,.txt"
            aria-label={t("profile.import.file")}
            className="sr-only"
            id="profile-resume-file"
            onChange={(event) => {
              setFile(event.target.files?.[0])
              setErrorVisible(false)
            }}
            type="file"
          />
          <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 truncate text-muted-foreground">
            {file?.name ?? t("profile.import.noFileSelected")}
          </span>
        </label>
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <label className="text-sm font-medium" htmlFor="profile-resume-text">
          {t("profile.import.text")}
        </label>
        <Textarea
          className="min-w-0 max-w-full"
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
    </>
  )

  const submit = (
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
  )

  if (embedded) {
    return (
      <div className="flex flex-col gap-5" data-testid="profile-resume-import-form">
        {fields}
        <div>{submit}</div>
      </div>
    )
  }

  return (
    <Card data-testid="profile-resume-import-form">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{t("profile.import.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">{fields}</CardContent>
      <CardFooter>{submit}</CardFooter>
    </Card>
  )
}

export function ResumeUpdateReview({
  embedded = false,
  isApplying,
  isCancelling,
  onApply,
  onCancel,
  resumeUpdate,
}: {
  embedded?: boolean
  isApplying: boolean
  isCancelling: boolean
  onApply: () => void
  onCancel: () => void
  resumeUpdate: ResumeUpdate
}) {
  const { t } = useTranslation()
  const summary = resumeUpdate.changeSummary

  const content =
    resumeUpdate.status === "parsing" || resumeUpdate.status === "uploading" ? (
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
    )

  const actions = (
    <>
      <Button
        disabled={isApplying || isCancelling || resumeUpdate.status !== "awaitingConfirmation"}
        onClick={onApply}
      >
        {isApplying ? t("profile.import.applying") : t("profile.import.apply")}
      </Button>
      <Button disabled={isApplying || isCancelling} onClick={onCancel} variant="outline">
        {isCancelling ? t("profile.import.cancelling") : t("profile.import.cancel")}
      </Button>
    </>
  )

  if (embedded) {
    return (
      <section className="flex flex-col gap-4" data-testid="profile-resume-update-review">
        <div className="flex flex-col gap-1">
          <h3 className="font-medium">{t("profile.import.updateTitle")}</h3>
          <p className="text-sm text-muted-foreground">{t("profile.import.updateDescription")}</p>
        </div>
        {content}
        <div className="flex flex-wrap gap-2">{actions}</div>
      </section>
    )
  }

  return (
    <Card data-testid="profile-resume-update-review">
      <CardHeader>
        <CardTitle>{t("profile.import.updateTitle")}</CardTitle>
        <CardDescription>{t("profile.import.updateDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{content}</CardContent>
      <CardFooter className="flex flex-wrap gap-2">{actions}</CardFooter>
    </Card>
  )
}
