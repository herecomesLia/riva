import { PlusIcon, Trash2Icon } from "lucide-react"
import { useEffect, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import type { CareerProfileResponse, UpdateCareerProfileRequest } from "@/api/generated/models"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { DialogFooter } from "@/components/ui/dialog"
import { Field, FieldControl, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { LocalizedMonthPicker } from "@/components/ui/month-picker"

export type ProfileEditorProps = {
  onCancel: () => void
  onDirtyChange: (isDirty: boolean) => void
  onSave: (input: UpdateCareerProfileRequest) => Promise<void>
  profile: CareerProfileResponse
}

export type EditorField<T> = {
  name: string
  state: {
    value: T
    meta: { isTouched: boolean; isValid: boolean; errors: readonly unknown[] }
  }
  handleBlur: () => void
  handleChange: (value: T) => void
}

export function ProfileFieldErrors({ errors }: { errors: readonly unknown[] }) {
  const { t } = useTranslation()
  return (
    <FieldError
      errors={errors.map((error) => {
        const message =
          typeof error === "object" && error !== null && "message" in error
            ? String(error.message)
            : String(error)
        return { message: t(`profile.editor.validation.${message}`, { defaultValue: message }) }
      })}
    />
  )
}

export function ProfileTextField({
  field,
  label,
  month = false,
}: {
  field: EditorField<string>
  label: string
  month?: boolean
}) {
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
            value={field.state.value}
          />
        ) : (
          <Input
            id={field.name}
            onBlur={field.handleBlur}
            onChange={(event) => field.handleChange(event.target.value)}
            value={field.state.value}
          />
        )}
      </FieldControl>
      <ProfileFieldErrors errors={field.state.meta.errors} />
    </Field>
  )
}

export function ProfileEndDateField({
  endDate,
  isCurrent,
}: {
  endDate: EditorField<string>
  isCurrent: EditorField<boolean>
}) {
  const { t } = useTranslation()
  const current = isCurrent.state.value
  const invalid = !current && endDate.state.meta.isTouched && !endDate.state.meta.isValid
  return (
    <Field invalid={invalid}>
      <div className="flex items-center justify-between gap-3">
        <FieldLabel htmlFor={endDate.name}>{t("profile.formField.endDate")}</FieldLabel>
        <div className="flex shrink-0 items-center gap-2">
          <Checkbox
            checked={current}
            id={`${isCurrent.name}-present`}
            onCheckedChange={(checked) => {
              isCurrent.handleChange(checked === true)
              if (checked) endDate.handleChange("")
            }}
          />
          <FieldLabel className="cursor-pointer font-normal" htmlFor={`${isCurrent.name}-present`}>
            {t("profile.field.present")}
          </FieldLabel>
        </div>
      </div>
      <FieldControl>
        {current ? (
          <Input
            aria-label={t("profile.formField.endDate")}
            disabled
            id={endDate.name}
            readOnly
            type="text"
            value={t("profile.field.present")}
          />
        ) : (
          <LocalizedMonthPicker
            id={endDate.name}
            invalid={invalid}
            onBlur={endDate.handleBlur}
            onChange={endDate.handleChange}
            value={endDate.state.value}
          />
        )}
      </FieldControl>
      {!current && <ProfileFieldErrors errors={endDate.state.meta.errors} />}
    </Field>
  )
}

export function ProfileEditorForm({
  children,
  error,
  isDirty,
  isSubmitting,
  onCancel,
  onDirtyChange,
  onSubmit,
  section,
}: {
  children: ReactNode
  error: ReactNode
  isDirty: boolean
  isSubmitting: boolean
  onCancel: () => void
  onDirtyChange: (isDirty: boolean) => void
  onSubmit: () => Promise<void>
  section: string
}) {
  const { t } = useTranslation()
  useEffect(() => onDirtyChange(isDirty), [isDirty, onDirtyChange])
  return (
    <form
      className="grid max-h-[calc(100dvh-8.25rem)] min-h-0 grid-rows-[minmax(0,1fr)_auto]"
      data-testid={`profile-editor-${section}`}
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        void onSubmit()
      }}
    >
      <div className="min-h-0 overflow-y-auto px-6 py-5">
        {children}
        {error && (
          <Alert className="mt-6" variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>
      <DialogFooter className="border-t bg-popover px-6 py-4">
        <Button onClick={onCancel} type="button" variant="outline">
          {t("profile.editor.cancel")}
        </Button>
        <Button disabled={isSubmitting} type="submit">
          {isSubmitting ? t("profile.editor.saving") : t("profile.editor.save")}
        </Button>
      </DialogFooter>
    </form>
  )
}

export function ProfileExperienceItem({
  children,
  clientId,
  index,
  onDelete,
}: {
  children: ReactNode
  clientId: string
  index: number
  onDelete: () => void
}) {
  const { t } = useTranslation()
  const titleId = `profile-editor-item-${clientId}-title`
  return (
    <FieldGroup
      aria-labelledby={titleId}
      className="grid gap-5 rounded-xl border px-4 pt-4 pb-5 md:grid-cols-2"
      data-testid={`profile-editor-item-${clientId}`}
      role="group"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 md:col-span-2">
        <p className="font-medium" id={titleId}>
          {t("profile.editor.experience", { count: index + 1 })}
        </p>
        <Button onClick={onDelete} type="button" variant="destructive">
          <Trash2Icon data-icon="inline-start" />
          {t("profile.editor.delete")}
        </Button>
      </div>
      {children}
    </FieldGroup>
  )
}

export function ProfileAddExperienceButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation()
  return (
    <Button onClick={onClick} type="button" variant="outline">
      <PlusIcon data-icon="inline-start" />
      {t("profile.editor.addExperience")}
    </Button>
  )
}
