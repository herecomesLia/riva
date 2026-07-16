import { useForm } from "@tanstack/react-form"
import { PlusIcon, Trash2Icon } from "lucide-react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { z } from "zod"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DialogFooter } from "@/components/ui/dialog"
import { Field, FieldControl, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { LocalizedMonthPicker } from "@/components/ui/month-picker"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { normalizeBulletItems, normalizeSkillIds } from "@/models/profile-text"
import {
  educationItemSchema,
  profileEmploymentTypes as employmentTypes,
  projectItemSchema,
  workItemSchema,
} from "@/schemas/profile"
import type {
  EmploymentType,
  JobProfile,
  ProfileSkill,
  SaveProfileSectionInput,
  WorkExperience,
} from "@/models/profile"
import { BulletListEditor } from "./BulletListEditor"
import type { EditableExperienceSection } from "./ProfileSectionEditDialog"
import { SkillTagInput } from "./SkillTagInput"

type ProfileSectionEditorProps = {
  onCancel: () => void
  onDirtyChange: (isDirty: boolean) => void
  onSave: (input: SaveProfileSectionInput) => Promise<void>
  profile: JobProfile
  section: EditableExperienceSection
}

type EditorItem = Record<string, unknown> & {
  endDate: string
  id: string
  isCurrent: boolean
  startDate: string
}

function createTemporaryId() {
  return `draft_${crypto.randomUUID()}`
}

function joinProjectLines(value: string[]) {
  return value.join("\n")
}

function toProjectLines(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean)
}

function toNullable(value: string) {
  return value.trim() || null
}

function toProjectCommaSeparatedValues(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}

function translateValidationError(t: ReturnType<typeof useTranslation>["t"], error: unknown) {
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String(error.message)
      : error

  switch (message) {
    case "required":
      return t("profile.editor.validation.required")
    case "dateRange":
      return t("profile.editor.validation.dateRange")
    case "employmentType":
      return t("profile.editor.validation.employmentType")
    case "url":
      return t("profile.editor.validation.url")
    default:
      return String(error)
  }
}

function DraftStateSync({
  isDirty,
  onDirtyChange,
}: {
  isDirty: boolean
  onDirtyChange: (isDirty: boolean) => void
}) {
  useEffect(() => {
    onDirtyChange(isDirty)
  }, [isDirty, onDirtyChange])

  return null
}

function TextField({
  form,
  index,
  label,
  month = false,
  name,
  textarea = false,
}: {
  form: any
  index?: number
  label: string
  month?: boolean
  name: string
  textarea?: boolean
}) {
  const { t } = useTranslation()
  const fieldName = index === undefined ? name : `items.${index}.${name}`

  return (
    <form.Field name={fieldName}>
      {(field: any) => {
        const invalid = field.state.meta.isTouched && !field.state.meta.isValid

        return (
          <Field invalid={invalid}>
            <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
            <FieldControl>
              {month ? (
                <LocalizedMonthPicker
                  id={field.name}
                  invalid={invalid}
                  onBlur={field.handleBlur}
                  onChange={field.handleChange}
                  value={field.state.value ?? ""}
                />
              ) : textarea ? (
                <Textarea
                  id={field.name}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  value={field.state.value ?? ""}
                />
              ) : (
                <Input
                  id={field.name}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  value={field.state.value ?? ""}
                />
              )}
            </FieldControl>
            <FieldError
              errors={field.state.meta.errors.map((error: unknown) => ({
                message: translateValidationError(t, error),
              }))}
            />
          </Field>
        )
      }}
    </form.Field>
  )
}

