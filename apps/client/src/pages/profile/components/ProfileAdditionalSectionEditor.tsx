import { useForm } from "@tanstack/react-form"
import { PlusIcon, Trash2Icon } from "lucide-react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { z } from "zod"

import type { CareerProfileResponse, UpdateCareerProfileRequest } from "@/api/generated/models"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { DialogFooter } from "@/components/ui/dialog"
import { Field, FieldControl, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { skillSchema } from "@/schemas/profile"

type ProfileAdditionalSectionEditorProps = {
  onCancel: () => void
  onDirtyChange: (isDirty: boolean) => void
  onSave: (input: UpdateCareerProfileRequest) => Promise<void>
  profile: CareerProfileResponse
  section: "skills"
}

function createTemporaryId() {
  return `draft_${crypto.randomUUID()}`
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
}: {
  form: any
  index?: number
  label: string
  name: string
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
              <Input
                id={field.name}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                value={field.state.value ?? ""}
              />
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
    defaultValues: {
      items: structuredClone(profile.skills).map((name) => ({
        clientId: createTemporaryId(),
        name,
      })),
    },
    validators: { onSubmit: z.object({ items: z.array(skillSchema) }) },
    onSubmit: async ({ value }: { value: any }) => {
      setSaveError(false)
      setValidationError(null)

      if (hasDuplicateSkillName(value.items)) {
        setValidationError("duplicateSkill")
        return
      }

      try {
        const skills = value.items.map((item: { name: string }) => item.name.trim())
        const allowedSkills = new Set(skills)
        await onSave({
          skills,
          workExperiences: profile.workExperiences.map((experience) => ({
            ...experience,
            skills: experience.skills.filter((skill) => allowedSkills.has(skill)),
          })),
        })
      } catch {
        setSaveError(true)
      }
    },
  })

  function addItem() {
    const items = form.state.values.items ?? []
    form.setFieldValue(
      "items" as never,
      [...items, { clientId: createTemporaryId(), name: "" }] as never,
    )
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
          <SkillFields form={form} onAdd={addItem} />
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
                data-testid={`profile-editor-item-${item.clientId}`}
                key={item.clientId}
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
                      items.filter((candidate) => candidate.clientId !== item.clientId) as never,
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
