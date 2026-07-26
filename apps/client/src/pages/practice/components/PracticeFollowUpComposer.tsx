import { useForm } from "@tanstack/react-form"
import { SendIcon } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { z } from "zod"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"

import type { PracticeInteractionResult } from "../practice-interaction"

const followUpAnswerSchema = z.object({ content: z.string().trim().min(1) })

type PracticeFollowUpComposerProps = {
  interactionLocked: boolean
  isEndPending: boolean
  isPending: boolean
  onDraftChange: (isDirty: boolean) => void
  onEnd: () => Promise<PracticeInteractionResult>
  onSubmit: (content: string) => Promise<PracticeInteractionResult>
}

export function PracticeFollowUpComposer({
  interactionLocked,
  isEndPending,
  isPending,
  onDraftChange,
  onEnd,
  onSubmit,
}: PracticeFollowUpComposerProps) {
  const { t } = useTranslation()
  const [submitError, setSubmitError] = useState(false)
  const [endError, setEndError] = useState(false)
  const [endDialogOpen, setEndDialogOpen] = useState(false)
  const form = useForm({
    defaultValues: { content: "" },
    validators: { onSubmit: followUpAnswerSchema },
    onSubmit: async ({ value }) => {
      if (interactionLocked) return
      setSubmitError(false)
      try {
        const result = await onSubmit(value.content.trim())
        if (result === "executed") {
          form.reset()
          onDraftChange(false)
        }
      } catch {
        setSubmitError(true)
      }
    },
  })

  async function endFollowUps() {
    if (interactionLocked) return
    setEndError(false)
    try {
      const result = await onEnd()
      if (result === "executed") {
        onDraftChange(false)
        setEndDialogOpen(false)
      }
    } catch {
      setEndError(true)
    }
  }

  return (
    <Card data-testid="practice-follow-up-composer">
      <CardHeader>
        <CardTitle>{t("practice.followUp.composerTitle")}</CardTitle>
        <CardDescription>
          {isPending
            ? t("practice.followUp.processingDescription")
            : t("practice.followUp.composerDescription")}
        </CardDescription>
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
                <FieldLabel className="sr-only" htmlFor={`follow-up-${field.name}`}>
                  {t("practice.followUp.answerLabel")}
                </FieldLabel>
                <Textarea
                  aria-invalid={submitError}
                  className="min-h-36 resize-y"
                  disabled={isPending || isEndPending}
                  id={`follow-up-${field.name}`}
                  onBlur={field.handleBlur}
                  onChange={(event) => {
                    field.handleChange(event.target.value)
                    onDraftChange(event.target.value.length > 0)
                    if (submitError) setSubmitError(false)
                  }}
                  placeholder={t("practice.followUp.answerPlaceholder")}
                  value={field.state.value}
                />
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <FieldDescription aria-live="polite">
                    {isPending
                      ? t("practice.followUp.processing")
                      : t("practice.answer.characterCount", { count: field.state.value.length })}
                  </FieldDescription>
                  <div className="flex flex-wrap gap-2">
                    <AlertDialog onOpenChange={setEndDialogOpen} open={endDialogOpen}>
                      <AlertDialogTrigger
                        render={
                          <Button
                            disabled={interactionLocked || isPending || isEndPending}
                            type="button"
                            variant="outline"
                          />
                        }
                      >
                        {t("practice.followUp.endAnswering")}
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            {t("practice.followUp.endDialogTitle")}
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            {t("practice.followUp.endDialogDescription")}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        {endError ? (
                          <Alert role="alert" variant="destructive">
                            <AlertTitle>{t("practice.errors.actionTitle")}</AlertTitle>
                            <AlertDescription>
                              {t("practice.errors.endFollowUpDescription")}
                            </AlertDescription>
                          </Alert>
                        ) : null}
                        <AlertDialogFooter>
                          <AlertDialogCancel
                            disabled={interactionLocked || isPending || isEndPending}
                          >
                            {t("practice.dialog.cancel")}
                          </AlertDialogCancel>
                          <AlertDialogAction
                            disabled={interactionLocked || isPending || isEndPending}
                            onClick={(event) => {
                              event.preventDefault()
                              void endFollowUps()
                            }}
                            variant="destructive"
                          >
                            {isEndPending ? (
                              <Spinner aria-hidden="true" data-icon="inline-start" />
                            ) : null}
                            {isEndPending
                              ? t("practice.followUp.ending")
                              : t("practice.followUp.confirmEnd")}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                    <Button
                      disabled={
                        interactionLocked ||
                        isPending ||
                        isEndPending ||
                        field.state.value.trim().length === 0
                      }
                      type="submit"
                    >
                      {isPending ? (
                        <Spinner aria-hidden="true" data-icon="inline-start" />
                      ) : (
                        <SendIcon data-icon="inline-start" />
                      )}
                      {isPending
                        ? t("practice.followUp.submitting")
                        : t("practice.followUp.submit")}
                    </Button>
                  </div>
                </div>
                {submitError ? (
                  <Alert role="alert" variant="destructive">
                    <AlertTitle>{t("practice.errors.followUpSubmitTitle")}</AlertTitle>
                    <AlertDescription>
                      {t("practice.errors.followUpSubmitDescription")}
                    </AlertDescription>
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
