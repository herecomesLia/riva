import { useForm } from "@tanstack/react-form"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { z } from "zod"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldControl, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import type { SaveTargetRoleJobDescriptionInput, TargetRole } from "@/models/roles"

import { getRolesActionErrorCode } from "../roles-errors"

const jobDescriptionSchema = z.object({ rawText: z.string().trim().min(1, "required") })

export function JobDescriptionEditorDialog({
  onDirtyChange,
  onOpenChange,
  onSave,
  onSaved,
  open,
  parsingSupported = true,
  role,
}: {
  onDirtyChange: (isDirty: boolean) => void
  onOpenChange: (open: boolean) => void
  onSave: (input: SaveTargetRoleJobDescriptionInput) => Promise<void>
  onSaved: () => void
  open: boolean
  parsingSupported?: boolean
  role: TargetRole | null
}) {
  const { t } = useTranslation()

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-xl">
            {t(
              role?.jobDescription.status === "missing"
                ? "roles.jd.editor.addTitle"
                : "roles.jd.editor.replaceTitle",
            )}
          </DialogTitle>
          <DialogDescription>
            {t(
              parsingSupported
                ? "roles.jd.editor.description"
                : "roles.jd.editor.saveOnlyDescription",
            )}
          </DialogDescription>
        </DialogHeader>
        {role && (
          <JobDescriptionEditorForm
            key={`${role.id}-${role.jobDescription.version ?? "missing"}`}
            onDirtyChange={onDirtyChange}
            onOpenChange={onOpenChange}
            onSave={onSave}
            onSaved={onSaved}
            parsingSupported={parsingSupported}
            role={role}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function JobDescriptionEditorForm({
  onDirtyChange,
  onOpenChange,
  onSave,
  onSaved,
  parsingSupported,
  role,
}: {
  onDirtyChange: (isDirty: boolean) => void
  onOpenChange: (open: boolean) => void
  onSave: (input: SaveTargetRoleJobDescriptionInput) => Promise<void>
  onSaved: () => void
  parsingSupported: boolean
  role: TargetRole
}) {
  const { t } = useTranslation()
  const [saveError, setSaveError] = useState<"requestFailed" | "versionConflict" | null>(null)
  const form = useForm({
    defaultValues: { rawText: role.jobDescription.rawText ?? "" },
    validators: { onSubmit: jobDescriptionSchema },
    onSubmit: async ({ value }) => {
      setSaveError(null)
      try {
        await onSave({ roleId: role.id, version: role.version, rawText: value.rawText.trim() })
        onSaved()
      } catch (error) {
        setSaveError(getRolesActionErrorCode(error))
      }
    },
  })

  return (
    <form
      className="flex flex-col gap-6"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.Subscribe selector={(state) => state.isDirty}>
        {(isDirty) => <DraftStateSync isDirty={isDirty} onDirtyChange={onDirtyChange} />}
      </form.Subscribe>
      <FieldGroup>
        <form.Field name="rawText">
          {(field) => {
            const invalid = field.state.meta.isTouched && !field.state.meta.isValid
            return (
              <Field invalid={invalid}>
                <FieldLabel htmlFor={field.name}>{t("roles.jd.editor.fieldLabel")}</FieldLabel>
                <FieldControl>
                  <Textarea
                    aria-invalid={invalid || undefined}
                    aria-required="true"
                    className="min-h-72 resize-y"
                    id={field.name}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    placeholder={t("roles.jd.editor.placeholder")}
                    value={field.state.value}
                  />
                </FieldControl>
                <FieldError
                  errors={field.state.meta.errors.map(() => ({
                    message: t("roles.jd.editor.required"),
                  }))}
                />
              </Field>
            )
          }}
        </form.Field>
      </FieldGroup>
      {saveError && (
        <Alert variant="destructive">
          <AlertDescription>{t(`roles.errors.${saveError}`)}</AlertDescription>
        </Alert>
      )}
      <DialogFooter>
        <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
          {t("roles.editor.cancel")}
        </Button>
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button disabled={isSubmitting} type="submit">
              {isSubmitting && <Spinner data-icon="inline-start" />}
              {isSubmitting
                ? t("roles.jd.editor.saving")
                : t(parsingSupported ? "roles.jd.editor.save" : "roles.jd.editor.saveOnly")}
            </Button>
          )}
        </form.Subscribe>
      </DialogFooter>
    </form>
  )
}

function DraftStateSync({
  isDirty,
  onDirtyChange,
}: {
  isDirty: boolean
  onDirtyChange: (isDirty: boolean) => void
}) {
  useEffect(() => onDirtyChange(isDirty), [isDirty, onDirtyChange])
  return null
}
