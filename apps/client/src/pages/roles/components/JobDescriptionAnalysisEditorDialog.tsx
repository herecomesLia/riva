import { useForm } from "@tanstack/react-form"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

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
import { FieldGroup } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import type {
  HardSkillsRequest,
  JobDescriptionResponse,
  JobRequirementsRequest,
  UpdateJobDescriptionRequest,
} from "@/api/generated/models"
import type { JdField, RoleView } from "@/models/target-role-workflow"

import { getRolesActionErrorCode, type RolesActionErrorCode } from "../roles-errors"
import { JobDescriptionBulletListEditor } from "./JobDescriptionBulletListEditor"

const qualificationFields = [
  "education",
  "graduationCohorts",
  "majors",
  "experience",
  "languages",
  "certifications",
  "other",
] as const satisfies (keyof JobRequirementsRequest)[]

const skillFields = [
  "programmingLanguages",
  "frameworksAndLibraries",
  "platforms",
  "tools",
  "conceptsAndMethods",
  "databasesAndMiddleware",
  "other",
] as const satisfies (keyof HardSkillsRequest)[]

type EditorValues = Record<string, string[]>

export function JobDescriptionAnalysisEditorDialog({
  field,
  onDirtyChange,
  onOpenChange,
  onSave,
  onSaved,
  role,
}: {
  field: JdField | null
  onDirtyChange: (isDirty: boolean) => void
  onOpenChange: (open: boolean) => void
  onSave: (roleId: string, input: UpdateJobDescriptionRequest) => Promise<void>
  onSaved: () => void
  role: RoleView | null
}) {
  const { t } = useTranslation()
  const isOpen =
    field !== null &&
    role !== null &&
    !role.isArchived &&
    (role.jdState.status === "missing" || role.jdState.status === "ready")

  return (
    <Dialog onOpenChange={onOpenChange} open={isOpen}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-0 overflow-hidden p-0 sm:max-w-xl">
        {role && field && (
          <JobDescriptionAnalysisEditorForm
            key={`${role.id}:${role.updatedAt}:${field}`}
            field={field}
            initialValues={getInitialValues(role.jd, field)}
            onDirtyChange={onDirtyChange}
            onOpenChange={onOpenChange}
            onSave={onSave}
            onSaved={onSaved}
            role={role}
            title={t(getTitleKey(field))}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function JobDescriptionAnalysisEditorForm({
  field,
  initialValues,
  onDirtyChange,
  onOpenChange,
  onSave,
  onSaved,
  role,
  title,
}: {
  field: JdField
  initialValues: EditorValues
  onDirtyChange: (isDirty: boolean) => void
  onOpenChange: (open: boolean) => void
  onSave: (roleId: string, input: UpdateJobDescriptionRequest) => Promise<void>
  onSaved: () => void
  role: RoleView
  title: string
}) {
  const { t } = useTranslation()
  const [saveError, setSaveError] = useState<RolesActionErrorCode | null>(null)
  const form = useForm({
    defaultValues: initialValues,
    onSubmit: async ({ value }) => {
      setSaveError(null)
      try {
        await onSave(role.id, createSubmissionInput(field, value))
        onSaved()
      } catch (error) {
        setSaveError(getRolesActionErrorCode(error))
      }
    },
  })

  const fields = getFields(field, t)
  return (
    <>
      <DialogHeader className="border-b px-6 py-5 pr-14">
        <DialogTitle className="text-xl font-medium leading-tight">
          {t("roles.jd.actions.editModuleLabel", { module: title })}
        </DialogTitle>
        <DialogDescription>{t(getDescriptionKey(field))}</DialogDescription>
      </DialogHeader>
      <form
        className="grid max-h-[calc(100dvh-8.25rem)] min-h-0 grid-rows-[minmax(0,1fr)_auto]"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void form.handleSubmit()
        }}
      >
        <div
          className="flex min-h-0 flex-col gap-6 overflow-y-auto px-6 py-5"
          data-testid="job-description-analysis-editor-scroll"
        >
          <form.Subscribe selector={(state) => state.isDirty}>
            {(isDirty) => <DraftStateSync isDirty={isDirty} onDirtyChange={onDirtyChange} />}
          </form.Subscribe>
          <FieldGroup>
            {fields.map(({ key, label }) => (
              <form.Field key={key} name={key}>
                {(input) => (
                  <JobDescriptionBulletListEditor
                    description={t("roles.jd.analysisEditor.bulletListDescription")}
                    items={input.state.value}
                    label={label}
                    onChange={input.handleChange}
                  />
                )}
              </form.Field>
            ))}
          </FieldGroup>
          {saveError && (
            <Alert variant="destructive">
              <AlertDescription>{t(`roles.errors.${saveError}`)}</AlertDescription>
            </Alert>
          )}
        </div>
        <DialogFooter className="border-t bg-popover px-6 py-4">
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

function getInitialValues(analysis: JobDescriptionResponse, field: JdField): EditorValues {
  if (field === "requirements" || field === "hardSkills") {
    return Object.fromEntries(
      Object.entries(analysis[field]).map(([key, items]) => [key, [...items]]),
    )
  }
  return { value: [...analysis[field]] }
}

function createSubmissionInput(field: JdField, values: EditorValues): UpdateJobDescriptionRequest {
  if (field === "requirements") {
    return { requirements: createRequirements(values) }
  }
  if (field === "hardSkills") {
    return { hardSkills: createHardSkills(values) }
  }
  return { [field]: normalizeItems(values.value ?? []) }
}

function createRequirements(values: EditorValues): JobRequirementsRequest {
  return {
    education: normalizeItems(values.education ?? []),
    graduationCohorts: normalizeItems(values.graduationCohorts ?? []),
    majors: normalizeItems(values.majors ?? []),
    experience: normalizeItems(values.experience ?? []),
    languages: normalizeItems(values.languages ?? []),
    certifications: normalizeItems(values.certifications ?? []),
    other: normalizeItems(values.other ?? []),
  }
}

function createHardSkills(values: EditorValues): HardSkillsRequest {
  return {
    programmingLanguages: normalizeItems(values.programmingLanguages ?? []),
    frameworksAndLibraries: normalizeItems(values.frameworksAndLibraries ?? []),
    platforms: normalizeItems(values.platforms ?? []),
    tools: normalizeItems(values.tools ?? []),
    conceptsAndMethods: normalizeItems(values.conceptsAndMethods ?? []),
    databasesAndMiddleware: normalizeItems(values.databasesAndMiddleware ?? []),
    other: normalizeItems(values.other ?? []),
  }
}

function getFields(field: JdField, t: ReturnType<typeof useTranslation>["t"]) {
  if (field === "requirements") {
    return qualificationFields.map((key) => ({
      key,
      label: t(`roles.jd.analysis.qualificationCategories.${key}`),
    }))
  }
  if (field === "hardSkills") {
    return skillFields.map((key) => ({ key, label: t(`roles.jd.analysis.skillCategories.${key}`) }))
  }
  return [{ key: "value", label: t(`roles.jd.analysis.${field}`) }]
}

function getTitleKey(field: JdField) {
  if (field === "requirements") return "roles.jd.analysis.qualificationRequirements"
  if (field === "hardSkills") return "roles.jd.analysis.requiredSkills"
  return `roles.jd.analysis.${field}` as const
}

function getDescriptionKey(field: JdField) {
  if (field === "requirements") return "roles.jd.analysisEditor.qualificationsDescription"
  if (field === "preferredQualifications")
    return "roles.jd.analysisEditor.preferredQualificationsDescription"
  return "roles.jd.analysisEditor.listDescription"
}

function normalizeItems(items: string[]) {
  return items.map((item) => item.trim()).filter(Boolean)
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
