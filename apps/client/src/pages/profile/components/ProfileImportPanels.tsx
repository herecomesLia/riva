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
import type { ResumeImportInput } from "@/mocks/models/profile"

export function ResumeImportForm({
  embedded = false,
  isSubmitting,
  onSubmit,
  title,
}: {
  embedded?: boolean
  isSubmitting: boolean
  onSubmit: (input: ResumeImportInput) => Promise<void>
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
