import { SendIcon } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"

type InterviewAnswerComposerProps = {
  isPending: boolean
  onSubmit: (content: string) => Promise<void>
}

export function InterviewAnswerComposer({ isPending, onSubmit }: InterviewAnswerComposerProps) {
  const { t } = useTranslation()
  const [content, setContent] = useState("")
  const [error, setError] = useState<"required" | "submit" | null>(null)

  async function submit() {
    const normalized = content.trim()
    if (!normalized) {
      setError("required")
      return
    }

    setError(null)
    try {
      await onSubmit(normalized)
      setContent("")
    } catch {
      setError("submit")
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("interview.session.answer.title")}</CardTitle>
        <CardDescription>{t("interview.session.answer.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            if (!isPending) void submit()
          }}
        >
          <Field invalid={error !== null}>
            <FieldLabel className="sr-only" htmlFor="interview-answer">
              {t("interview.session.answer.label")}
            </FieldLabel>
            <Textarea
              aria-describedby="interview-answer-hint"
              aria-invalid={error !== null}
              className="min-h-52 resize-y leading-7"
              disabled={isPending}
              id="interview-answer"
              onChange={(event) => {
                setContent(event.target.value)
                if (error !== null) setError(null)
              }}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  (event.ctrlKey || event.metaKey) &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault()
                  event.currentTarget.form?.requestSubmit()
                }
              }}
              placeholder={t("interview.session.answer.placeholder")}
              value={content}
            />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <FieldDescription id="interview-answer-hint">
                {t("interview.session.answer.keyboardHint")}
              </FieldDescription>
              <Button disabled={isPending || content.trim().length === 0} type="submit">
                {isPending ? (
                  <Spinner aria-hidden="true" data-icon="inline-start" />
                ) : (
                  <SendIcon aria-hidden="true" data-icon="inline-start" />
                )}
                {isPending
                  ? t("interview.session.answer.submitting")
                  : t("interview.session.answer.submit")}
              </Button>
            </div>
            {error !== null ? (
              <Alert role="alert" variant="destructive">
                <AlertTitle>
                  {error === "required"
                    ? t("interview.session.answer.requiredTitle")
                    : t("interview.session.errors.submitTitle")}
                </AlertTitle>
                <AlertDescription>
                  {error === "required"
                    ? t("interview.session.answer.requiredDescription")
                    : t("interview.session.errors.submitDescription")}
                </AlertDescription>
              </Alert>
            ) : null}
          </Field>
        </form>
      </CardContent>
    </Card>
  )
}
