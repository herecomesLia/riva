import { useForm } from "@tanstack/react-form"
import { PlusIcon, Trash2Icon } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DialogFooter } from "@/components/ui/dialog"
import { Field, FieldControl, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { LocalizedMonthPicker } from "@/components/ui/month-picker"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { EmploymentType, Profile, ProfileContent, ProfileSection } from "@/models/profile"

import { BulletListEditor } from "./BulletListEditor"
import { ProfileDirtyStateSync } from "./ProfileDirtyStateSync"
import { SkillTagInput } from "./SkillTagInput"

type ProfileSectionEditorProps = {
  onCancel: () => void
  onDirtyChange: (isDirty: boolean) => void
  onSave: (content: ProfileContent) => Promise<void>
  profile: Profile
  section: Exclude<ProfileSection, "skills">
}

type ProfileFormItem = {
  achievements?: string[]
  company?: string | null
  degree?: string | null
  employmentType?: EmploymentType | null
  endDate: string
  isCurrent: boolean
  location?: string | null
  major?: string | null
  name?: string | null
  projectUrl?: string | null
  responsibilities?: string[]
  role?: string | null
  school?: string | null
  skills?: string[]
  startDate: string
  title?: string | null
}

type ProfileFormValues = { items: ProfileFormItem[] }
type TextFieldName =
  | "company"
  | "degree"
  | "endDate"
  | "location"
  | "major"
  | "name"
  | "projectUrl"
  | "role"
  | "school"
  | "startDate"
  | "title"

type ProfileFieldName<K extends keyof ProfileFormItem = keyof ProfileFormItem> =
  `items[${number}].${K & string}`

function profileFieldName<K extends keyof ProfileFormItem>(
  index: number,
  name: K,
): ProfileFieldName<K> {
  return `items[${index}].${name}` as ProfileFieldName<K>
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
  const [availableSkills, setAvailableSkills] = useState<string[]>(
    structuredClone(profile.content.skills),
  )
  const form = useForm({
    defaultValues: { items: createDraft(profile, section) } satisfies ProfileFormValues,
    onSubmit: async ({ value }) => {
      setSaveError(false)
      try {
        const content = {
          ...profile.content,
          skills: section === "education" ? profile.content.skills : availableSkills,
        }
        if (section === "education") content.education = toContentItems(value.items, section)
        if (section === "workExperience") {
          content.workExperiences = toContentItems(value.items, section)
        }
        if (section === "projectExperience") {
          content.projectExperiences = toContentItems(value.items, section)
        }
        await onSave(content)
      } catch {
        setSaveError(true)
      }
    },
  })

  function addItem() {
    form.setFieldValue("items", [...form.state.values.items, createNewItem(section)])
  }

  function renderTextField(index: number, label: string, name: TextFieldName, month = false) {
    const fieldName = profileFieldName(index, name)
    return (
      <form.Field name={fieldName}>
        {(field) => (
          <Field>
            <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
            <FieldControl>
              {month ? (
                <LocalizedMonthPicker
                  id={field.name}
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
          </Field>
        )}
      </form.Field>
    )
  }

  function renderCurrentDateFields(index: number) {
    return (
      <>
        {renderTextField(index, t("profile.formField.startDate"), "startDate", true)}
        <form.Field name={profileFieldName(index, "isCurrent")}>
          {(currentField) => (
            <div className="flex flex-col gap-3">
              {renderTextField(index, t("profile.formField.endDate"), "endDate", true)}
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={currentField.state.value}
                  onCheckedChange={(checked) => currentField.handleChange(checked === true)}
                />
                {t("profile.field.present")}
              </label>
            </div>
          )}
        </form.Field>
      </>
    )
  }

  function renderEmploymentField(index: number) {
    const types: EmploymentType[] = ["fullTime", "partTime", "internship", "contract", "freelance"]
    return (
      <form.Field name={profileFieldName(index, "employmentType")}>
        {(field) => (
          <Field>
            <FieldLabel htmlFor={field.name}>{t("profile.field.employmentTypes")}</FieldLabel>
            <Select onValueChange={field.handleChange} value={field.state.value ?? undefined}>
              <FieldControl>
                <SelectTrigger id={field.name} onBlur={field.handleBlur}>
                  <SelectValue />
                </SelectTrigger>
              </FieldControl>
              <SelectContent>
                {types.map((type) => (
                  <SelectItem key={type} value={type}>
                    {t(`profile.employmentType.${type}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
      </form.Field>
    )
  }

  function renderExperienceFields(index: number) {
    const field = <K extends keyof ProfileFormItem>(name: K) => profileFieldName(index, name)
    return (
      <div
        className="flex flex-col gap-5 rounded-xl border p-4"
        data-testid={`profile-editor-item-${index}`}
        key={index}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-medium">{t("profile.editor.experience", { count: index + 1 })}</p>
          <Button
            onClick={() =>
              form.setFieldValue(
                "items",
                form.state.values.items.filter((_, itemIndex) => itemIndex !== index),
              )
            }
            type="button"
            variant="destructive"
          >
            <Trash2Icon data-icon="inline-start" />
            {t("profile.editor.delete")}
          </Button>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          {section === "education" ? (
            <>
              {renderTextField(index, t("profile.formField.school"), "school")}
              {renderTextField(index, t("profile.formField.degree"), "degree")}
              {renderTextField(index, t("profile.formField.major"), "major")}
              {renderCurrentDateFields(index)}
            </>
          ) : (
            <>
              {renderTextField(
                index,
                t(`profile.formField.${section === "workExperience" ? "company" : "projectName"}`),
                section === "workExperience" ? "company" : "name",
              )}
              {renderTextField(
                index,
                t(`profile.formField.${section === "workExperience" ? "title" : "projectRole"}`),
                section === "workExperience" ? "title" : "role",
              )}
              {section === "workExperience" && renderEmploymentField(index)}
              {section === "workExperience" &&
                renderTextField(index, t("profile.field.location"), "location")}
              {renderCurrentDateFields(index)}
              <form.Field name={field("responsibilities")}>
                {(responsibilities) => (
                  <BulletListEditor
                    description={t("profile.editor.bulletListDescription")}
                    items={responsibilities.state.value ?? []}
                    label={t(
                      section === "workExperience"
                        ? "profile.field.responsibilities"
                        : "profile.field.projectDescription",
                    )}
                    onChange={responsibilities.handleChange}
                  />
                )}
              </form.Field>
              <form.Field name={field("achievements")}>
                {(achievements) => (
                  <BulletListEditor
                    description={t("profile.editor.bulletListDescription")}
                    items={achievements.state.value ?? []}
                    label={t(
                      section === "workExperience"
                        ? "profile.field.achievements"
                        : "profile.field.projectAchievements",
                    )}
                    onChange={achievements.handleChange}
                  />
                )}
              </form.Field>
              <form.Field name={field("skills")}>
                {(skills) => (
                  <SkillTagInput
                    availableSkills={availableSkills}
                    description={t("profile.editor.skillInputDescription")}
                    label={t(
                      section === "workExperience"
                        ? "profile.field.skills"
                        : "profile.field.technologyStack",
                    )}
                    onAvailableSkillsChange={setAvailableSkills}
                    onSelectedSkillsChange={skills.handleChange}
                    selectedSkills={skills.state.value ?? []}
                  />
                )}
              </form.Field>
              {section === "projectExperience" &&
                renderTextField(index, t("profile.formField.projectUrl"), "projectUrl")}
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <form
      className="grid max-h-[calc(100dvh-8.25rem)] min-h-0 grid-rows-[minmax(0,1fr)_auto]"
      data-testid={`profile-editor-${section}`}
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <div className="min-h-0 overflow-y-auto px-6 py-5">
        <form.Subscribe selector={(state) => state.isDirty}>
          {(isDirty) => <ProfileDirtyStateSync isDirty={isDirty} onDirtyChange={onDirtyChange} />}
        </form.Subscribe>
        <FieldGroup>
          <form.Subscribe selector={(state) => state.values.items}>
            {(items) => (
              <div className="flex flex-col gap-6">
                {items.map((_, index) => renderExperienceFields(index))}
              </div>
            )}
          </form.Subscribe>
          <Button onClick={addItem} type="button" variant="outline">
            <PlusIcon data-icon="inline-start" />
            {t("profile.editor.addExperience")}
          </Button>
        </FieldGroup>
        {saveError && (
          <Alert className="mt-6" variant="destructive">
            <AlertDescription>{t("profile.editor.saveError")}</AlertDescription>
          </Alert>
        )}
      </div>
      <DialogFooter className="border-t bg-popover px-6 py-4">
        <Button onClick={onCancel} type="button" variant="outline">
          {t("profile.editor.cancel")}
        </Button>
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button disabled={isSubmitting} type="submit">
              {isSubmitting ? t("profile.editor.saving") : t("profile.editor.save")}
            </Button>
          )}
        </form.Subscribe>
      </DialogFooter>
    </form>
  )
}

function createDraft(
  profile: Profile,
  section: Exclude<ProfileSection, "skills">,
): ProfileFormItem[] {
  if (section === "education") {
    return profile.content.education.map((item) => ({
      ...item,
      degree: item.degree ?? "",
      endDate: item.endDate ?? "",
      major: item.major ?? "",
      startDate: item.startDate ?? "",
    }))
  }
  const items =
    section === "workExperience"
      ? profile.content.workExperiences
      : profile.content.projectExperiences
  return items.map((item) => ({
    ...item,
    achievements: [...item.achievements],
    endDate: item.endDate ?? "",
    isCurrent: item.isCurrent,
    projectUrl: "projectUrl" in item ? (item.projectUrl ?? "") : undefined,
    responsibilities: [...item.responsibilities],
    role: "role" in item ? (item.role ?? "") : undefined,
    skills: [...item.skills],
    startDate: item.startDate ?? "",
  }))
}

function toContentItems(items: ProfileFormItem[], section: "education"): ProfileContent["education"]
function toContentItems(
  items: ProfileFormItem[],
  section: "workExperience",
): ProfileContent["workExperiences"]
function toContentItems(
  items: ProfileFormItem[],
  section: "projectExperience",
): ProfileContent["projectExperiences"]
function toContentItems(items: ProfileFormItem[], section: Exclude<ProfileSection, "skills">) {
  return items.map((item) => {
    const common = {
      endDate: item.isCurrent ? null : item.endDate || null,
      isCurrent: Boolean(item.isCurrent),
      startDate: item.startDate || null,
    }
    if (section === "education") {
      return {
        ...common,
        degree: item.degree || null,
        major: item.major || null,
        school: item.school ?? "",
      }
    }
    if (section === "workExperience") {
      return {
        ...common,
        achievements: item.achievements ?? [],
        company: item.company ?? "",
        employmentType: item.employmentType ?? null,
        location: item.location || null,
        responsibilities: item.responsibilities ?? [],
        skills: item.skills ?? [],
        title: item.title ?? "",
      }
    }
    return {
      ...common,
      achievements: item.achievements ?? [],
      name: item.name ?? "",
      projectUrl: item.projectUrl || null,
      responsibilities: item.responsibilities ?? [],
      role: item.role || null,
      skills: item.skills ?? [],
    }
  })
}

function createNewItem(section: Exclude<ProfileSection, "skills">): ProfileFormItem {
  const dates = { endDate: "", isCurrent: false, startDate: "" }
  if (section === "education") return { ...dates, degree: "", major: "", school: "" }
  if (section === "workExperience") {
    return {
      ...dates,
      achievements: [],
      company: "",
      employmentType: "fullTime" satisfies EmploymentType,
      location: "",
      responsibilities: [],
      skills: [],
      title: "",
    }
  }
  return {
    ...dates,
    achievements: [],
    name: "",
    projectUrl: "",
    responsibilities: [],
    role: "",
    skills: [],
  }
}
