import { useForm } from "@tanstack/react-form"
import { PlusIcon, Trash2Icon } from "lucide-react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { z } from "zod"

import type {
  CareerProfileResponse,
  EducationEntryRequest,
  EmploymentType,
  ProjectEntryRequest,
  UpdateCareerProfileRequest,
  WorkExperienceEntryRequest,
} from "@/api/generated/models"
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
import { normalizeBulletItems, normalizeTechnologyStack } from "@/models/profile-text"
import {
  educationItemSchema,
  profileEmploymentTypes as employmentTypes,
  projectItemSchema,
  workItemSchema,
} from "@/schemas/profile"
import { BulletListEditor } from "./BulletListEditor"
import type { EditableExperienceSection } from "./ProfileSectionEditDialog"
import { SkillTagInput } from "./SkillTagInput"
import { TechnologyStackInput } from "./TechnologyStackInput"

type ProfileSectionEditorProps = {
  onCancel: () => void
  onDirtyChange: (isDirty: boolean) => void
  onSave: (input: UpdateCareerProfileRequest) => Promise<void>
  profile: CareerProfileResponse
  section: EditableExperienceSection
}

type EditorItem = Record<string, unknown> & {
  clientId: string
  endDate: string
  isCurrent: boolean
  startDate: string
}

function createTemporaryId() {
  return `draft_${crypto.randomUUID()}`
}

function toNullable(value: string) {
  return value.trim() || null
}

