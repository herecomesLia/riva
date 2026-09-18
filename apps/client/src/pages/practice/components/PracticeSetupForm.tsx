import { useForm, useStore } from "@tanstack/react-form"
import {
  AlertCircleIcon,
  BriefcaseBusinessIcon,
  ClipboardListIcon,
  GaugeIcon,
  PlayIcon,
} from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { z } from "zod"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { TrainingEntryPreparationAlert } from "@/components/training-entry-preparation-alert"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { PracticeDifficulty, PracticeQuestionType } from "@/api/generated/models"
import type {
  ActiveSelection,
  PracticeSetupContext,
  PracticeSelection,
} from "@/models/practice-workflow"
import type { PracticeTrainingEntryResolution } from "@/models/training-entry"

const setupSchema = z.object({
  roleId: z.string().min(1),
  questionType: z.enum(PracticeQuestionType),
  difficulty: z.enum(PracticeDifficulty),
})

const questionTypes = Object.values(PracticeQuestionType)

type PracticeSetupFormProps = {
  context: PracticeSetupContext
  historyEntryResolution?: PracticeTrainingEntryResolution
  initialSelection: PracticeSelection
  isPending: boolean
  onStart: (input: ActiveSelection) => Promise<void>
}

export function PracticeSetupForm({
  context,
  historyEntryResolution,
  initialSelection,
  isPending,
  onStart,
}: PracticeSetupFormProps) {
  const { t } = useTranslation()
  const [submitError, setSubmitError] = useState(false)
  const [adjustmentConfirmed, setAdjustmentConfirmed] = useState(
    historyEntryResolution?.status !== "adjusted",
  )
  const form = useForm({
    defaultValues: initialSelection,
    validators: { onSubmit: setupSchema },
    onSubmit: async ({ value }) => {
      if (!value.roleId) return
      setSubmitError(false)
      try {
        await onStart({ ...value, roleId: value.roleId })
      } catch {
        setSubmitError(true)
      }
    },
  })
  const isSubmitting = useStore(form.store, (state) => state.isSubmitting)
  const pending = isSubmitting || isPending

  return (
    <form
      className="@container/setup flex flex-col gap-6"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      {historyEntryResolution && (
        <TrainingEntryPreparationAlert
          confirmed={adjustmentConfirmed}
          onConfirm={() => setAdjustmentConfirmed(true)}
          resolution={historyEntryResolution}
        />
      )}
      <FieldGroup className="gap-0">
        <form.Field name="roleId">
          {(field) => {
            const selectedRole = context.roles.find((role) => role.id === field.state.value)
            const selectedRoleLabel = selectedRole?.company
              ? `${selectedRole.title} · ${selectedRole.company}`
              : selectedRole?.title

            return (
              <Field className="pb-5" data-disabled={pending}>
                <FieldLabel className="[&>svg]:size-4 [&>svg]:text-primary" htmlFor={field.name}>
                  <BriefcaseBusinessIcon aria-hidden="true" />
                  {t("practice.setup.fields.role")}
                </FieldLabel>
                <Select
                  disabled={pending}
                  onValueChange={(value) => {
                    if (!value) return
                    field.handleChange(value)
                    const selectedRole = context.roles.find((role) => role.id === value)
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
                    data-testid="practice-role-trigger"
                    id={field.name}
                    onBlur={field.handleBlur}
                  >
                    <SelectValue placeholder={t("common.trainingEntry.selectRole")}>
                      {selectedRoleLabel}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {context.roles.map((role) => (
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
          <form.Subscribe selector={(state) => state.values.roleId}>
            {(roleId) => {
              const selectedRole = context.roles.find((role) => role.id === roleId)
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
        </div>

        <div className="border-t border-border py-5">
          <form.Field name="difficulty">
            {(field) => (
              <FieldSet data-disabled={pending}>
                <FieldLegend
                  className="flex items-center gap-2 [&>svg]:size-4 [&>svg]:text-primary"
                  variant="label"
                >
                  <GaugeIcon aria-hidden="true" />
                  {t("practice.setup.fields.difficulty")}
                </FieldLegend>
                <ToggleGroup
                  aria-label={t("practice.setup.fields.difficulty")}
                  className="flex w-full flex-wrap justify-start"
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
                    <ToggleGroupItem key={difficulty} value={difficulty}>
                      {t(`practice.difficulty.${difficulty}`)}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </FieldSet>
            )}
          </form.Field>
        </div>
      </FieldGroup>

      {submitError && (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>{t("practice.errors.startTitle")}</AlertTitle>
          <AlertDescription>{t("practice.errors.startDescription")}</AlertDescription>
        </Alert>
      )}

      <form.Subscribe selector={(state) => state.values.roleId}>
        {(roleId) => {
          return (
            <Button
              className="w-full sm:w-fit"
              disabled={pending || !roleId || !adjustmentConfirmed}
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
