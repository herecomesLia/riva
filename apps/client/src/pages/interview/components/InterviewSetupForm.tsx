import { useForm, useStore } from "@tanstack/react-form"
import {
  AlertCircleIcon,
  BriefcaseBusinessIcon,
  Clock3Icon,
  GaugeIcon,
  PlayIcon,
  WorkflowIcon,
} from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { TrainingEntryPreparationAlert } from "@/components/training-entry-preparation-alert"
import { Button } from "@/components/ui/button"
import { CardContent, CardFooter } from "@/components/ui/card"
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
import type {
  InterviewConfiguration,
  InterviewDifficulty,
  InterviewDurationMinutes,
  InterviewType,
  InterviewSetup,
} from "@/models/interview-workflow"
import type { InterviewTrainingEntryResolution } from "@/models/training-entry"

type InterviewSetupFormProps = {
  setup: InterviewSetup
  historyEntryResolution?: InterviewTrainingEntryResolution
  isPending: boolean
  onStart: (input: InterviewConfiguration) => Promise<void>
}

function getInitialConfiguration(
  setup: InterviewSetup,
  historyEntryResolution?: InterviewTrainingEntryResolution,
): InterviewSetup["defaultConfiguration"] {
  if (historyEntryResolution?.status === "roleUnavailable") {
    return { ...setup.defaultConfiguration, roleId: null }
  }
  const selectedRole =
    setup.roles.find(({ id }) => id === setup.defaultConfiguration.roleId) ?? setup.roles[0]

  if (selectedRole === undefined) {
    throw new Error("Interview setup form requires at least one target role.")
  }

  return {
    roleId: selectedRole.id,
    interviewType: selectedRole.supportedInterviewTypes.includes(
      setup.defaultConfiguration.interviewType,
    )
      ? setup.defaultConfiguration.interviewType
      : selectedRole.supportedInterviewTypes[0],
    difficulty: setup.availableDifficulties.includes(setup.defaultConfiguration.difficulty)
      ? setup.defaultConfiguration.difficulty
      : setup.availableDifficulties[0],
    durationMinutes: setup.availableDurationMinutes.includes(
      setup.defaultConfiguration.durationMinutes,
    )
      ? setup.defaultConfiguration.durationMinutes
      : setup.availableDurationMinutes[0],
  }
}

