import { useForm } from "@tanstack/react-form"
import { PlusIcon, Trash2Icon } from "lucide-react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { z } from "zod"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
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
import { credentialsSchema, skillSchema } from "@/schemas/profile"
import type { JobProfile, SaveProfileSectionInput } from "@/models/profile"
import type { EditableAdditionalSection } from "./ProfileSectionEditDialog"

type ProfileAdditionalSectionEditorProps = {
  onCancel: () => void
  onDirtyChange: (isDirty: boolean) => void
  onSave: (input: SaveProfileSectionInput) => Promise<void>
  profile: JobProfile
  section: EditableAdditionalSection
}

function createTemporaryId() {
  return `draft_${crypto.randomUUID()}`
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
    const items = form.state.values.items ?? []
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
          {section === "skills" ? (
            <SkillFields form={form} onAdd={addItem} />
          ) : (
            <CredentialFields form={form} onAdd={addItem} />
          )}
        </FieldGroup>

        {validationError && (
          <Alert className="mt-6" variant="destructive">
            <AlertDescription>{translateValidationError(t, validationError)}</AlertDescription>
          </Alert>
        )}
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

function SkillFields({ form, onAdd }: { form: any; onAdd: () => void }) {
  const { t } = useTranslation()

  return (
    <>
      <form.Subscribe selector={(state: any) => state.values.items}>
        {(items: any[]) => (
          <div className="grid items-start gap-4 lg:grid-cols-2">
            {items.map((item, index) => (
              <div
                className="grid min-w-0 gap-3 rounded-xl border p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
                data-testid={`profile-editor-item-${item.id}`}
                key={item.id}
              >
                <TextField
                  form={form}
                  index={index}
                  label={t("profile.field.skillName")}
                  name="name"
                />
                <Button
                  className="justify-self-start sm:justify-self-end"
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
                    month
                    name="awardedAt"
                  />
                  <TextField
                    form={form}
                    index={index}
                    label={t("profile.formField.expiresAt")}
                    month
                    name="expiresAt"
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
    </>
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

function createDraft(profile: JobProfile, section: EditableAdditionalSection) {
  if (section === "skills") {
    return {
      items: structuredClone(profile.skills).map(({ source: _source, ...item }) => item),
    }
  }

  return {
    items: structuredClone(profile.credentials).map(({ source: _source, ...item }) => ({
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

function createSectionSchema(section: EditableAdditionalSection) {
  if (section === "skills") {
    return z.object({ items: z.array(skillSchema) })
  }

  return credentialsSchema
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

function normalizeSectionValues(section: EditableAdditionalSection, value: any) {
  if (section === "skills") {
    return value.items.map(({ source: _source, ...item }: any) => ({
      ...item,
      name: item.name.trim(),
    }))
  }

  return value.items.map(({ source: _source, ...item }: any) => ({
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

function createNewItem(section: "skills" | "credentials") {
  const base = {
    id: createTemporaryId(),
  }

  if (section === "skills") {
    return { ...base, name: "" }
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
