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
  role,
}: {
  onDirtyChange: (isDirty: boolean) => void
  onOpenChange: (open: boolean) => void
  onSave: (input: SaveTargetRoleJobDescriptionInput) => Promise<void>
  onSaved: () => void
  open: boolean
  role: TargetRole | null
}) {
  const { t } = useTranslation()

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b px-6 py-5 pr-14">
          <DialogTitle className="text-xl font-medium leading-tight">
            {t(
              role?.jobDescription.status === "missing"
                ? "roles.jd.editor.addTitle"
                : "roles.jd.editor.replaceTitle",
            )}
          </DialogTitle>
          <DialogDescription>{t("roles.jd.editor.description")}</DialogDescription>
        </DialogHeader>
        {role && (
          <JobDescriptionEditorForm
            key={`${role.id}-${role.jobDescription.version ?? "missing"}`}
            onDirtyChange={onDirtyChange}
            onOpenChange={onOpenChange}
            onSave={onSave}
            onSaved={onSaved}
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
  role,
}: {
  onDirtyChange: (isDirty: boolean) => void
  onOpenChange: (open: boolean) => void
  onSave: (input: SaveTargetRoleJobDescriptionInput) => Promise<void>
  onSaved: () => void
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
      className="grid max-h-[calc(100dvh-8.25rem)] min-h-0 grid-rows-[minmax(0,1fr)_auto]"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <div
        className="flex min-h-0 flex-col gap-6 overflow-y-auto px-6 py-5"
        data-testid="job-description-editor-scroll"
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
      </div>
      <DialogFooter className="border-t bg-popover px-6 py-4">
        <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
          {t("roles.editor.cancel")}
        </Button>
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button disabled={isSubmitting} type="submit">
              {isSubmitting && <Spinner data-icon="inline-start" />}
              {isSubmitting ? t("roles.jd.editor.saving") : t("roles.jd.editor.save")}
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
