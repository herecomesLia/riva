import { useForm } from "@tanstack/react-form"
import { PlusIcon, Trash2Icon } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { z } from "zod"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { ProfileEditorForm, ProfileTextField, type ProfileEditorProps } from "./ProfileEditorForm"

export const skillSchema = z.object({
  clientId: z.string().trim().min(1, "required"),
  name: z.string().trim().min(1, "required"),
})

const skillsSchema = z.object({ items: z.array(skillSchema) })

export function SkillsEditor(props: ProfileEditorProps) {
  const { t } = useTranslation()
  const [saveError, setSaveError] = useState(false)
  const [hasDuplicate, setHasDuplicate] = useState(false)
  const form = useForm({
    defaultValues: {
      items: props.profile.skills.map((name) => ({
        clientId: `draft_${crypto.randomUUID()}`,
        name,
      })),
    },
    validators: { onSubmit: skillsSchema },
    onSubmit: async ({ value }) => {
      setSaveError(false)
      const skills = skillsSchema.parse(value).items.map((item) => item.name)
      const names = skills.map((name) => name.toLocaleLowerCase())
      const duplicate = new Set(names).size !== names.length
      setHasDuplicate(duplicate)
      if (duplicate) return

      try {
        const allowedSkills = new Set(skills)
        await props.onSave({
          skills,
          workExperiences: props.profile.workExperiences.map((experience) => ({
            ...experience,
            skills: experience.skills.filter((skill) => allowedSkills.has(skill)),
          })),
        })
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
          section="skills"
          isDirty={isDirty}
          isSubmitting={isSubmitting}
          onSubmit={form.handleSubmit}
          error={saveError && t("profile.editor.saveError")}
        >
          <FieldGroup>
            <div className="grid items-start gap-4 lg:grid-cols-2">
              {items.map((item, index) => (
                <div
                  className="grid min-w-0 gap-3 rounded-xl border p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
                  data-testid={`profile-editor-item-${item.clientId}`}
                  key={item.clientId}
                >
                  <form.Field name={`items[${index}].name`}>
                    {(field) => (
                      <ProfileTextField field={field} label={t("profile.field.skillName")} />
                    )}
                  </form.Field>
                  <Button
                    className="justify-self-start sm:justify-self-end"
                    onClick={() => form.removeFieldValue("items", index)}
                    type="button"
                    variant="destructive"
                  >
                    <Trash2Icon data-icon="inline-start" />
                    {t("profile.editor.delete")}
                  </Button>
                </div>
              ))}
            </div>
            <Button
              onClick={() =>
                form.pushFieldValue("items", { clientId: `draft_${crypto.randomUUID()}`, name: "" })
              }
              type="button"
              variant="outline"
            >
              <PlusIcon data-icon="inline-start" />
              {t("profile.editor.addSkill")}
            </Button>
          </FieldGroup>
          {hasDuplicate && (
            <Alert className="mt-6" variant="destructive">
              <AlertDescription>{t("profile.editor.validation.duplicateSkill")}</AlertDescription>
            </Alert>
          )}
        </ProfileEditorForm>
      )}
    </form.Subscribe>
  )
}
