import { useForm } from "@tanstack/react-form"
import { PlusIcon, Trash2Icon } from "lucide-react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { z } from "zod"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
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
  careerDirectionSchema,
  credentialsSchema,
  profileCareerLevels as careerLevels,
  profileEmploymentTypes as employmentTypes,
  profileJobSearchStages as jobSearchStages,
  profileJobSearchTypes as jobSearchTypes,
  skillSchema,
} from "@/schemas/profile"
import type { JobProfile, SaveProfileSectionInput } from "@/models/profile"

type EditableSection = "skills" | "credentials" | "careerDirection"

type ProfileAdditionalSectionEditorProps = {
  onCancel: () => void
  onDirtyChange: (isDirty: boolean) => void
  onSave: (input: SaveProfileSectionInput) => Promise<void>
  profile: JobProfile
  section: EditableSection
}

function createTemporaryId() {
  return `draft_${crypto.randomUUID()}`
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

function translateValidationError(t: ReturnType<typeof useTranslation>["t"], error: unknown) {
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String(error.message)
      : error

  switch (message) {
    case "required":
      return t("profile.editor.validation.required")
    case "duplicateSkill":
      return t("profile.editor.validation.duplicateSkill")
    case "dateRange":
      return t("profile.editor.validation.dateRange")
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
  options,
  textarea = false,
  type = "text",
}: {
  form: any
  index?: number
  label: string
  name: string
  options?: string[]
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
                  list={options?.length ? `${field.name}-options` : undefined}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  type={type}
                  value={field.state.value ?? ""}
                />
              )}
            </FieldControl>
            {options?.length ? (
              <datalist id={`${field.name}-options`}>
                {options.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
            ) : null}
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

function CredentialTypeField({ form, index }: { form: any; index: number }) {
  const { t } = useTranslation()
  const fieldName = `items.${index}.type`

  return (
    <form.Field name={fieldName}>
      {(field: any) => (
        <Field>
          <FieldLabel htmlFor={field.name}>{t("profile.formField.credentialType")}</FieldLabel>
          <Select onValueChange={field.handleChange} value={field.state.value}>
            <FieldControl>
              <SelectTrigger id={field.name} onBlur={field.handleBlur}>
                <SelectValue />
              </SelectTrigger>
            </FieldControl>
            <SelectContent>
              <SelectItem value="certificate">{t("profile.credentialType.certificate")}</SelectItem>
              <SelectItem value="award">{t("profile.credentialType.award")}</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      )}
    </form.Field>
  )
}

function CheckboxListField({
  form,
  label,
  name,
  options,
}: {
  form: any
  label: string
  name: "employmentTypes" | "desiredLevels"
  options: readonly { label: string; value: string }[]
}) {
  return (
    <form.Field name={name}>
      {(field: any) => (
        <Field>
          <FieldLabel>{label}</FieldLabel>
          <div className="flex flex-wrap gap-x-4 gap-y-3">
            {options.map((option) => {
              const id = `${field.name}-${option.value}`
              const selected = field.state.value.includes(option.value)

              return (
                <Field key={option.value} orientation="horizontal">
                  <Checkbox
                    checked={selected}
                    id={id}
                    onCheckedChange={(checked) => {
                      field.handleChange(
                        checked
                          ? [...field.state.value, option.value]
                          : field.state.value.filter((value: string) => value !== option.value),
                      )
                    }}
                  />
                  <FieldLabel htmlFor={id}>{option.label}</FieldLabel>
                </Field>
              )
            })}
          </div>
        </Field>
      )}
    </form.Field>
  )
}

function SelectField({
  form,
  label,
  name,
  options,
}: {
  form: any
  label: string
  name: "jobSearchType" | "jobSearchStage"
  options: readonly { label: string; value: string }[]
}) {
  return (
    <form.Field name={name}>
      {(field: any) => (
        <Field>
          <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
          <Select onValueChange={field.handleChange} value={field.state.value}>
            <FieldControl>
              <SelectTrigger id={field.name} onBlur={field.handleBlur}>
                <SelectValue />
              </SelectTrigger>
            </FieldControl>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
    </form.Field>
  )
}

export function ProfileAdditionalSectionEditor({
  onCancel,
  onDirtyChange,
  onSave,
  profile,
  section,
}: ProfileAdditionalSectionEditorProps) {
  const { t } = useTranslation()
  const [saveError, setSaveError] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)
  const form = useForm({
    defaultValues: createDraft(profile, section) as any,
    validators: { onSubmit: createSectionSchema(section) as any },
    onSubmit: async ({ value }: { value: any }) => {
      setSaveError(false)
      setValidationError(null)

      if (section === "skills" && hasDuplicateSkillName(value.items)) {
        setValidationError("duplicateSkill")
        return
      }

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

  function addItem() {
    if (section === "careerDirection") {
      return
    }

    const items = form.state.values.items ?? []
    form.setFieldValue("items" as never, [...items, createNewItem(section)] as never)
  }

  function cancelEditing() {
    onDirtyChange(false)
    onCancel()
  }

  return (
    <Card data-testid={`profile-editor-${section}`}>
      <CardHeader>
        <CardTitle>{t(`profile.sections.${section}`)}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            void form.handleSubmit()
          }}
        >
          <form.Subscribe selector={(state: any) => state.isDirty}>
            {(isDirty: boolean) => (
              <DraftStateSync isDirty={isDirty} onDirtyChange={onDirtyChange} />
            )}
          </form.Subscribe>

          <FieldGroup>
            {section === "skills" ? (
              <SkillFields form={form} onAdd={addItem} profile={profile} />
            ) : section === "credentials" ? (
              <CredentialFields form={form} onAdd={addItem} />
            ) : (
              <CareerDirectionFields form={form} />
            )}
          </FieldGroup>

          {validationError && (
            <Alert className="mt-6" variant="destructive">
              <AlertDescription>{translateValidationError(t, validationError)}</AlertDescription>
            </Alert>
          )}
          <form.Subscribe selector={(state: any) => state.isDirty}>
            {(isDirty: boolean) =>
              isDirty ? (
                <Alert className="mt-6">
                  <AlertDescription>{t("profile.editor.unsavedChanges")}</AlertDescription>
                </Alert>
              ) : null
            }
          </form.Subscribe>
          {saveError && (
            <Alert className="mt-6" variant="destructive">
              <AlertDescription>{t("profile.editor.saveError")}</AlertDescription>
            </Alert>
          )}
          <EditorFooter form={form} onCancel={cancelEditing} />
        </form>
      </CardContent>
    </Card>
  )
}

function SkillFields({
  form,
  onAdd,
  profile,
}: {
  form: any
  onAdd: () => void
  profile: JobProfile
}) {
  const { t } = useTranslation()
  const categories = [
    ...new Set(profile.skills.flatMap((skill) => (skill.category ? [skill.category] : []))),
  ]

  return (
    <>
      <form.Subscribe selector={(state: any) => state.values.items}>
        {(items: any[]) => (
          <div className="flex flex-col gap-4">
            {items.map((item, index) => (
              <div
                className="grid gap-4 rounded-xl border p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
                data-testid={`profile-editor-item-${item.id}`}
                key={item.id}
              >
                <TextField
                  form={form}
                  index={index}
                  label={t("profile.field.skillName")}
                  name="name"
                />
                <TextField
                  form={form}
                  index={index}
                  label={t("profile.field.skillCategory")}
                  name="category"
                  options={categories}
                />
                <Button
                  className="self-end"
                  onClick={() => {
                    form.setFieldValue(
                      "items" as never,
                      items.filter((candidate) => candidate.id !== item.id) as never,
                    )
                  }}
                  type="button"
                  variant="destructive"
                >
                  <Trash2Icon data-icon="inline-start" />
                  {t("profile.editor.delete")}
                </Button>
              </div>
            ))}
          </div>
        )}
      </form.Subscribe>
      <Button onClick={onAdd} type="button" variant="outline">
        <PlusIcon data-icon="inline-start" />
        {t("profile.editor.addSkill")}
      </Button>
      <Alert>
        <AlertDescription>{t("profile.editor.deleteDescription")}</AlertDescription>
      </Alert>
    </>
  )
}

function CredentialFields({ form, onAdd }: { form: any; onAdd: () => void }) {
  const { t } = useTranslation()

  return (
    <>
      <form.Subscribe selector={(state: any) => state.values.items}>
        {(items: any[]) => (
          <div className="flex flex-col gap-6">
            {items.map((item, index) => (
              <div
                className="flex flex-col gap-5 rounded-xl border p-4"
                data-testid={`profile-editor-item-${item.id}`}
                key={item.id}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-medium">
                    {t("profile.editor.credential", { count: index + 1 })}
                  </p>
                  <Button
                    onClick={() => {
                      form.setFieldValue(
                        "items" as never,
                        items.filter((candidate) => candidate.id !== item.id) as never,
                      )
                    }}
                    type="button"
                    variant="destructive"
                  >
                    <Trash2Icon data-icon="inline-start" />
                    {t("profile.editor.delete")}
                  </Button>
                </div>
                <div className="grid gap-5 md:grid-cols-2">
                  <CredentialTypeField form={form} index={index} />
                  <TextField
                    form={form}
                    index={index}
                    label={t("profile.field.name")}
                    name="name"
                  />
                  <TextField
                    form={form}
                    index={index}
                    label={t("profile.field.issuer")}
                    name="issuer"
                  />
                  <TextField
                    form={form}
                    index={index}
                    label={t("profile.formField.awardedAt")}
                    name="awardedAt"
                    type="month"
                  />
                  <TextField
                    form={form}
                    index={index}
                    label={t("profile.formField.expiresAt")}
                    name="expiresAt"
                    type="month"
                  />
                  <TextField
                    form={form}
                    index={index}
                    label={t("profile.formField.credentialId")}
                    name="credentialId"
                  />
                  <TextField
                    form={form}
                    index={index}
                    label={t("profile.formField.credentialUrl")}
                    name="credentialUrl"
                  />
                  <TextField
                    form={form}
                    index={index}
                    label={t("profile.formField.description")}
                    name="description"
                    textarea
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </form.Subscribe>
      <Button onClick={onAdd} type="button" variant="outline">
        <PlusIcon data-icon="inline-start" />
        {t("profile.editor.addCredential")}
      </Button>
      <Alert>
        <AlertDescription>{t("profile.editor.deleteDescription")}</AlertDescription>
      </Alert>
    </>
  )
}

function CareerDirectionFields({ form }: { form: any }) {
  const { t } = useTranslation()

  return (
    <div className="grid gap-5 md:grid-cols-2">
      <TextField
        form={form}
        label={t("profile.field.desiredTitles")}
        name="desiredTitles"
        textarea
      />
      <TextField
        form={form}
        label={t("profile.field.desiredIndustries")}
        name="desiredIndustries"
        textarea
      />
      <TextField
        form={form}
        label={t("profile.field.desiredLocations")}
        name="desiredLocations"
        textarea
      />
      <CheckboxListField
        form={form}
        label={t("profile.field.desiredLevels")}
        name="desiredLevels"
        options={careerLevels.map((value) => ({
          label: t(`profile.careerLevel.${value}`),
          value,
        }))}
      />
      <CheckboxListField
        form={form}
        label={t("profile.field.employmentTypes")}
        name="employmentTypes"
        options={employmentTypes.map((value) => ({
          label: t(`profile.employmentType.${value}`),
          value,
        }))}
      />
      <SelectField
        form={form}
        label={t("profile.field.jobSearchType")}
        name="jobSearchType"
        options={jobSearchTypes.map((value) => ({
          label: t(`profile.jobSearchType.${value}`),
          value,
        }))}
      />
      <SelectField
        form={form}
        label={t("profile.field.jobSearchStage")}
        name="jobSearchStage"
        options={jobSearchStages.map((value) => ({
          label: t(`profile.jobSearchStage.${value}`),
          value,
        }))}
      />
      <TextField form={form} label={t("profile.field.focusAreas")} name="focusAreas" textarea />
      <TextField form={form} label={t("profile.field.summary")} name="summary" textarea />
    </div>
  )
}

function EditorFooter({ form, onCancel }: { form: any; onCancel: () => void }) {
  const { t } = useTranslation()

  return (
    <div className="mt-6 flex flex-wrap justify-end gap-2">
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
    </div>
  )
}

function createDraft(profile: JobProfile, section: EditableSection) {
  if (section === "skills") {
    return {
      items: structuredClone(profile.skills).map((item) => ({
        ...item,
        category: item.category ?? "",
      })),
    }
  }

  if (section === "credentials") {
    return {
      items: structuredClone(profile.credentials).map((item) => ({
        ...item,
        awardedAt: item.awardedAt ?? "",
        credentialId: item.credentialId ?? "",
        credentialUrl: item.credentialUrl ?? "",
        description: item.description ?? "",
        expiresAt: item.expiresAt ?? "",
        issuer: item.issuer ?? "",
      })),
    }
  }

  return {
    ...structuredClone(profile.careerDirection),
    desiredIndustries: profile.careerDirection.desiredIndustries.join("\n"),
    desiredLocations: profile.careerDirection.desiredLocations.join("\n"),
    desiredTitles: profile.careerDirection.desiredTitles.join("\n"),
    focusAreas: profile.careerDirection.focusAreas.join("\n"),
    summary: profile.careerDirection.summary ?? "",
  }
}

function createSectionSchema(section: EditableSection) {
  if (section === "skills") {
    return z.object({ items: z.array(skillSchema) })
  }

  return section === "credentials" ? credentialsSchema : careerDirectionSchema
}

function hasDuplicateSkillName(items: { name: string }[]) {
  const names = new Set<string>()

  return items.some((item) => {
    const name = item.name.trim().toLocaleLowerCase()

    if (names.has(name)) {
      return true
    }

    names.add(name)
    return false
  })
}

function normalizeSectionValues(section: EditableSection, value: any) {
  if (section === "skills") {
    return value.items.map((item: any) => ({
      ...item,
      category: toNullable(item.category),
      name: item.name.trim(),
    }))
  }

  if (section === "credentials") {
    return value.items.map((item: any) => ({
      ...item,
      awardedAt: toNullable(item.awardedAt),
      credentialId: toNullable(item.credentialId),
      credentialUrl: toNullable(item.credentialUrl),
      description: toNullable(item.description),
      expiresAt: toNullable(item.expiresAt),
      issuer: toNullable(item.issuer),
      name: item.name.trim(),
    }))
  }

  return {
    ...value,
    desiredIndustries: toLines(value.desiredIndustries),
    desiredLocations: toLines(value.desiredLocations),
    desiredTitles: toLines(value.desiredTitles),
    focusAreas: toLines(value.focusAreas),
    summary: toNullable(value.summary),
  }
}

function createNewItem(section: "skills" | "credentials") {
  const base = {
    id: createTemporaryId(),
    reviewStatus: "confirmed",
    source: "userAdded",
  }

  if (section === "skills") {
    return { ...base, category: "", name: "" }
  }

  return {
    ...base,
    awardedAt: "",
    credentialId: "",
    credentialUrl: "",
    description: "",
    expiresAt: "",
    issuer: "",
    name: "",
    type: "certificate",
  }
}