export function InterviewSetupForm({
  setup,
  historyEntryResolution,
  isPending,
  onStart,
}: InterviewSetupFormProps) {
  const { t } = useTranslation()
  const [submitError, setSubmitError] = useState(false)
  const [adjustmentConfirmed, setAdjustmentConfirmed] = useState(
    historyEntryResolution?.status !== "adjusted",
  )
  const form = useForm({
    defaultValues: getInitialConfiguration(setup, historyEntryResolution),
    onSubmit: async ({ value }) => {
      if (!value.roleId || !value.interviewType || !value.difficulty || !value.durationMinutes) {
        return
      }
      setSubmitError(false)
      try {
        await onStart({
          roleId: value.roleId,
          interviewType: value.interviewType,
          difficulty: value.difficulty,
          durationMinutes: value.durationMinutes,
        })
      } catch {
        setSubmitError(true)
      }
    },
  })
  const isSubmitting = useStore(form.store, (state) => state.isSubmitting)
  const pending = isPending || isSubmitting

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        if (pending) return
        void form.handleSubmit()
      }}
    >
      <CardContent className="@container/setup flex flex-col gap-6">
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
              const selectedRole = setup.roles.find(({ id }) => id === field.state.value)
              const selectedRoleLabel = selectedRole?.company
                ? `${selectedRole.title} · ${selectedRole.company}`
                : selectedRole?.title

              return (
                <Field className="pb-5" data-disabled={pending}>
                  <FieldLabel className="[&>svg]:size-4 [&>svg]:text-primary" htmlFor={field.name}>
                    <BriefcaseBusinessIcon aria-hidden="true" />
                    {t("interview.setup.fields.role")}
                  </FieldLabel>
                  <Select
                    disabled={pending}
                    onValueChange={(value) => {
                      if (!value) return
                      field.handleChange(value)
                      const role = setup.roles.find(({ id }) => id === value)
                      const currentInterviewType = form.getFieldValue("interviewType")
                      if (
                        role &&
                        (!currentInterviewType ||
                          !role.supportedInterviewTypes.includes(currentInterviewType))
                      ) {
                        form.setFieldValue("interviewType", role.supportedInterviewTypes[0])
                      }
                    }}
                    value={field.state.value}
                  >
                    <SelectTrigger
                      className="w-full focus:border-primary focus:text-primary focus-visible:border-primary focus-visible:text-primary"
                      data-testid="interview-role-trigger"
                      id={field.name}
                      onBlur={field.handleBlur}
                    >
                      <SelectValue placeholder={t("common.trainingEntry.selectRole")}>
                        {selectedRoleLabel}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {setup.roles.map((role) => (
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
                const selectedRole = setup.roles.find(({ id }) => id === roleId)
                return (
                  <form.Field name="interviewType">
                    {(field) => (
                      <FieldSet data-disabled={pending}>
                        <FieldLegend
                          className="flex items-center gap-2 [&>svg]:size-4 [&>svg]:text-primary"
                          variant="label"
                        >
                          <WorkflowIcon aria-hidden="true" />
                          {t("interview.setup.fields.interviewType")}
                        </FieldLegend>
                        <ToggleGroup
                          aria-label={t("interview.setup.fields.interviewType")}
                          className="flex w-full flex-wrap justify-start"
                          disabled={pending}
                          onValueChange={(values) => {
                            const value = values[0]
                            if (value) field.handleChange(value as InterviewType)
                          }}
                          spacing={2}
                          value={field.state.value ? [field.state.value] : []}
                          variant="outline"
                        >
                          {selectedRole?.supportedInterviewTypes.map((interviewType) => (
                            <ToggleGroupItem key={interviewType} value={interviewType}>
                              {t(`interview.types.${interviewType}`)}
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

          <div className="grid gap-5 border-t border-border pt-5 @2xl/setup:grid-cols-2 @2xl/setup:gap-0">
            <form.Field name="difficulty">
              {(field) => (
                <FieldSet className="@2xl/setup:pr-6" data-disabled={pending}>
                  <FieldLegend
                    className="flex items-center gap-2 [&>svg]:size-4 [&>svg]:text-primary"
                    variant="label"
                  >
                    <GaugeIcon aria-hidden="true" />
                    {t("interview.setup.fields.difficulty")}
                  </FieldLegend>
                  <ToggleGroup
                    aria-label={t("interview.setup.fields.difficulty")}
                    className="flex w-full flex-wrap justify-start"
                    disabled={pending}
                    onValueChange={(values) => {
                      const value = values[0]
                      if (value) field.handleChange(value as InterviewDifficulty)
                    }}
                    spacing={2}
                    value={field.state.value ? [field.state.value] : []}
                    variant="outline"
                  >
                    {setup.availableDifficulties.map((difficulty) => (
                      <ToggleGroupItem key={difficulty} value={difficulty}>
                        {t(`interview.difficulty.${difficulty}`)}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </FieldSet>
              )}
            </form.Field>

            <div className="border-t border-border pt-5 @2xl/setup:border-t-0 @2xl/setup:border-l @2xl/setup:pt-0 @2xl/setup:pl-6">
              <form.Field name="durationMinutes">
                {(field) => (
                  <FieldSet data-disabled={pending}>
                    <FieldLegend
                      className="flex items-center gap-2 [&>svg]:size-4 [&>svg]:text-primary"
                      variant="label"
                    >
                      <Clock3Icon aria-hidden="true" />
                      {t("interview.setup.fields.duration")}
                    </FieldLegend>
                    <ToggleGroup
                      aria-label={t("interview.setup.fields.duration")}
                      className="flex w-full flex-wrap justify-start"
                      disabled={pending}
                      onValueChange={(values) => {
                        const value = values[0]
                        if (value) field.handleChange(Number(value) as InterviewDurationMinutes)
                      }}
                      spacing={2}
                      value={[String(field.state.value)]}
                      variant="outline"
                    >
                      {setup.availableDurationMinutes.map((durationMinutes) => (
                        <ToggleGroupItem key={durationMinutes} value={String(durationMinutes)}>
                          {t("interview.setup.durationMinutes", { minutes: durationMinutes })}
                        </ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                  </FieldSet>
                )}
              </form.Field>
            </div>
          </div>

          {submitError && (
            <Alert className="mt-6" variant="destructive">
              <AlertCircleIcon />
              <AlertTitle>{t("interview.errors.startTitle")}</AlertTitle>
              <AlertDescription>{t("interview.errors.startDescription")}</AlertDescription>
            </Alert>
          )}
        </FieldGroup>
      </CardContent>

      <CardFooter className="mt-6">
        <form.Subscribe selector={(state) => state.values.roleId}>
          {(roleId) => (
            <Button
              className="w-full sm:w-fit"
              disabled={pending || !roleId || !adjustmentConfirmed}
              size="lg"
              type="submit"
            >
              {pending ? (
                <Spinner aria-hidden="true" data-icon="inline-start" />
              ) : (
                <PlayIcon aria-hidden="true" data-icon="inline-start" />
              )}
              {pending ? t("interview.actions.starting") : t("interview.actions.start")}
            </Button>
          )}
        </form.Subscribe>
      </CardFooter>
    </form>
  )
}
