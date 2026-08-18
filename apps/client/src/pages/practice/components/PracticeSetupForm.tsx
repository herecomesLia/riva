import { useForm, useStore } from "@tanstack/react-form"
import {
  AlertCircleIcon,
  BriefcaseBusinessIcon,
  ClipboardListIcon,
  DatabaseIcon,
  GaugeIcon,
  PlayIcon,
  TargetIcon,
} from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { z } from "zod"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { TrainingEntryPreparationAlert } from "@/components/training-entry-preparation-alert"
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
  PracticeSetupSelection,
} from "@/models/practice"
import type { PracticeTrainingEntryResolution } from "@/models/training-entry"

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
const sources: PracticeQuestionSource[] = ["personalized", "saved", "history"]
const practiceOptionStateClassName =
  "hover:bg-card focus:border-primary focus:text-primary focus-visible:border-primary focus-visible:text-primary aria-pressed:border-primary aria-pressed:bg-card aria-pressed:text-primary"

type PracticeSetupFormProps = {
  context: PracticeSetupContext
  trainingEntryResolution?: PracticeTrainingEntryResolution
  initialSelection: PracticeSetupSelection
  isPending: boolean
  onStart: (input: ActivePracticeSelection) => Promise<void>
}

export function PracticeSetupForm({
  context,
  trainingEntryResolution,
  initialSelection,
  isPending,
  onStart,
}: PracticeSetupFormProps) {
  const { t } = useTranslation()
  const [submitError, setSubmitError] = useState(false)
  const [adjustmentConfirmed, setAdjustmentConfirmed] = useState(
    trainingEntryResolution?.status !== "adjusted",
  )
  const form = useForm({
    defaultValues: {
      ...initialSelection,
      prioritizeWeaknesses:
        context.canPrioritizeWeaknesses && initialSelection.prioritizeWeaknesses,
    },
    validators: { onSubmit: setupSchema },
    onSubmit: async ({ value }) => {
      if (!value.targetRoleId) return
      setSubmitError(false)
      try {
        await onStart({
          ...value,
          prioritizeWeaknesses: context.canPrioritizeWeaknesses
            ? value.prioritizeWeaknesses
            : false,
          targetRoleId: value.targetRoleId,
        })
      } catch {
        setSubmitError(true)
      }
    },
  })
  const isSubmitting = useStore(form.store, (state) => state.isSubmitting)
  const pending = isSubmitting || isPending

  return (
    <form
      className="flex flex-col gap-7"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      {trainingEntryResolution && (
        <TrainingEntryPreparationAlert
          confirmed={adjustmentConfirmed}
          onConfirm={() => setAdjustmentConfirmed(true)}
          resolution={trainingEntryResolution}
        />
      )}
      <FieldGroup className="gap-0">
        <form.Field name="targetRoleId">
          {(field) => {
            const selectedRole = context.targetRoles.find((role) => role.id === field.state.value)
            const selectedRoleLabel = selectedRole?.company
              ? `${selectedRole.title} · ${selectedRole.company}`
              : selectedRole?.title

            return (
              <Field className="pb-5" data-disabled={pending}>
                <FieldLabel className="[&>svg]:size-4 [&>svg]:text-primary" htmlFor={field.name}>
                  <BriefcaseBusinessIcon aria-hidden="true" />
                  {t("practice.setup.fields.targetRole")}
                </FieldLabel>
                <Select
                  disabled={pending}
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
                    className="w-full focus:border-primary focus:text-primary focus-visible:border-primary focus-visible:text-primary"
                    data-testid="practice-target-role-trigger"
                    id={field.name}
                    onBlur={field.handleBlur}
                  >
                    <SelectValue placeholder={t("common.trainingEntry.selectRole")}>
                      {selectedRoleLabel}
                    </SelectValue>
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

        <div className="border-t border-border py-5">
          <form.Subscribe selector={(state) => state.values.targetRoleId}>
            {(targetRoleId) => {
              const selectedRole = context.targetRoles.find((role) => role.id === targetRoleId)
              const supportedQuestionTypes = selectedRole?.supportedQuestionTypes ?? []

              return (
                <form.Field name="questionType">
                  {(field) => (
                    <FieldSet data-disabled={pending}>
                      <FieldLegend
                        className="flex items-center gap-2 [&>svg]:size-4 [&>svg]:text-primary"
                        variant="label"
                      >
                        <ClipboardListIcon aria-hidden="true" />
                        {t("practice.setup.fields.questionType")}
                      </FieldLegend>
                      <ToggleGroup
                        aria-label={t("practice.setup.fields.questionType")}
                        className="flex w-full flex-wrap justify-start"
                        disabled={pending}
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
                            <ToggleGroupItem
                              className={practiceOptionStateClassName}
                              key={type}
                              value={type}
                            >
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
        </div>

        <div className="grid gap-5 border-t border-border py-5 md:grid-cols-2 md:gap-0">
          <form.Field name="difficulty">
            {(field) => (
              <FieldSet className="md:pr-6" data-disabled={pending}>
                <FieldLegend
                  className="flex items-center gap-2 [&>svg]:size-4 [&>svg]:text-primary"
                  variant="label"
                >
                  <GaugeIcon aria-hidden="true" />
                  {t("practice.setup.fields.difficulty")}
                </FieldLegend>
                <ToggleGroup
                  aria-label={t("practice.setup.fields.difficulty")}
                  className="flex w-full justify-start"
                  disabled={pending}
                  onValueChange={(values) => {
                    const value = values[0]
                    if (value) field.handleChange(value as PracticeDifficulty)
                  }}
                  spacing={2}
                  value={[field.state.value]}
                  variant="outline"
                >
                  {context.availableDifficulties.map((difficulty) => (
                    <ToggleGroupItem
                      className={practiceOptionStateClassName}
                      key={difficulty}
                      value={difficulty}
                    >
                      {t(`practice.difficulty.${difficulty}`)}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </FieldSet>
            )}
          </form.Field>

          <div className="border-t border-border pt-5 md:border-t-0 md:border-l md:pt-0 md:pl-6">
            <form.Field name="source">
              {(field) => (
                <FieldSet data-disabled={pending}>
                  <FieldLegend
                    className="flex items-center gap-2 [&>svg]:size-4 [&>svg]:text-primary"
                    variant="label"
                  >
                    <DatabaseIcon aria-hidden="true" />
                    {t("practice.setup.fields.source")}
                  </FieldLegend>
                  <ToggleGroup
                    aria-label={t("practice.setup.fields.source")}
                    className="flex w-full flex-wrap justify-start"
                    disabled={pending}
                    onValueChange={(values) => {
                      const value = values[0]
                      if (value) field.handleChange(value as PracticeQuestionSource)
                    }}
                    spacing={2}
                    value={[field.state.value]}
                    variant="outline"
                  >
                    {sources.map((source) => (
                      <ToggleGroupItem
                        className={practiceOptionStateClassName}
                        key={source}
                        value={source}
                      >
                        {t(`practice.sources.${source}`)}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </FieldSet>
              )}
            </form.Field>
          </div>
        </div>

        <form.Field name="prioritizeWeaknesses">
          {(field) => (
            <Field
              className="w-full items-start gap-3 border-t border-border pt-5"
              data-disabled={pending}
              orientation="horizontal"
            >
              <FieldContent className="flex-none">
                <FieldTitle className="[&>svg]:size-4 [&>svg]:text-primary">
                  <TargetIcon aria-hidden="true" />
                  {t("practice.setup.fields.prioritizeWeaknesses")}
                </FieldTitle>
                <FieldDescription>{t("practice.setup.weaknessDescription")}</FieldDescription>
              </FieldContent>
              <Switch
                aria-label={t("practice.setup.fields.prioritizeWeaknesses")}
                checked={context.canPrioritizeWeaknesses && field.state.value}
                className="mt-0.5"
                disabled={pending || !context.canPrioritizeWeaknesses}
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
                  disabled={pending}
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

      <form.Subscribe
        selector={(state) => [state.values.source, state.values.targetRoleId] as const}
      >
        {([source, targetRoleId]) => {
          const sourceUnavailable =
            (source === "saved" && context.eligibleQuestionCounts.saved === 0) ||
            (source === "history" && context.eligibleQuestionCounts.history === 0)

          return (
            <Button
              className="w-full sm:w-fit"
              disabled={pending || sourceUnavailable || !targetRoleId || !adjustmentConfirmed}
              type="submit"
            >
              {!pending && <PlayIcon aria-hidden="true" data-icon="inline-start" />}
              {pending && <Spinner aria-hidden="true" data-icon="inline-start" />}
              {pending ? t("practice.actions.starting") : t("practice.actions.start")}
            </Button>
          )
        }}
      </form.Subscribe>
    </form>
  )
}
