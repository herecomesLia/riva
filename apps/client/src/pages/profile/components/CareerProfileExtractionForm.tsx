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
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { CareerProfileTextExtractionRequest } from "@/api/generated/models"

export function CareerProfileExtractionForm({
  embedded = false,
  isSubmitting,
  onSubmit,
  title,
}: {
  embedded?: boolean
  isSubmitting: boolean
  onSubmit: (input: CareerProfileTextExtractionRequest) => Promise<void>
  title: string
}) {
  const { t } = useTranslation()
  const [fileName, setFileName] = useState<string>()
  const [text, setText] = useState("")
  const [errorVisible, setErrorVisible] = useState(false)

  const fields = (
    <>
      <Field>
        <FieldLabel htmlFor="profile-resume-file">{t("profile.import.file")}</FieldLabel>
        <label
          className="flex w-full min-w-0 max-w-full min-h-10 cursor-pointer items-center gap-3 rounded-md border bg-background px-3 text-sm transition-colors hover:bg-accent/50 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
          htmlFor="profile-resume-file"
        >
          <Input
            accept=".pdf,.doc,.docx,.txt"
            aria-label={t("profile.import.file")}
            aria-describedby="profile-resume-file-description"
            className="sr-only"
            disabled={isSubmitting}
            id="profile-resume-file"
            onChange={(event) => setFileName(event.target.files?.[0]?.name)}
            type="file"
          />
          <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 truncate text-muted-foreground">
            {fileName ?? t("profile.import.noFileSelected")}
          </span>
        </label>
        <FieldDescription id="profile-resume-file-description">
          {t("profile.import.fileNotSupported")}
        </FieldDescription>
      </Field>
      <Field data-invalid={errorVisible}>
        <FieldLabel htmlFor="profile-resume-text">{t("profile.import.text")}</FieldLabel>
        <Textarea
          disabled={isSubmitting}
          aria-invalid={errorVisible}
          className="min-w-0 max-w-full"
          id="profile-resume-text"
          onChange={(event) => {
            setText(event.target.value)
            setErrorVisible(false)
          }}
          placeholder={t("profile.import.textPlaceholder")}
          value={text}
        />
      </Field>
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
        if (!text.trim()) {
          setErrorVisible(true)
          return
        }

        void onSubmit({ text })
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
      <div className="flex flex-col gap-5" data-testid="career-profile-extraction-form">
        {fields}
        <div>{submit}</div>
      </div>
    )
  }

  return (
    <Card data-testid="career-profile-extraction-form">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{t("profile.import.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">{fields}</CardContent>
      <CardFooter>{submit}</CardFooter>
    </Card>
  )
}
