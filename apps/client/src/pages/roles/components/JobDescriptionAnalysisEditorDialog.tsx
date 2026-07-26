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
  JobDescriptionAnalysisModuleField,
  QualificationRequirements,
  RequiredSkillGroups,
  TargetRole,
  UpdateJobDescriptionAnalysisModuleInput,
} from "@/models/roles"

import { getRolesActionErrorCode } from "../roles-errors"
import { JobDescriptionBulletListEditor } from "./JobDescriptionBulletListEditor"

const qualificationFields = [
  "education",
  "graduationCohorts",
  "majors",
  "experience",
  "languages",
  "certifications",
  "other",
] as const satisfies (keyof QualificationRequirements)[]

const skillFields = [
  "programmingLanguages",
  "frameworksAndLibraries",
  "platforms",
  "tools",
  "conceptsAndMethods",
  "databasesAndMiddleware",
  "other",
] as const satisfies (keyof RequiredSkillGroups)[]

type EditorValues = Record<string, string[]>
type ModuleUpdateContext = {
  roleId: string
  version: number
  jobDescriptionVersion: number
  analysisVersion: number
  field: JobDescriptionAnalysisModuleField
}

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
            initialValues={getInitialValues(analysis, field)}
            jobDescriptionVersion={analysis.jobDescriptionVersion}
            onDirtyChange={onDirtyChange}
            onOpenChange={onOpenChange}
            onSave={onSave}
            onSaved={onSaved}
            role={role}
            title={t(`roles.jd.analysis.${field}`)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function JobDescriptionAnalysisEditorForm({
  analysisVersion,
  field,
  initialValues,
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
  initialValues: EditorValues
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
  const form = useForm({
    defaultValues: initialValues,
    onSubmit: async ({ value }) => {
      setSaveError(null)
      try {
        await onSave(
          createSubmissionInput(
            {
              roleId: role.id,
              version: role.version,
              jobDescriptionVersion,
              analysisVersion,
              field,
            },
            value,
          ),
        )
        onSaved()
      } catch (error) {
        setSaveError(getRolesActionErrorCode(error))
      }
    },
  })

  const fields = getFields(field, t)
  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-xl">
          {t("roles.jd.actions.editModuleLabel", { module: title })}
        </DialogTitle>
        <DialogDescription>{t(getDescriptionKey(field))}</DialogDescription>
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

function getInitialValues(
  analysis: NonNullable<TargetRole["jobDescriptionAnalysis"]>,
  field: JobDescriptionAnalysisModuleField,
): EditorValues {
  if (field === "qualificationRequirements" || field === "requiredSkills") {
    return Object.fromEntries(
      Object.entries(analysis[field]).map(([key, items]) => [key, [...items]]),
    )
  }
  return { value: [...analysis[field]] }
}

function createSubmissionInput(
  context: ModuleUpdateContext,
  values: EditorValues,
): UpdateJobDescriptionAnalysisModuleInput {
  if (context.field === "qualificationRequirements") {
    return {
      ...context,
      field: "qualificationRequirements",
      value: createQualificationRequirements(values),
    }
  }
  if (context.field === "requiredSkills") {
    return { ...context, field: "requiredSkills", value: createRequiredSkillGroups(values) }
  }
  return { ...context, field: context.field, value: normalizeItems(values.value ?? []) }
}

function createQualificationRequirements(values: EditorValues): QualificationRequirements {
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

function createRequiredSkillGroups(values: EditorValues): RequiredSkillGroups {
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

function getFields(
  field: JobDescriptionAnalysisModuleField,
  t: ReturnType<typeof useTranslation>["t"],
) {
  if (field === "qualificationRequirements") {
    return qualificationFields.map((key) => ({
      key,
      label: t(`roles.jd.analysis.qualificationCategories.${key}`),
    }))
  }
  if (field === "requiredSkills") {
    return skillFields.map((key) => ({ key, label: t(`roles.jd.analysis.skillCategories.${key}`) }))
  }
  return [{ key: "value", label: t(`roles.jd.analysis.${field}`) }]
}

function getDescriptionKey(field: JobDescriptionAnalysisModuleField) {
  if (field === "qualificationRequirements")
    return "roles.jd.analysisEditor.qualificationsDescription"
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