function experienceFieldName(index: number, name: string) {
  return `items[${index}].${name}`
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
}: {
  form: any
  index?: number
  label: string
  month?: boolean
  name: string
}) {
  const { t } = useTranslation()
  const fieldName = index === undefined ? name : experienceFieldName(index, name)

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
  const endDateName = experienceFieldName(index, "endDate")
  const isCurrentName = experienceFieldName(index, "isCurrent")

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
  const fieldName = experienceFieldName(index, "employmentType")

  return (
    <form.Field name={fieldName}>
      {(field: any) => {
        const invalid = field.state.meta.isTouched && !field.state.meta.isValid

        return (
          <Field invalid={invalid}>
            <FieldLabel htmlFor={field.name}>{t("profile.field.employmentTypes")}</FieldLabel>
            <Select
              onValueChange={(value) => field.handleChange(value === "none" ? "" : value)}
              value={field.state.value || "none"}
            >
              <FieldControl>
                <SelectTrigger id={field.name} onBlur={field.handleBlur}>
                  <SelectValue />
                </SelectTrigger>
              </FieldControl>
              <SelectContent>
                <SelectItem value="none">{t("profile.field.notProvided")}</SelectItem>
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
  const form = useForm({
    defaultValues: createDraft(profile, section) as any,
    validators: {
      onSubmit: createSectionSchema(section) as any,
    },
    onSubmit: async ({ value }: { value: any }) => {
      setSaveError(false)

      try {
        const values = normalizeSectionValues(section, value)
        if (section === "education") {
          await onSave({ education: values as EducationEntryRequest[] })
        } else if (section === "projectExperience") {
          await onSave({ projects: values as ProjectEntryRequest[] })
        } else {
          const workExperiences = values as WorkExperienceEntryRequest[]
          const nextSkills = [...profile.skills]
          workExperiences.forEach((experience) => {
            experience.skills?.forEach((skill) => {
              if (!nextSkills.includes(skill)) nextSkills.push(skill)
            })
          })
          await onSave({ skills: nextSkills, workExperiences })
        }
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
        <div className="flex flex-col gap-7">
          <form.Subscribe selector={(state: any) => state.values.items}>
            {(items: EditorItem[]) => (
              <div className="flex flex-col gap-6">
                {items.map((item, index) => (
                  <ExperienceFieldGroup
                    form={form}
                    index={index}
                    itemId={item.clientId}
                    key={item.clientId}
                    onDelete={() => {
                      form.setFieldValue(
                        "items" as never,
                        items.filter((candidate) => candidate.clientId !== item.clientId) as never,
                      )
                    }}
                    hasSubmitted={hasSubmitted}
                    profile={profile}
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
        </div>

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

function ExperienceFieldGroup({
  form,
  hasSubmitted,
  index,
  itemId,
  onDelete,
  profile,
  section,
}: {
  form: any
  hasSubmitted: boolean
  index: number
  itemId: string
  onDelete: () => void
  profile: CareerProfileResponse
  section: EditableExperienceSection
}) {
  const { t } = useTranslation()
  const fieldLabel = (name: string) => t(`profile.formField.${name}`)
  const titleId = `profile-editor-item-${itemId}-title`
  const dateFields = (
    <>
      <TextField form={form} index={index} label={fieldLabel("startDate")} month name="startDate" />
      <EndDateField form={form} hasSubmitted={hasSubmitted} index={index} />
    </>
  )

  return (
    <FieldGroup
      aria-labelledby={titleId}
      className="grid gap-5 rounded-xl border px-4 pt-4 pb-5 md:grid-cols-2"
      data-testid={`profile-editor-item-${itemId}`}
      role="group"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 md:col-span-2">
        <p className="font-medium" id={titleId}>
          {t("profile.editor.experience", { count: index + 1 })}
        </p>
        <Button onClick={onDelete} type="button" variant="destructive">
          <Trash2Icon data-icon="inline-start" />
          {t("profile.editor.delete")}
        </Button>
      </div>

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
          <form.Field name={experienceFieldName(index, "responsibilities")}>
            {(field: any) => (
              <BulletListEditor
                description={t("profile.editor.bulletListDescription")}
                items={field.state.value ?? []}
                label={t("profile.field.responsibilities")}
                onChange={field.handleChange}
              />
            )}
          </form.Field>
          <form.Field name={experienceFieldName(index, "achievements")}>
            {(field: any) => (
              <BulletListEditor
                description={t("profile.editor.bulletListDescription")}
                items={field.state.value ?? []}
                label={t("profile.field.achievements")}
                onChange={field.handleChange}
              />
            )}
          </form.Field>
          <form.Field name={experienceFieldName(index, "skills")}>
            {(field: any) => (
              <SkillTagInput
                availableSkills={profile.skills}
                description={t("profile.editor.skillInputDescription")}
                label={t("profile.field.skills")}
                onSelectedSkillsChange={field.handleChange}
                selectedSkills={field.state.value ?? []}
              />
            )}
          </form.Field>
        </>
      ) : (
        <>
          <TextField
            form={form}
            index={index}
            label={t("profile.formField.projectName")}
            name="name"
          />
          <TextField
            form={form}
            index={index}
            label={t("profile.formField.projectRole")}
            name="role"
          />
          {dateFields}
          <form.Field name={experienceFieldName(index, "description")}>
            {(field: any) => (
              <BulletListEditor
                description={t("profile.editor.projectDescriptionHint")}
                items={field.state.value ?? []}
                label={t("profile.field.projectDescription")}
                onChange={field.handleChange}
              />
            )}
          </form.Field>
          <form.Field name={experienceFieldName(index, "achievements")}>
            {(field: any) => (
              <BulletListEditor
                description={t("profile.editor.projectAchievementsHint")}
                items={field.state.value ?? []}
                label={t("profile.field.projectAchievements")}
                onChange={field.handleChange}
              />
            )}
          </form.Field>
          <form.Field name={experienceFieldName(index, "techStack")}>
            {(field: any) => (
              <TechnologyStackInput
                description={t("profile.editor.techStackDescription")}
                label={t("profile.field.techStack")}
                onChange={field.handleChange}
                technologies={field.state.value ?? []}
              />
            )}
          </form.Field>
          <TextField form={form} index={index} label={fieldLabel("url")} name="url" />
        </>
      )}
    </FieldGroup>
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

function createDraft(profile: CareerProfileResponse, section: EditableExperienceSection) {
  switch (section) {
    case "education":
      return {
        items: structuredClone(profile.education).map((item) => ({
          ...item,
          clientId: createTemporaryId(),
          degree: item.degree ?? "",
          endDate: item.endDate ?? "",
          isCurrent: item.endDate === null,
          major: item.major ?? "",
        })),
      }
    case "workExperience":
      return {
        items: structuredClone(profile.workExperiences).map((item) => ({
          ...item,
          achievements: structuredClone(item.achievements),
          clientId: createTemporaryId(),
          endDate: item.endDate ?? "",
          employmentType: item.employmentType ?? "",
          isCurrent: item.endDate === null,
          location: item.location ?? "",
          responsibilities: structuredClone(item.responsibilities),
          skills: structuredClone(item.skills),
        })),
      }
    case "projectExperience":
      return {
        items: structuredClone(profile.projects).map((item) => ({
          ...item,
          achievements: structuredClone(item.achievements),
          clientId: createTemporaryId(),
          description: structuredClone(item.description),
          endDate: item.endDate ?? "",
          isCurrent: item.endDate === null,
          role: item.role ?? "",
          techStack: structuredClone(item.techStack),
          url: item.url ?? "",
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
    return value.items.map(({ clientId: _clientId, isCurrent, ...item }: any) => ({
      ...item,
      degree: toNullable(item.degree),
      endDate: isCurrent ? null : item.endDate.trim(),
      major: toNullable(item.major),
      startDate: item.startDate.trim(),
    }))
  }

  if (section === "workExperience") {
    return value.items.map(({ clientId: _clientId, isCurrent, ...item }: any) => ({
      ...item,
      achievements: normalizeBulletItems(item.achievements),
      employmentType: toNullable(item.employmentType) as EmploymentType | null,
      endDate: isCurrent ? null : item.endDate.trim(),
      location: toNullable(item.location),
      responsibilities: normalizeBulletItems(item.responsibilities),
      skills: normalizeTechnologyStack(item.skills),
      startDate: item.startDate.trim(),
    }))
  }

  return value.items.map(({ clientId: _clientId, isCurrent, ...item }: any) => ({
    ...item,
    achievements: normalizeBulletItems(item.achievements),
    description: normalizeBulletItems(item.description),
    endDate: isCurrent ? null : toNullable(item.endDate),
    role: toNullable(item.role),
    startDate: item.startDate.trim(),
    techStack: normalizeTechnologyStack(item.techStack),
    url: toNullable(item.url),
  }))
}

function createNewItem(section: EditableExperienceSection) {
  const base = {
    clientId: createTemporaryId(),
    endDate: "",
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
      employmentType: "",
      location: "",
      responsibilities: [],
      skills: [],
      title: "",
    }
  }

  return {
    ...base,
    achievements: [],
    description: [],
    name: "",
    role: "",
    techStack: [],
    url: "",
  }
}
