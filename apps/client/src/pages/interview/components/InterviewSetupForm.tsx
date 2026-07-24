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
  InterviewRound,
  InterviewSetupViewData,
} from "@/models/interview"

type InterviewSetupFormProps = {
  setup: InterviewSetupViewData
  isPending: boolean
  onStart: (input: InterviewConfiguration) => Promise<void>
}

const interviewOptionStateClassName =
  "hover:bg-card focus:border-primary focus:text-primary focus-visible:border-primary focus-visible:text-primary aria-pressed:border-primary aria-pressed:bg-card aria-pressed:text-primary"

function getInitialConfiguration(setup: InterviewSetupViewData): InterviewConfiguration {
  const selectedRole =
    setup.targetRoles.find(({ id }) => id === setup.defaultConfiguration.targetRoleId) ??
    setup.targetRoles[0]

  if (selectedRole === undefined) {
    throw new Error("Interview setup form requires at least one target role.")
  }

  return {
    targetRoleId: selectedRole.id,
    round: selectedRole.supportedRounds.includes(setup.defaultConfiguration.round)
      ? setup.defaultConfiguration.round
      : selectedRole.supportedRounds[0],
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

export function InterviewSetupForm({ setup, isPending, onStart }: InterviewSetupFormProps) {
  const { t } = useTranslation()
  const [submitError, setSubmitError] = useState(false)
  const form = useForm({
    defaultValues: getInitialConfiguration(setup),
    onSubmit: async ({ value }) => {
      setSubmitError(false)
      try {
        await onStart(value)
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
      <CardContent>
        <FieldGroup className="gap-0">
          <form.Field name="targetRoleId">
            {(field) => {
              const selectedRole = setup.targetRoles.find(({ id }) => id === field.state.value)
              const selectedRoleLabel = selectedRole?.company
                ? `${selectedRole.title} · ${selectedRole.company}`
                : selectedRole?.title

              return (
                <Field className="pb-6" data-disabled={pending}>
                  <FieldLabel className="[&>svg]:size-4 [&>svg]:text-primary" htmlFor={field.name}>
                    <BriefcaseBusinessIcon aria-hidden="true" />
                    {t("interview.setup.fields.targetRole")}
                  </FieldLabel>
                  <Select
                    disabled={pending}
                    onValueChange={(value) => {
                      if (!value) return
                      field.handleChange(value)
                      const role = setup.targetRoles.find(({ id }) => id === value)
                      if (role && !role.supportedRounds.includes(form.getFieldValue("round"))) {
                        form.setFieldValue("round", role.supportedRounds[0])
                      }
                    }}
                    value={field.state.value}
                  >
                    <SelectTrigger
                      className="w-full focus:border-primary focus:text-primary focus-visible:border-primary focus-visible:text-primary"
                      data-testid="interview-target-role-trigger"
                      id={field.name}
                      onBlur={field.handleBlur}
                    >
                      <SelectValue>{selectedRoleLabel}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {setup.targetRoles.map((role) => (
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

          <div className="border-t border-border py-6">
            <form.Subscribe selector={(state) => state.values.targetRoleId}>
              {(targetRoleId) => {
                const selectedRole = setup.targetRoles.find(({ id }) => id === targetRoleId)
                return (
                  <form.Field name="round">
                    {(field) => (
                      <FieldSet data-disabled={pending}>
                        <FieldLegend
                          className="flex items-center gap-2 [&>svg]:size-4 [&>svg]:text-primary"
                          variant="label"
                        >
                          <WorkflowIcon aria-hidden="true" />
                          {t("interview.setup.fields.round")}
                        </FieldLegend>
                        <ToggleGroup
                          aria-label={t("interview.setup.fields.round")}
                          className="flex w-full flex-wrap justify-start"
                          disabled={pending}
                          onValueChange={(values) => {
                            const value = values[0]
                            if (value) field.handleChange(value as InterviewRound)
                          }}
                          spacing={2}
                          value={[field.state.value]}
                          variant="outline"
                        >
                          {selectedRole?.supportedRounds.map((round) => (
                            <ToggleGroupItem
                              className={interviewOptionStateClassName}
                              key={round}
                              value={round}
                            >
                              {t(`interview.rounds.${round}`)}
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

          <div className="grid gap-6 border-t border-border py-6 md:grid-cols-2 md:gap-0">
            <form.Field name="difficulty">
              {(field) => (
                <FieldSet className="md:pr-6" data-disabled={pending}>
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
                    value={[field.state.value]}
                    variant="outline"
                  >
                    {setup.availableDifficulties.map((difficulty) => (
                      <ToggleGroupItem
                        className={interviewOptionStateClassName}
                        key={difficulty}
                        value={difficulty}
                      >
                        {t(`interview.difficulty.${difficulty}`)}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </FieldSet>
              )}
            </form.Field>

            <div className="border-t border-border pt-6 md:border-t-0 md:border-l md:pt-0 md:pl-6">
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
                        <ToggleGroupItem
                          className={interviewOptionStateClassName}
                          key={durationMinutes}
                          value={String(durationMinutes)}
                        >
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

      <CardFooter className="mt-7 border-t">
        <Button className="w-full sm:w-fit" disabled={pending} size="lg" type="submit">
          {pending ? (
            <Spinner aria-hidden="true" data-icon="inline-start" />
          ) : (
            <PlayIcon aria-hidden="true" data-icon="inline-start" />
          )}
          {pending ? t("interview.actions.starting") : t("interview.actions.start")}
        </Button>
      </CardFooter>
    </form>
  )
}
