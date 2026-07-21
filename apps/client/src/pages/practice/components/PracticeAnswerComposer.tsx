import { useForm } from "@tanstack/react-form"
import { SendIcon } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { z } from "zod"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"

const answerSchema = z.object({ content: z.string().trim().min(1) })

type PracticeAnswerComposerProps = {
  interactionLocked: boolean
  isPending: boolean
  onDraftChange: (isDirty: boolean) => void
  onSubmit: (content: string) => Promise<void>
}

export function PracticeAnswerComposer({
  interactionLocked,
  isPending,
  onDraftChange,
  onSubmit,
}: PracticeAnswerComposerProps) {
  const { t } = useTranslation()
  const [submitError, setSubmitError] = useState(false)
  const form = useForm({
    defaultValues: { content: "" },
    validators: { onSubmit: answerSchema },
    onSubmit: async ({ value }) => {
      if (interactionLocked) return
      setSubmitError(false)
      try {
        await onSubmit(value.content.trim())
        form.reset()
        onDraftChange(false)
      } catch {
        setSubmitError(true)
      }
    },
  })

  return (
    <Card data-testid="practice-answer-composer">
      <CardHeader>
        <CardTitle>{t("practice.answer.title")}</CardTitle>
        <CardDescription>{t("practice.answer.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            void form.handleSubmit()
          }}
        >
          <form.Field name="content">
            {(field) => (
              <Field data-invalid={submitError}>
                <FieldLabel className="sr-only" htmlFor={field.name}>
                  {t("practice.answer.label")}
                </FieldLabel>
                <Textarea
                  aria-invalid={submitError}
                  className="min-h-48 resize-y"
                  disabled={isPending}
                  id={field.name}
                  onBlur={field.handleBlur}
                  onChange={(event) => {
                    field.handleChange(event.target.value)
                    onDraftChange(event.target.value.length > 0)
                    if (submitError) setSubmitError(false)
                  }}
                  placeholder={t("practice.answer.placeholder")}
                  value={field.state.value}
                />
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <FieldDescription aria-live="polite">
                    {t("practice.answer.characterCount", { count: field.state.value.length })}
                  </FieldDescription>
                  <Button
                    disabled={interactionLocked || field.state.value.trim().length === 0}
                    type="submit"
                  >
                    {isPending ? (
                      <Spinner aria-hidden="true" data-icon="inline-start" />
                    ) : (
                      <SendIcon data-icon="inline-start" />
                    )}
                    {isPending ? t("practice.answer.submitting") : t("practice.answer.submit")}
                  </Button>
                </div>
                {submitError ? (
                  <Alert role="alert" variant="destructive">
                    <AlertTitle>{t("practice.errors.submitTitle")}</AlertTitle>
                    <AlertDescription>{t("practice.errors.submitDescription")}</AlertDescription>
                  </Alert>
                ) : null}
              </Field>
            )}
          </form.Field>
        </form>
      </CardContent>
    </Card>
  )
}