function EndDateField({
  form,
  hasSubmitted,
  index,
}: {
  form: any
  hasSubmitted: boolean
  index: number
}) {
  const { t } = useTranslation()
  const endDateName = `items.${index}.endDate`
  const isCurrentName = `items.${index}.isCurrent`

  return (
    <form.Field name={endDateName}>
      {(endDateField: any) => (
        <form.Field name={isCurrentName}>
          {(isCurrentField: any) => {
            const isCurrent = Boolean(isCurrentField.state.value)
            const endDate = endDateField.state.value ?? ""
            const startDate = form.state.values.items?.[index]?.startDate ?? ""
            const validationError =
              hasSubmitted && !isCurrent
                ? !endDate
                  ? "required"
                  : endDate < startDate
                    ? "dateRange"
                    : null
                : null
            const errors = validationError
              ? [{ message: translateValidationError(t, validationError) }]
              : []
            const invalid = !isCurrent && errors.length > 0

            return (
              <Field invalid={invalid}>
                <div className="flex items-center justify-between gap-3">
                  <FieldLabel htmlFor={endDateField.name}>
                    {t("profile.formField.endDate")}
                  </FieldLabel>
                  <div className="flex shrink-0 items-center gap-2">
                    <Checkbox
                      checked={isCurrent}
                      id={`${isCurrentField.name}-present`}
                      onCheckedChange={(checked) => {
                        const nextIsCurrent = checked === true

                        isCurrentField.handleChange(nextIsCurrent)
                        if (nextIsCurrent) endDateField.handleChange("")
                      }}
                    />
                    <FieldLabel
                      className="cursor-pointer font-normal"
                      htmlFor={`${isCurrentField.name}-present`}
                    >
                      {t("profile.field.present")}
                    </FieldLabel>
                  </div>
                </div>
                <FieldControl>
                  {isCurrent ? (
                    <Input
                      aria-label={t("profile.formField.endDate")}
                      disabled
                      id={endDateField.name}
                      readOnly
                      type="text"
                      value={t("profile.field.present")}
                    />
                  ) : (
                    <LocalizedMonthPicker
                      id={endDateField.name}
                      invalid={invalid}
                      onBlur={endDateField.handleBlur}
                      onChange={endDateField.handleChange}
                      value={endDateField.state.value ?? ""}
                    />
                  )}
                </FieldControl>
                {!isCurrent && <FieldError errors={errors} visible={invalid} />}
              </Field>
            )
          }}
        </form.Field>
      )}
    </form.Field>
  )
}

