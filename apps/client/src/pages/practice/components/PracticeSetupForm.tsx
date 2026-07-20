import { useForm } from "@tanstack/react-form"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { z } from "zod"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type {
  ActivePracticeSelection,
  PracticeDifficulty,
  PracticeQuestionSource,
  PracticeQuestionType,
  PracticeSetupContext,
} from "@/models/practice"
import { AlertCircleIcon } from "lucide-react"

const setupSchema = z.object({
  targetRoleId: z.string().min(1),
  questionType: z.enum([
    "projectDeepDive",
    "behavioral",
    "businessUnderstanding",
    "motivation",
    "technicalFoundation",
  ]),
  difficulty: z.enum(["basic", "pressure"]),
  source: z.enum(["personalized", "saved", "history"]),
  prioritizeWeaknesses: z.boolean(),
})

const questionTypes: PracticeQuestionType[] = [
  "projectDeepDive",
  "behavioral",
  "businessUnderstanding",
  "motivation",
  "technicalFoundation",
]
const difficulties: PracticeDifficulty[] = ["basic", "pressure"]
const sources: PracticeQuestionSource[] = ["personalized", "saved", "history"]

type PracticeSetupFormProps = {
  context: PracticeSetupContext
  initialSelection: ActivePracticeSelection
  isPending: boolean
  onStart: (input: ActivePracticeSelection) => Promise<void>
}

