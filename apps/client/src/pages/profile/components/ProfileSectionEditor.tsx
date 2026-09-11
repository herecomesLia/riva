import { useForm } from "@tanstack/react-form"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { z } from "zod"

import { EmploymentType } from "@/api/generated/models"

import { Field, FieldControl, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { normalizeBulletItems } from "@/lib/text"
import { normalizeSkillNames } from "../skill-names"
import { BulletListEditor } from "./BulletListEditor"
import { SkillTagInput } from "./SkillTagInput"
import { TechnologyStackInput } from "./TechnologyStackInput"
import {
  ProfileEditorForm,
  ProfileExperienceItem,
  ProfileAddExperienceButton,
  ProfileTextField,
  ProfileEndDateField,
  ProfileFieldErrors,
  type ProfileEditorProps,
} from "./ProfileEditorForm"
import type { EditableExperienceSection } from "./ProfileSectionEditDialog"

const requiredText = z.string().trim().min(1, "required")
const optionalText = z.string()
const bulletItemSchema = z.string().trim().min(1, "required")
const bulletItemsSchema = z
  .array(z.string())
  .default([])
  .transform(normalizeBulletItems)
  .pipe(z.array(bulletItemSchema))
const skillsSchema = z
  .array(z.string())
  .default([])
  .transform(normalizeSkillNames)
  .pipe(z.array(requiredText))

const dateRangeSchema = z
  .object({
    endDate: optionalText,
    isCurrent: z.boolean(),
    startDate: requiredText,
  })
  .superRefine((value, context) => {
    if (!value.isCurrent && !value.endDate) {
      context.addIssue({ code: "custom", message: "required", path: ["endDate"] })
    }
    if (!value.isCurrent && value.endDate && value.endDate < value.startDate) {
      context.addIssue({ code: "custom", message: "dateRange", path: ["endDate"] })
    }
  })

export const educationItemSchema = dateRangeSchema.extend({
  clientId: requiredText,
  degree: optionalText,
  major: optionalText,
  school: requiredText,
})

export const workItemSchema = dateRangeSchema.extend({
  achievements: bulletItemsSchema,
  clientId: requiredText,
  company: requiredText,
  employmentType: z.union([z.enum(EmploymentType), z.literal("")]),
  location: optionalText,
  responsibilities: bulletItemsSchema,
  skills: skillsSchema,
  title: requiredText,
})

export const projectItemSchema = dateRangeSchema.extend({
  achievements: bulletItemsSchema,
  clientId: requiredText,
  description: bulletItemsSchema,
  name: requiredText,
  role: optionalText,
  techStack: skillsSchema,
  url: optionalText.refine((value) => !value || URL.canParse(value), "url"),
})

type EducationDraft = z.input<typeof educationItemSchema>
type WorkDraft = z.input<typeof workItemSchema>
type ProjectDraft = z.input<typeof projectItemSchema>
const educationSchema = z.object({ items: z.array(educationItemSchema) })
const workSchema = z.object({ items: z.array(workItemSchema) })
const projectSchema = z.object({ items: z.array(projectItemSchema) })

function draftDates() {
  return { clientId: `draft_${crypto.randomUUID()}`, endDate: "", isCurrent: false, startDate: "" }
}

function toNullable(value: string) {
  return value.trim() || null
}

export function ProfileSectionEditor({
  section,
  ...props
}: ProfileEditorProps & { section: EditableExperienceSection }) {
  switch (section) {
    case "education":
      return <EducationEditor {...props} />
    case "workExperience":
      return <WorkExperienceEditor {...props} />
    case "projectExperience":
      return <ProjectExperienceEditor {...props} />
  }
}

function EducationEditor(props: ProfileEditorProps) {
  const { t } = useTranslation()
  const [saveError, setSaveError] = useState(false)
  const form = useForm({
    defaultValues: {
      items: props.profile.education.map((item): EducationDraft => ({
        ...item,
        clientId: `draft_${crypto.randomUUID()}`,
        degree: item.degree ?? "",
        major: item.major ?? "",
        endDate: item.endDate ?? "",
        isCurrent: item.endDate === null,
      })),
    },
    validators: { onChange: educationSchema, onSubmit: educationSchema },
    onSubmit: async ({ value }) => {
      setSaveError(false)
      try {
        const education = educationSchema
          .parse(value)
          .items.map(({ clientId: _clientId, isCurrent, ...item }) => ({
            ...item,
            degree: toNullable(item.degree),
            major: toNullable(item.major),
            endDate: isCurrent ? null : item.endDate.trim(),
          }))
        await props.onSave({ education })
      } catch {
        setSaveError(true)
      }
    },
  })
  return (
    <form.Subscribe
      selector={(state) => [state.values.items, state.isDirty, state.isSubmitting] as const}
    >
      {([items, isDirty, isSubmitting]) => (
        <ProfileEditorForm
          {...props}
          section="education"
          isDirty={isDirty}
          isSubmitting={isSubmitting}
          onSubmit={form.handleSubmit}
          error={saveError && t("profile.editor.saveError")}
        >
          <div className="flex flex-col gap-6">
            {items.map((item, index) => (
              <ProfileExperienceItem
                clientId={item.clientId}
                index={index}
                key={item.clientId}
                onDelete={() => form.removeFieldValue("items", index)}
              >
                {(["school", "degree", "major"] as const).map((name) => (
                  <form.Field key={name} name={`items[${index}].${name}`}>
                    {(field) => (
                      <ProfileTextField field={field} label={t(`profile.formField.${name}`)} />
                    )}
                  </form.Field>
                ))}
                <form.Field name={`items[${index}].startDate`}>
                  {(field) => (
                    <ProfileTextField
                      field={field}
                      label={t("profile.formField.startDate")}
                      month
                    />
                  )}
                </form.Field>
                <form.Field name={`items[${index}].endDate`}>
                  {(endDate) => (
                    <form.Field name={`items[${index}].isCurrent`}>
                      {(isCurrent) => (
                        <ProfileEndDateField endDate={endDate} isCurrent={isCurrent} />
                      )}
                    </form.Field>
                  )}
                </form.Field>
              </ProfileExperienceItem>
            ))}
            <ProfileAddExperienceButton
              onClick={() =>
                form.pushFieldValue("items", { ...draftDates(), degree: "", major: "", school: "" })
              }
            />
          </div>
        </ProfileEditorForm>
      )}
    </form.Subscribe>
  )
}

function WorkExperienceEditor(props: ProfileEditorProps) {
  const { t } = useTranslation()
  const [saveError, setSaveError] = useState(false)
  const form = useForm({
    defaultValues: {
      items: props.profile.workExperiences.map((item): WorkDraft => ({
        ...structuredClone(item),
        clientId: `draft_${crypto.randomUUID()}`,
        endDate: item.endDate ?? "",
        isCurrent: item.endDate === null,
        employmentType: item.employmentType ?? "",
        location: item.location ?? "",
      })),
    },
    validators: { onChange: workSchema, onSubmit: workSchema },
    onSubmit: async ({ value }) => {
      setSaveError(false)
      try {
        const workExperiences = workSchema
          .parse(value)
          .items.map(({ clientId: _clientId, isCurrent, ...item }) => ({
            ...item,
            employmentType: item.employmentType || null,
            location: toNullable(item.location),
            endDate: isCurrent ? null : item.endDate.trim(),
          }))
        const skills = [
          ...new Set([...props.profile.skills, ...workExperiences.flatMap((item) => item.skills)]),
        ]
        await props.onSave({ skills, workExperiences })
      } catch {
        setSaveError(true)
      }
    },
  })
  return (
    <form.Subscribe
      selector={(state) => [state.values.items, state.isDirty, state.isSubmitting] as const}
    >
      {([items, isDirty, isSubmitting]) => (
        <ProfileEditorForm
          {...props}
          section="workExperience"
          isDirty={isDirty}
          isSubmitting={isSubmitting}
          onSubmit={form.handleSubmit}
          error={saveError && t("profile.editor.saveError")}
        >
          <div className="flex flex-col gap-6">
            {items.map((item, index) => (
              <ProfileExperienceItem
                clientId={item.clientId}
                index={index}
                key={item.clientId}
                onDelete={() => form.removeFieldValue("items", index)}
              >
                {(["company", "title"] as const).map((name) => (
                  <form.Field key={name} name={`items[${index}].${name}`}>
                    {(field) => (
                      <ProfileTextField field={field} label={t(`profile.formField.${name}`)} />
                    )}
                  </form.Field>
                ))}
                <form.Field name={`items[${index}].employmentType`}>
                  {(field) => (
                    <Field invalid={field.state.meta.isTouched && !field.state.meta.isValid}>
                      <FieldLabel htmlFor={field.name}>
                        {t("profile.field.employmentTypes")}
                      </FieldLabel>
                      <Select
                        items={[
                          { value: "", label: t("profile.field.notProvided") },
                          ...Object.values(EmploymentType).map((value) => ({
                            value,
                            label: t(`profile.employmentType.${value}`),
                          })),
                        ]}
                        value={field.state.value}
                        onValueChange={(value) => field.handleChange(value ?? "")}
                      >
                        <FieldControl>
                          <SelectTrigger id={field.name} onBlur={field.handleBlur}>
                            <SelectValue />
                          </SelectTrigger>
                        </FieldControl>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value="">{t("profile.field.notProvided")}</SelectItem>
                            {Object.values(EmploymentType).map((type) => (
                              <SelectItem key={type} value={type}>
                                {t(`profile.employmentType.${type}`)}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <ProfileFieldErrors errors={field.state.meta.errors} />
                    </Field>
                  )}
                </form.Field>
                <form.Field name={`items[${index}].location`}>
                  {(field) => (
                    <ProfileTextField field={field} label={t("profile.field.location")} />
                  )}
                </form.Field>
                <form.Field name={`items[${index}].startDate`}>
                  {(field) => (
                    <ProfileTextField
                      field={field}
                      label={t("profile.formField.startDate")}
                      month
                    />
                  )}
                </form.Field>
                <form.Field name={`items[${index}].endDate`}>
                  {(endDate) => (
                    <form.Field name={`items[${index}].isCurrent`}>
                      {(isCurrent) => (
                        <ProfileEndDateField endDate={endDate} isCurrent={isCurrent} />
                      )}
                    </form.Field>
                  )}
                </form.Field>
                {(["responsibilities", "achievements"] as const).map((name) => (
                  <form.Field key={name} name={`items[${index}].${name}`}>
                    {(field) => (
                      <BulletListEditor
                        description={t("profile.editor.bulletListDescription")}
                        items={field.state.value ?? []}
                        label={t(`profile.field.${name}`)}
                        onChange={field.handleChange}
                      />
                    )}
                  </form.Field>
                ))}
                <form.Field name={`items[${index}].skills`}>
                  {(field) => (
                    <SkillTagInput
                      availableSkills={props.profile.skills}
                      description={t("profile.editor.skillInputDescription")}
                      label={t("profile.field.skills")}
                      onSelectedSkillsChange={field.handleChange}
                      selectedSkills={field.state.value ?? []}
                    />
                  )}
                </form.Field>
              </ProfileExperienceItem>
            ))}
            <ProfileAddExperienceButton
              onClick={() =>
                form.pushFieldValue("items", {
                  ...draftDates(),
                  company: "",
                  title: "",
                  employmentType: "",
                  location: "",
                  responsibilities: [],
                  achievements: [],
                  skills: [],
                })
              }
            />
          </div>
        </ProfileEditorForm>
      )}
    </form.Subscribe>
  )
}

function ProjectExperienceEditor(props: ProfileEditorProps) {
  const { t } = useTranslation()
  const [saveError, setSaveError] = useState(false)
  const form = useForm({
    defaultValues: {
      items: props.profile.projects.map((item): ProjectDraft => ({
        ...structuredClone(item),
        clientId: `draft_${crypto.randomUUID()}`,
        endDate: item.endDate ?? "",
        isCurrent: item.endDate === null,
        role: item.role ?? "",
        url: item.url ?? "",
      })),
    },
    validators: { onChange: projectSchema, onSubmit: projectSchema },
    onSubmit: async ({ value }) => {
      setSaveError(false)
      try {
        const projects = projectSchema
          .parse(value)
          .items.map(({ clientId: _clientId, isCurrent, ...item }) => ({
            ...item,
            role: toNullable(item.role),
            url: toNullable(item.url),
            endDate: isCurrent ? null : toNullable(item.endDate),
          }))
        await props.onSave({ projects })
      } catch {
        setSaveError(true)
      }
    },
  })
  return (
    <form.Subscribe
      selector={(state) => [state.values.items, state.isDirty, state.isSubmitting] as const}
    >
      {([items, isDirty, isSubmitting]) => (
        <ProfileEditorForm
          {...props}
          section="projectExperience"
          isDirty={isDirty}
          isSubmitting={isSubmitting}
          onSubmit={form.handleSubmit}
          error={saveError && t("profile.editor.saveError")}
        >
          <div className="flex flex-col gap-6">
            {items.map((item, index) => (
              <ProfileExperienceItem
                clientId={item.clientId}
                index={index}
                key={item.clientId}
                onDelete={() => form.removeFieldValue("items", index)}
              >
                {(["name", "role"] as const).map((name) => (
                  <form.Field key={name} name={`items[${index}].${name}`}>
                    {(field) => (
                      <ProfileTextField
                        field={field}
                        label={t(
                          name === "name"
                            ? "profile.formField.projectName"
                            : "profile.formField.projectRole",
                        )}
                      />
                    )}
                  </form.Field>
                ))}
                <form.Field name={`items[${index}].startDate`}>
                  {(field) => (
                    <ProfileTextField
                      field={field}
                      label={t("profile.formField.startDate")}
                      month
                    />
                  )}
                </form.Field>
                <form.Field name={`items[${index}].endDate`}>
                  {(endDate) => (
                    <form.Field name={`items[${index}].isCurrent`}>
                      {(isCurrent) => (
                        <ProfileEndDateField endDate={endDate} isCurrent={isCurrent} />
                      )}
                    </form.Field>
                  )}
                </form.Field>
                {(["description", "achievements"] as const).map((name) => (
                  <form.Field key={name} name={`items[${index}].${name}`}>
                    {(field) => (
                      <BulletListEditor
                        description={t(
                          name === "description"
                            ? "profile.editor.projectDescriptionHint"
                            : "profile.editor.projectAchievementsHint",
                        )}
                        items={field.state.value ?? []}
                        label={t(
                          name === "description"
                            ? "profile.field.projectDescription"
                            : "profile.field.projectAchievements",
                        )}
                        onChange={field.handleChange}
                      />
                    )}
                  </form.Field>
                ))}
                <form.Field name={`items[${index}].techStack`}>
                  {(field) => (
                    <TechnologyStackInput
                      description={t("profile.editor.techStackDescription")}
                      label={t("profile.field.techStack")}
                      onChange={field.handleChange}
                      technologies={field.state.value ?? []}
                    />
                  )}
                </form.Field>
                <form.Field name={`items[${index}].url`}>
                  {(field) => <ProfileTextField field={field} label={t("profile.formField.url")} />}
                </form.Field>
              </ProfileExperienceItem>
            ))}
            <ProfileAddExperienceButton
              onClick={() =>
                form.pushFieldValue("items", {
                  ...draftDates(),
                  name: "",
                  role: "",
                  description: [],
                  achievements: [],
                  techStack: [],
                  url: "",
                })
              }
            />
          </div>
        </ProfileEditorForm>
      )}
    </form.Subscribe>
  )
}
