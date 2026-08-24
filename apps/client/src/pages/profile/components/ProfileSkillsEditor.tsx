import { useForm } from "@tanstack/react-form"
import { PlusIcon, Trash2Icon } from "lucide-react"
import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { DialogFooter } from "@/components/ui/dialog"
import { Field, FieldControl, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { normalizeSkillName } from "@/models/profile-text"
import type { Profile, ProfileContent } from "@/models/profile"

import { ProfileDirtyStateSync } from "./ProfileDirtyStateSync"

type SkillDraft = { name: string; rowKey: string }
type SkillFormValues = { items: SkillDraft[] }

export function ProfileSkillsEditor({
  onCancel,
  onDirtyChange,
  onSave,
  profile,
}: {
  onCancel: () => void
  onDirtyChange: (isDirty: boolean) => void
  onSave: (content: ProfileContent) => Promise<void>
  profile: Profile
}) {
  const { t } = useTranslation()
  const [saveError, setSaveError] = useState(false)
  const [duplicate, setDuplicate] = useState(false)
  const nextRowKey = useRef(0)
  const form = useForm({
    defaultValues: {
      items: profile.content.skills.map((name, index) => ({
        name,
        rowKey: `existing-${index}`,
      })),
    } satisfies SkillFormValues,
    onSubmit: async ({ value }) => {
      const rowNames = value.items.map((item) => ({
        name: item.name.trim(),
        rowKey: item.rowKey,
      }))
      const names = rowNames.map(({ name }) => name).filter(Boolean)
      const keys = names.map(normalizeSkillName)
      if (keys.length !== new Set(keys).size) {
        setDuplicate(true)
        return
      }
      setDuplicate(false)
      setSaveError(false)
      const replacements = new Map(
        profile.content.skills.map((skill, index) => [
          normalizeSkillName(skill),
          rowNames.find(({ rowKey }) => rowKey === `existing-${index}`)?.name || null,
        ]),
      )
      try {
        await onSave({
          ...profile.content,
          projectExperiences: remapSkills(profile.content.projectExperiences, replacements),
          skills: names,
          workExperiences: remapSkills(profile.content.workExperiences, replacements),
        })
      } catch {
        setSaveError(true)
      }
    },
  })

  return (
    <form
      className="grid max-h-[calc(100dvh-8.25rem)] min-h-0 grid-rows-[minmax(0,1fr)_auto]"
      data-testid="profile-editor-skills"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <div className="min-h-0 overflow-y-auto px-6 py-5">
        <FieldGroup>
          <form.Subscribe selector={(state) => state.isDirty}>
            {(isDirty) => <ProfileDirtyStateSync isDirty={isDirty} onDirtyChange={onDirtyChange} />}
          </form.Subscribe>
          <form.Subscribe selector={(state) => state.values.items}>
            {(items) => (
              <div className="grid items-start gap-4 lg:grid-cols-2">
                {items.map((item, index) => (
                  <div className="flex gap-2" key={item.rowKey}>
                    <form.Field name={`items[${index}].name`}>
                      {(field) => (
                        <Field className="min-w-0 flex-1">
                          <FieldLabel htmlFor={field.name}>{t("profile.field.skills")}</FieldLabel>
                          <FieldControl>
                            <Input
                              id={field.name}
                              onBlur={field.handleBlur}
                              onChange={(event) => field.handleChange(event.target.value)}
                              value={field.state.value}
                            />
                          </FieldControl>
                        </Field>
                      )}
                    </form.Field>
                    <Button
                      aria-label={t("profile.editor.delete")}
                      className="mt-7"
                      onClick={() =>
                        form.setFieldValue(
                          "items",
                          items.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                      size="icon"
                      type="button"
                      variant="destructive"
                    >
                      <Trash2Icon />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </form.Subscribe>
          <Button
            onClick={() =>
              form.setFieldValue("items", [
                ...form.state.values.items,
                { name: "", rowKey: `new-${nextRowKey.current++}` },
              ])
            }
            type="button"
            variant="outline"
          >
            <PlusIcon data-icon="inline-start" />
            {t("profile.editor.addSkill")}
          </Button>
        </FieldGroup>
        {duplicate && (
          <Alert className="mt-6" variant="destructive">
            <AlertDescription>{t("profile.editor.validation.duplicateSkill")}</AlertDescription>
          </Alert>
        )}
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
        <Button type="submit">{t("profile.editor.save")}</Button>
      </DialogFooter>
    </form>
  )
}

function remapSkills<T extends { skills: string[] }>(
  experiences: T[],
  replacements: Map<string, string | null>,
): T[] {
  return experiences.map((experience) => ({
    ...experience,
    skills: experience.skills
      .map((skill) => replacements.get(normalizeSkillName(skill)) ?? null)
      .filter((skill): skill is string => skill !== null),
  }))
}