export function PracticeSetupForm({
  context,
  initialSelection,
  isPending,
  onStart,
}: PracticeSetupFormProps) {
  const { t } = useTranslation()
  const [submitError, setSubmitError] = useState(false)
  const form = useForm({
    defaultValues: initialSelection,
    validators: { onSubmit: setupSchema },
    onSubmit: async ({ value }) => {
      setSubmitError(false)
      try {
        await onStart(value)
      } catch {
        setSubmitError(true)
      }
    },
  })

  return (
    <form
      className="flex flex-col gap-7"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <FieldGroup>
        <form.Field name="targetRoleId">
          {(field) => {
            const selectedRole = context.targetRoles.find((role) => role.id === field.state.value)
            const selectedRoleLabel = selectedRole?.company
              ? `${selectedRole.title} · ${selectedRole.company}`
              : selectedRole?.title

            return (
              <Field>
                <FieldLabel htmlFor={field.name}>
                  {t("practice.setup.fields.targetRole")}
                </FieldLabel>
                <Select
                  onValueChange={(value) => {
                    if (!value) return
                    field.handleChange(value)
                    const selectedRole = context.targetRoles.find((role) => role.id === value)
                    const currentQuestionType = form.getFieldValue("questionType")
                    if (
                      selectedRole &&
                      !selectedRole.supportedQuestionTypes.includes(currentQuestionType)
                    ) {
                      const firstSupportedType = selectedRole.supportedQuestionTypes[0]
                      if (firstSupportedType) form.setFieldValue("questionType", firstSupportedType)
                    }
                  }}
                  value={field.state.value}
                >
                  <SelectTrigger
                    className="w-full"
                    data-testid="practice-target-role-trigger"
                    id={field.name}
                    onBlur={field.handleBlur}
                  >
                    <SelectValue>{selectedRoleLabel}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {context.targetRoles.map((role) => (
                        <SelectItem key={role.id} value={role.id}>
                          {role.company ? `${role.title} · ${role.company}` : role.title}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            )
          }}
        </form.Field>

        <form.Subscribe selector={(state) => state.values.targetRoleId}>
          {(targetRoleId) => {
            const selectedRole = context.targetRoles.find((role) => role.id === targetRoleId)
            const supportedQuestionTypes = selectedRole?.supportedQuestionTypes ?? []

            return (
              <form.Field name="questionType">
                {(field) => (
                  <FieldSet>
                    <FieldLegend>{t("practice.setup.fields.questionType")}</FieldLegend>
                    <ToggleGroup
                      aria-label={t("practice.setup.fields.questionType")}
                      className="flex w-full flex-wrap justify-start"
                      onValueChange={(values) => {
                        const value = values[0]
                        if (value) field.handleChange(value as PracticeQuestionType)
                      }}
                      spacing={2}
                      value={[field.state.value]}
                      variant="outline"
                    >
                      {questionTypes
                        .filter((type) => supportedQuestionTypes.includes(type))
                        .map((type) => (
                          <ToggleGroupItem key={type} value={type}>
                            {t(`practice.questionTypes.${type}`)}
                          </ToggleGroupItem>
                        ))}
                    </ToggleGroup>
                  </FieldSet>
                )}
              </form.Field>
            )
          }}
        </form.Subscribe>

        <div className="grid gap-7 md:grid-cols-2">
          <form.Field name="difficulty">
            {(field) => (
              <FieldSet>
                <FieldLegend>{t("practice.setup.fields.difficulty")}</FieldLegend>
                <ToggleGroup
                  aria-label={t("practice.setup.fields.difficulty")}
                  className="flex w-full justify-start"
                  onValueChange={(values) => {
                    const value = values[0]
                    if (value) field.handleChange(value as PracticeDifficulty)
                  }}
                  spacing={2}
                  value={[field.state.value]}
                  variant="outline"
                >
                  {difficulties.map((difficulty) => (
                    <ToggleGroupItem key={difficulty} value={difficulty}>
                      {t(`practice.difficulty.${difficulty}`)}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </FieldSet>
            )}
          </form.Field>

          <form.Field name="source">
            {(field) => (
              <FieldSet>
                <FieldLegend>{t("practice.setup.fields.source")}</FieldLegend>
                <ToggleGroup
                  aria-label={t("practice.setup.fields.source")}
                  className="flex w-full flex-wrap justify-start"
                  onValueChange={(values) => {
                    const value = values[0]
                    if (value) field.handleChange(value as PracticeQuestionSource)
                  }}
                  spacing={2}
                  value={[field.state.value]}
                  variant="outline"
                >
                  {sources.map((source) => (
                    <ToggleGroupItem key={source} value={source}>
                      {t(`practice.sources.${source}`)}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </FieldSet>
            )}
          </form.Field>
        </div>

        <form.Field name="prioritizeWeaknesses">
          {(field) => (
            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>{t("practice.setup.fields.prioritizeWeaknesses")}</FieldTitle>
                <FieldDescription>{t("practice.setup.weaknessDescription")}</FieldDescription>
              </FieldContent>
              <Switch
                aria-label={t("practice.setup.fields.prioritizeWeaknesses")}
                checked={field.state.value}
                onCheckedChange={field.handleChange}
              />
            </Field>
          )}
        </form.Field>
      </FieldGroup>

      <form.Subscribe selector={(state) => state.values.source}>
        {(source) => {
          const unavailable =
            (source === "saved" && context.eligibleQuestionCounts.saved === 0) ||
            (source === "history" && context.eligibleQuestionCounts.history === 0)
          if (!unavailable) return null

          return (
            <Alert data-testid={`practice-no-${source}-questions`}>
              <AlertCircleIcon />
              <AlertTitle>{t(`practice.availability.${source}.title`)}</AlertTitle>
              <AlertDescription className="flex flex-col items-start gap-3">
                <span>{t(`practice.availability.${source}.description`)}</span>
                <Button
                  onClick={() => form.setFieldValue("source", "personalized")}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {t("practice.actions.usePersonalized")}
                </Button>
              </AlertDescription>
            </Alert>
          )
        }}
      </form.Subscribe>

      {submitError && (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>{t("practice.errors.startTitle")}</AlertTitle>
          <AlertDescription>{t("practice.errors.startDescription")}</AlertDescription>
        </Alert>
      )}

      <form.Subscribe selector={(state) => [state.isSubmitting, state.values.source] as const}>
        {([isSubmitting, source]) => {
          const sourceUnavailable =
            (source === "saved" && context.eligibleQuestionCounts.saved === 0) ||
            (source === "history" && context.eligibleQuestionCounts.history === 0)
          const pending = isSubmitting || isPending

          return (
            <Button
              className="w-full sm:w-fit"
              disabled={pending || sourceUnavailable}
              type="submit"
            >
              {pending && <Spinner aria-hidden="true" data-icon="inline-start" />}
              {pending ? t("practice.actions.starting") : t("practice.actions.start")}
            </Button>
          )
        }}
      </form.Subscribe>
    </form>
  )
}
