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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  educationItemSchema,
  profileEmploymentTypes as employmentTypes,
  projectItemSchema,
  workItemSchema,
} from "@/schemas/profile"
import type { EmploymentType, JobProfile, SaveProfileSectionInput } from "@/models/profile"
import type { EditableExperienceSection } from "./ProfileSectionEditDialog"

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

function joinLines(value: string[]) {
  return value.join("\n")
}

function toLines(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean)
}

function toNullable(value: string) {
  return value.trim() || null
}

function toCommaSeparatedValues(value: string) {
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
  name,
  textarea = false,
  type = "text",
}: {
  form: any
  index?: number
  label: string
  name: string
  textarea?: boolean
  type?: string
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
              {textarea ? (
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
                  type={type}
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

function CurrentField({ form, index }: { form: any; index: number }) {
  const { t } = useTranslation()
  const fieldName = `items.${index}.isCurrent`

  return (
    <form.Field name={fieldName}>
      {(field: any) => (
        <Field orientation="horizontal">
          <Checkbox
            checked={field.state.value}
            id={field.name}
            onCheckedChange={field.handleChange}
          />
          <FieldLabel htmlFor={field.name}>{t("profile.editor.current")}</FieldLabel>
        </Field>
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
  const form = useForm({
    defaultValues: createDraft(profile, section) as any,
    validators: {
      onSubmit: createSectionSchema(section) as any,
    },
    onSubmit: async ({ value }: { value: any }) => {
      setSaveError(false)

      try {
        await onSave({
          profileId: profile.profileId,
          section,
          values: normalizeSectionValues(section, value),
          version: profile.version,
        } as SaveProfileSectionInput)
      } catch {
        setSaveError(true)
      }
    },
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
  index,
  itemId,
  onDelete,
  profile,
  section,
}: {
  form: any
  index: number
  itemId: string
  onDelete: () => void
  profile: JobProfile
  section: EditableExperienceSection
}) {
  const { t } = useTranslation()
  const fieldLabel = (name: string) => t(`profile.formField.${name}`)
  const dateFields = (
    <>
      <TextField
        form={form}
        index={index}
        label={fieldLabel("startDate")}
        name="startDate"
        type="month"
      />
      <TextField
        form={form}
        index={index}
        label={fieldLabel("endDate")}
        name="endDate"
        type="month"
      />
      <CurrentField form={form} index={index} />
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
            <TextField
              form={form}
              index={index}
              label={fieldLabel("description")}
              name="description"
              textarea
            />
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
              label={t("profile.field.achievements")}
              name="achievements"
              textarea
            />
            <TextField
              form={form}
              index={index}
              label={t("profile.field.skills")}
              name="skillIds"
            />
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
        items: structuredClone(profile.education).map((item) => ({
          ...item,
          degree: item.degree ?? "",
          description: item.description ?? "",
          endDate: item.endDate ?? "",
          major: item.major ?? "",
          startDate: item.startDate ?? "",
        })),
      }
    case "workExperience":
      return {
        items: structuredClone(profile.workExperiences).map((item) => ({
          ...item,
          achievements: joinLines(item.achievements),
          endDate: item.endDate ?? "",
          location: item.location ?? "",
          responsibilities: joinLines(item.responsibilities),
          skillIds: item.skillIds.join(", "),
          startDate: item.startDate ?? "",
        })),
      }
    case "projectExperience":
      return {
        items: structuredClone(profile.projectExperiences).map((item) => ({
          ...item,
          achievements: joinLines(item.achievements),
          background: item.background ?? "",
          contributions: joinLines(item.contributions),
          endDate: item.endDate ?? "",
          projectUrl: item.projectUrl ?? "",
          relatedWorkExperienceId: item.relatedWorkExperienceId ?? "",
          responsibilities: joinLines(item.responsibilities),
          role: item.role ?? "",
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
    return value.items.map((item: any) => ({
      ...item,
      degree: toNullable(item.degree),
      description: toNullable(item.description),
      endDate: toNullable(item.endDate),
      major: toNullable(item.major),
      startDate: toNullable(item.startDate),
    }))
  }

  if (section === "workExperience") {
    return value.items.map((item: any) => ({
      ...item,
      achievements: toLines(item.achievements),
      endDate: toNullable(item.endDate),
      location: toNullable(item.location),
      responsibilities: toLines(item.responsibilities),
      skillIds: toCommaSeparatedValues(item.skillIds),
      startDate: toNullable(item.startDate),
    }))
  }

  return value.items.map((item: any) => ({
    ...item,
    achievements: toLines(item.achievements),
    background: toNullable(item.background),
    contributions: toLines(item.contributions),
    endDate: toNullable(item.endDate),
    projectUrl: toNullable(item.projectUrl),
    relatedWorkExperienceId: toNullable(item.relatedWorkExperienceId),
    responsibilities: toLines(item.responsibilities),
    role: toNullable(item.role),
    startDate: toNullable(item.startDate),
    technologies: toCommaSeparatedValues(item.technologies),
  }))
}

function createNewItem(section: EditableExperienceSection) {
  const base = {
    endDate: "",
    id: createTemporaryId(),
    isCurrent: false,
    reviewStatus: "confirmed",
    source: "userAdded",
    startDate: "",
  }

  if (section === "education") {
    return { ...base, degree: "", description: "", major: "", school: "" }
  }

  if (section === "workExperience") {
    return {
      ...base,
      achievements: "",
      company: "",
      employmentType: "fullTime" satisfies EmploymentType,
      location: "",
      responsibilities: "",
      skillIds: "",
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
