import { useForm } from "@tanstack/react-form"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { z } from "zod"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldControl, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import type {
  JobDescriptionAnalysisModuleField,
  TargetRole,
  UpdateJobDescriptionAnalysisModuleInput,
} from "@/models/roles"

import { getRolesActionErrorCode } from "../roles-errors"

const summarySchema = z.object({ value: z.string().trim().min(1, "required") })
const listSchema = z.object({ value: z.string() })

export function JobDescriptionAnalysisEditorDialog({
  field,
  onDirtyChange,
  onOpenChange,
  onSave,
  onSaved,
  role,
}: {
  field: JobDescriptionAnalysisModuleField | null
  onDirtyChange: (isDirty: boolean) => void
  onOpenChange: (open: boolean) => void
  onSave: (input: UpdateJobDescriptionAnalysisModuleInput) => Promise<void>
  onSaved: () => void
  role: TargetRole | null
}) {
  const { t } = useTranslation()
  const analysis = role?.jobDescriptionAnalysis
  const isOpen = field !== null && role?.jobDescription.status === "ready" && analysis !== null

  return (
    <Dialog onOpenChange={onOpenChange} open={isOpen}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        {role && analysis && field && (
          <JobDescriptionAnalysisEditorForm
            key={`${role.id}:${analysis.analysisVersion}:${field}`}
            analysisVersion={analysis.analysisVersion}
            field={field}
            initialValue={getInitialValue(analysis, field)}
            jobDescriptionVersion={analysis.jobDescriptionVersion}
            onDirtyChange={onDirtyChange}
            onOpenChange={onOpenChange}
            onSave={onSave}
            onSaved={onSaved}
            role={role}
            title={t(`roles.jd.analysis.${getFieldTranslationKey(field)}`)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function JobDescriptionAnalysisEditorForm({
  analysisVersion,
  field,
  initialValue,
  jobDescriptionVersion,
  onDirtyChange,
  onOpenChange,
  onSave,
  onSaved,
  role,
  title,
}: {
  analysisVersion: number
  field: JobDescriptionAnalysisModuleField
  initialValue: string
  jobDescriptionVersion: number
  onDirtyChange: (isDirty: boolean) => void
  onOpenChange: (open: boolean) => void
  onSave: (input: UpdateJobDescriptionAnalysisModuleInput) => Promise<void>
  onSaved: () => void
  role: TargetRole
  title: string
}) {
  const { t } = useTranslation()
  const [saveError, setSaveError] = useState<"requestFailed" | "versionConflict" | null>(null)
  const isSummary = field === "coreRequirementsSummary"
  const form = useForm({
    defaultValues: { value: initialValue },
    validators: { onSubmit: isSummary ? summarySchema : listSchema },
    onSubmit: async ({ value }) => {
      setSaveError(null)
      const input = isSummary
        ? {
            roleId: role.id,
            version: role.version,
            jobDescriptionVersion,
            analysisVersion,
            field,
            value: value.value.trim(),
          }
        : {
            roleId: role.id,
            version: role.version,
            jobDescriptionVersion,
            analysisVersion,
            field,
            value: parseList(value.value),
          }
      try {
        await onSave(input as UpdateJobDescriptionAnalysisModuleInput)
        onSaved()
      } catch (error) {
        setSaveError(getRolesActionErrorCode(error))
      }
    },
  })

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("roles.jd.actions.editModuleLabel", { module: title })}</DialogTitle>
        <DialogDescription>
          {t(
            isSummary
              ? "roles.jd.analysisEditor.summaryDescription"
              : "roles.jd.analysisEditor.listDescription",
          )}
        </DialogDescription>
      </DialogHeader>
      <form
        className="mt-6 flex flex-col gap-6"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void form.handleSubmit()
        }}
      >
        <form.Subscribe selector={(state) => state.isDirty}>
          {(isDirty) => <DraftStateSync isDirty={isDirty} onDirtyChange={onDirtyChange} />}
        </form.Subscribe>
        <FieldGroup>
          <form.Field name="value">
            {(input) => {
              const invalid = input.state.meta.isTouched && !input.state.meta.isValid
              return (
                <Field invalid={invalid}>
                  <FieldLabel htmlFor={input.name}>
                    {t("roles.jd.analysisEditor.fieldLabel")}
                  </FieldLabel>
                  <FieldControl>
                    <Textarea
                      aria-invalid={invalid || undefined}
                      aria-required={isSummary || undefined}
                      className="min-h-48 resize-y"
                      id={input.name}
                      onBlur={input.handleBlur}
                      onChange={(event) => input.handleChange(event.target.value)}
                      value={input.state.value}
                    />
                  </FieldControl>
                  <FieldError
                    errors={input.state.meta.errors.map(() => ({
                      message: t("roles.jd.analysisEditor.summaryRequired"),
                    }))}
                  />
                </Field>
              )
            }}
          </form.Field>
        </FieldGroup>
        {saveError && (
          <Alert variant="destructive">
            <AlertDescription>{t(`roles.errors.${saveError}`)}</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
            {t("roles.editor.cancel")}
          </Button>
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <Button disabled={isSubmitting} type="submit">
                {isSubmitting && <Spinner data-icon="inline-start" />}
                {isSubmitting
                  ? t("roles.jd.actions.savingCorrection")
                  : t("roles.jd.actions.saveCorrection")}
              </Button>
            )}
          </form.Subscribe>
        </DialogFooter>
      </form>
    </>
  )
}

function getInitialValue(
  analysis: NonNullable<TargetRole["jobDescriptionAnalysis"]>,
  field: JobDescriptionAnalysisModuleField,
) {
  return field === "coreRequirementsSummary" ? analysis[field] : analysis[field].join("\n")
}

function getFieldTranslationKey(field: JobDescriptionAnalysisModuleField) {
  return field === "frequentKeywords" ? "keywords" : field
}

function parseList(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean)
}

function DraftStateSync({
  isDirty,
  onDirtyChange,
}: {
  isDirty: boolean
  onDirtyChange: (isDirty: boolean) => void
}) {
  useEffect(() => onDirtyChange(isDirty), [isDirty, onDirtyChange])
  useEffect(() => () => onDirtyChange(false), [onDirtyChange])
  return null
}