function EmploymentTypeField({ form, index }: { form: any; index: number }) {
  const { t } = useTranslation()
  const fieldName = `items.${index}.employmentType`

  return (
    <form.Field name={fieldName}>
      {(field: any) => {
        const invalid = field.state.meta.isTouched && !field.state.meta.isValid

        return (
          <Field invalid={invalid}>
            <FieldLabel htmlFor={field.name}>{t("profile.field.employmentTypes")}</FieldLabel>
            <Select onValueChange={field.handleChange} value={field.state.value}>
              <FieldControl>
                <SelectTrigger id={field.name} onBlur={field.handleBlur}>
                  <SelectValue />
                </SelectTrigger>
              </FieldControl>
              <SelectContent>
                {employmentTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {t(`profile.employmentType.${type}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError
              errors={field.state.meta.errors.map((error: unknown) => ({
                message: translateValidationError(t, error),
              }))}
            />
          </Field>
        )
      }}
    </form.Field>
  )
}

function RelatedWorkField({
  form,
  index,
  profile,
}: {
  form: any
  index: number
  profile: JobProfile
}) {
  const { t } = useTranslation()
  const fieldName = `items.${index}.relatedWorkExperienceId`

  return (
    <form.Field name={fieldName}>
      {(field: any) => (
        <Field>
          <FieldLabel htmlFor={field.name}>
            {t("profile.formField.relatedWorkExperienceId")}
          </FieldLabel>
          <Select onValueChange={field.handleChange} value={field.state.value || null}>
            <FieldControl>
              <SelectTrigger id={field.name} onBlur={field.handleBlur}>
                <SelectValue />
              </SelectTrigger>
            </FieldControl>
            <SelectContent>
              <SelectItem value="">—</SelectItem>
              {profile.workExperiences.map((experience) => (
                <SelectItem key={experience.id} value={experience.id}>
                  {experience.company} · {experience.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
    </form.Field>
  )
}

export function ProfileSectionEditor({
  onCancel,
  onDirtyChange,
  onSave,
  profile,
  section,
}: ProfileSectionEditorProps) {
  const { t } = useTranslation()
  const [saveError, setSaveError] = useState(false)
  const [hasSubmitted, setHasSubmitted] = useState(false)
  const [draftSkills, setDraftSkills] = useState<ProfileSkill[]>([])
  const form = useForm({
    defaultValues: createDraft(profile, section) as any,
    validators: {
      onSubmit: createSectionSchema(section) as any,
    },
    onSubmit: async ({ value }: { value: any }) => {
      setSaveError(false)

      try {
        const values = normalizeSectionValues(section, value)
        const workExperienceValues = values as WorkExperience[]
        const skillsToCreate =
          section === "workExperience"
            ? draftSkills
                .filter((skill) =>
                  workExperienceValues.some((experience) => experience.skillIds.includes(skill.id)),
                )
                .map(({ id, name }) => ({ clientId: id, name }))
            : []

        await onSave(
          section === "workExperience"
            ? {
                profileId: profile.profileId,
                section,
                skillsToCreate,
                values,
                version: profile.version,
              }
            : {
                profileId: profile.profileId,
                section,
                values,
                version: profile.version,
              },
        )
      } catch {
        setSaveError(true)
      }
    },
    onSubmitInvalid: () => setHasSubmitted(true),
  })

  function addExperience() {
    const items = (form.state.values as { items?: EditorItem[] }).items ?? []
    form.setFieldValue("items" as never, [...items, createNewItem(section)] as never)
  }

  return (
    <form
      className="grid max-h-[calc(100dvh-8.25rem)] min-h-0 grid-rows-[minmax(0,1fr)_auto]"
      data-testid={`profile-editor-${section}`}
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <div className="min-h-0 overflow-y-auto px-6 py-5">
        <form.Subscribe selector={(state: any) => state.isDirty}>
          {(isDirty: boolean) => <DraftStateSync isDirty={isDirty} onDirtyChange={onDirtyChange} />}
        </form.Subscribe>
        <FieldGroup>
          <form.Subscribe selector={(state: any) => state.values.items}>
            {(items: EditorItem[]) => (
              <div className="flex flex-col gap-6">
                {items.map((item, index) => (
                  <ExperienceFields
                    form={form}
                    index={index}
                    itemId={item.id}
                    key={item.id}
                    onDelete={() => {
                      form.setFieldValue(
                        "items" as never,
                        items.filter((candidate) => candidate.id !== item.id) as never,
                      )
                    }}
                    hasSubmitted={hasSubmitted}
                    profile={profile}
                    draftSkills={draftSkills}
                    onDraftSkillsChange={setDraftSkills}
                    section={section}
                  />
                ))}
              </div>
            )}
          </form.Subscribe>
          <Button onClick={addExperience} type="button" variant="outline">
            <PlusIcon data-icon="inline-start" />
            {t("profile.editor.addExperience")}
          </Button>
          <Alert>
            <AlertDescription>{t("profile.editor.deleteDescription")}</AlertDescription>
          </Alert>
        </FieldGroup>

        {saveError && (
          <Alert className="mt-6" variant="destructive">
            <AlertDescription>{t("profile.editor.saveError")}</AlertDescription>
          </Alert>
        )}
      </div>
      <EditorFooter form={form} onCancel={onCancel} />
    </form>
  )
}

function ExperienceFields({
  form,
  hasSubmitted,
  index,
  itemId,
  onDelete,
  draftSkills,
  onDraftSkillsChange,
  profile,
  section,
}: {
  form: any
  hasSubmitted: boolean
  index: number
  itemId: string
  onDelete: () => void
  draftSkills: ProfileSkill[]
  onDraftSkillsChange: (skills: ProfileSkill[]) => void
  profile: JobProfile
  section: EditableExperienceSection
}) {
  const { t } = useTranslation()
  const fieldLabel = (name: string) => t(`profile.formField.${name}`)
  const dateFields = (
    <>
      <TextField form={form} index={index} label={fieldLabel("startDate")} month name="startDate" />
      <EndDateField form={form} hasSubmitted={hasSubmitted} index={index} />
    </>
  )

  return (
    <div
      className="flex flex-col gap-5 rounded-xl border p-4"
      data-testid={`profile-editor-item-${itemId}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-medium">{t("profile.editor.experience", { count: index + 1 })}</p>
        <Button onClick={onDelete} type="button" variant="destructive">
          <Trash2Icon data-icon="inline-start" />
          {t("profile.editor.delete")}
        </Button>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {section === "education" ? (
          <>
            <TextField form={form} index={index} label={fieldLabel("school")} name="school" />
            <TextField form={form} index={index} label={fieldLabel("degree")} name="degree" />
            <TextField form={form} index={index} label={fieldLabel("major")} name="major" />
            {dateFields}
          </>
        ) : section === "workExperience" ? (
          <>
            <TextField form={form} index={index} label={fieldLabel("company")} name="company" />
            <TextField form={form} index={index} label={fieldLabel("title")} name="title" />
            <EmploymentTypeField form={form} index={index} />
            <TextField
              form={form}
              index={index}
              label={t("profile.field.location")}
              name="location"
            />
            {dateFields}
            <form.Field name={`items.${index}.responsibilities`}>
              {(field: any) => (
                <BulletListEditor
                  description={t("profile.editor.bulletListDescription")}
                  items={field.state.value ?? []}
                  label={t("profile.field.responsibilities")}
                  onChange={field.handleChange}
                />
              )}
            </form.Field>
            <form.Field name={`items.${index}.achievements`}>
              {(field: any) => (
                <BulletListEditor
                  description={t("profile.editor.bulletListDescription")}
                  items={field.state.value ?? []}
                  label={t("profile.field.achievements")}
                  onChange={field.handleChange}
                />
              )}
            </form.Field>
            <form.Field name={`items.${index}.skillIds`}>
              {(field: any) => (
                <SkillTagInput
                  availableSkills={profile.skills}
                  draftSkills={draftSkills}
                  onDraftSkillsChange={onDraftSkillsChange}
                  onSelectedSkillIdsChange={field.handleChange}
                  selectedSkillIds={field.state.value ?? []}
                />
              )}
            </form.Field>
          </>
        ) : (
          <>
            <TextField form={form} index={index} label={t("profile.field.name")} name="name" />
            <TextField form={form} index={index} label={fieldLabel("role")} name="role" />
            {dateFields}
            <TextField
              form={form}
              index={index}
              label={fieldLabel("background")}
              name="background"
              textarea
            />
            <TextField
              form={form}
              index={index}
              label={t("profile.field.responsibilities")}
              name="responsibilities"
              textarea
            />
            <TextField
              form={form}
              index={index}
              label={t("profile.field.contributions")}
              name="contributions"
              textarea
            />
            <TextField
              form={form}
              index={index}
              label={t("profile.field.achievements")}
              name="achievements"
              textarea
            />
            <TextField
              form={form}
              index={index}
              label={fieldLabel("technologies")}
              name="technologies"
            />
            <TextField
              form={form}
              index={index}
              label={fieldLabel("projectUrl")}
              name="projectUrl"
            />
            <RelatedWorkField form={form} index={index} profile={profile} />
          </>
        )}
      </div>
    </div>
  )
}

function EditorFooter({ form, onCancel }: { form: any; onCancel: () => void }) {
  const { t } = useTranslation()

  return (
    <DialogFooter className="border-t bg-popover px-6 py-4">
      <Button onClick={onCancel} type="button" variant="outline">
        {t("profile.editor.cancel")}
      </Button>
      <form.Subscribe selector={(state: any) => state.isSubmitting}>
        {(isSubmitting: boolean) => (
          <Button disabled={isSubmitting} type="submit">
            {isSubmitting ? t("profile.editor.saving") : t("profile.editor.save")}
          </Button>
        )}
      </form.Subscribe>
    </DialogFooter>
  )
}

function createDraft(profile: JobProfile, section: EditableExperienceSection) {
  switch (section) {
    case "education":
      return {
        items: structuredClone(profile.education).map(({ source: _source, ...item }) => ({
          ...item,
          degree: item.degree ?? "",
          endDate: item.endDate ?? "",
          major: item.major ?? "",
          startDate: item.startDate ?? "",
        })),
      }
    case "workExperience":
      return {
        items: structuredClone(profile.workExperiences).map(({ source: _source, ...item }) => ({
          ...item,
          achievements: structuredClone(item.achievements),
          endDate: item.endDate ?? "",
          location: item.location ?? "",
          responsibilities: structuredClone(item.responsibilities),
          skillIds: structuredClone(item.skillIds),
          startDate: item.startDate ?? "",
        })),
      }
    case "projectExperience":
      return {
        items: structuredClone(profile.projectExperiences).map(({ source: _source, ...item }) => ({
          ...item,
          achievements: joinProjectLines(item.achievements),
          background: item.background ?? "",
          contributions: joinProjectLines(item.contributions),
          endDate: item.endDate ?? "",
          projectUrl: item.projectUrl ?? "",
          relatedWorkExperienceId: item.relatedWorkExperienceId ?? "",
          responsibilities: joinProjectLines(item.responsibilities),
          role: item.role ?? "",
          isCurrent: item.endDate === null,
          startDate: item.startDate ?? "",
          technologies: item.technologies.join(", "),
        })),
      }
  }
}

function createSectionSchema(section: EditableExperienceSection) {
  const itemSchema =
    section === "education"
      ? educationItemSchema
      : section === "workExperience"
        ? workItemSchema
        : projectItemSchema

  return z.object({ items: z.array(itemSchema) })
}

function normalizeSectionValues(section: EditableExperienceSection, value: any) {
  if (section === "education") {
    return value.items.map(({ source: _source, ...item }: any) => ({
      ...item,
      degree: toNullable(item.degree),
      endDate: item.isCurrent ? null : toNullable(item.endDate),
      major: toNullable(item.major),
      startDate: toNullable(item.startDate),
    }))
  }

  if (section === "workExperience") {
    return value.items.map(({ source: _source, ...item }: any) => ({
      ...item,
      achievements: normalizeBulletItems(item.achievements),
      endDate: item.isCurrent ? null : toNullable(item.endDate),
      location: toNullable(item.location),
      responsibilities: normalizeBulletItems(item.responsibilities),
      skillIds: normalizeSkillIds(item.skillIds),
      startDate: toNullable(item.startDate),
    }))
  }

  return value.items.map(({ isCurrent, source: _source, ...item }: any) => ({
    ...item,
    achievements: toProjectLines(item.achievements),
    background: toNullable(item.background),
    contributions: toProjectLines(item.contributions),
    endDate: isCurrent ? null : toNullable(item.endDate),
    projectUrl: toNullable(item.projectUrl),
    relatedWorkExperienceId: toNullable(item.relatedWorkExperienceId),
    responsibilities: toProjectLines(item.responsibilities),
    role: toNullable(item.role),
    startDate: toNullable(item.startDate),
    technologies: toProjectCommaSeparatedValues(item.technologies),
  }))
}

function createNewItem(section: EditableExperienceSection) {
  const base = {
    endDate: "",
    id: createTemporaryId(),
    isCurrent: false,
    startDate: "",
  }

  if (section === "education") {
    return { ...base, degree: "", major: "", school: "" }
  }

  if (section === "workExperience") {
    return {
      ...base,
      achievements: [],
      company: "",
      employmentType: "fullTime" satisfies EmploymentType,
      location: "",
      responsibilities: [],
      skillIds: [],
      title: "",
    }
  }

  return {
    ...base,
    achievements: "",
    background: "",
    contributions: "",
    name: "",
    projectUrl: "",
    relatedWorkExperienceId: "",
    responsibilities: "",
    role: "",
    technologies: "",
  }
}
