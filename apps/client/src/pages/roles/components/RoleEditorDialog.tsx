import { useForm } from "@tanstack/react-form"
import type { ReactNode } from "react"
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
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"
import type {
  CreateRoleRequest,
  RecruitmentTrack,
  UpdateRoleRequest,
  RoleResponse,
} from "@/api/generated/models"

import { getRolesActionErrorCode, type RolesActionErrorCode } from "../roles-errors"

export type RoleDraft = {
  title: string
  company: string
  recruitmentTrack: RecruitmentTrack | "unspecified"
  location: string
}

type RoleEditorDialogProps = {
  mode: "create" | "edit"
  onCreate: (input: CreateRoleRequest) => Promise<void>
  onDirtyChange: (isDirty: boolean) => void
  onOpenChange: (open: boolean) => void
  onSaved: () => void
  onUpdate: (roleId: string, input: UpdateRoleRequest) => Promise<void>
  open: boolean
  role: RoleResponse | null
}

const roleDraftSchema = z.object({
  title: z.string().trim().min(1, "required"),
  company: z.string(),
  recruitmentTrack: z.enum(["campus", "experienced", "unspecified"]),
  location: z.string(),
})

export function RoleEditorDialog({
  mode,
  onCreate,
  onDirtyChange,
  onOpenChange,
  onSaved,
  onUpdate,
  open,
  role,
}: RoleEditorDialogProps) {
  const { t } = useTranslation()

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl">{t(`roles.editor.${mode}.title`)}</DialogTitle>
          <DialogDescription>{t(`roles.editor.${mode}.description`)}</DialogDescription>
        </DialogHeader>
        <RoleEditorForm
          key={`${mode}-${role?.id ?? "new"}`}
          mode={mode}
          onCreate={onCreate}
          onDirtyChange={onDirtyChange}
          onOpenChange={onOpenChange}
          onSaved={onSaved}
          onUpdate={onUpdate}
          role={role}
        />
      </DialogContent>
    </Dialog>
  )
}

export function RoleEditorForm({
  footerStart,
  initialDraft,
  mode,
  onCreate,
  onDirtyChange,
  onOpenChange,
  onSaved,
  onUpdate,
  role,
}: Omit<RoleEditorDialogProps, "open"> & { footerStart?: ReactNode; initialDraft?: RoleDraft }) {
  const { t } = useTranslation()
  const [saveError, setSaveError] = useState<RolesActionErrorCode | null>(null)
  const form = useForm({
    defaultValues: initialDraft ?? createRoleDraft(role),
    validators: { onSubmit: roleDraftSchema },
    onSubmit: async ({ value }) => {
      setSaveError(null)
      try {
        if (mode === "create") {
          await onCreate(toCreateInput(value))
        } else if (role) {
          await onUpdate(role.id, toBasicInput(value))
        }
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
        <TextField form={form} label={t("roles.editor.fields.title")} name="title" required />
        <TextField form={form} label={t("roles.editor.fields.company")} name="company" />
        <div className="grid gap-5 sm:grid-cols-2">
          <SelectField
            form={form}
            label={t("roles.editor.fields.recruitmentType")}
            name="recruitmentTrack"
            options={[
              ["unspecified", t("roles.editor.options.unspecified")],
              ["campus", t("roles.recruitmentType.campus")],
              ["experienced", t("roles.recruitmentType.experienced")],
            ]}
          />
          <TextField form={form} label={t("roles.editor.fields.location")} name="location" />
        </div>
      </FieldGroup>
      {saveError && (
        <Alert variant="destructive">
          <AlertDescription>{t(`roles.errors.${saveError}`)}</AlertDescription>
        </Alert>
      )}
      <DialogFooter className={cn(footerStart && "sm:justify-between")}>
        {footerStart}
        <div className={cn("contents", footerStart && "flex flex-col-reverse gap-2 sm:flex-row")}>
          <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
            {t("roles.editor.cancel")}
          </Button>
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <Button disabled={isSubmitting} type="submit">
                {isSubmitting && <Spinner data-icon="inline-start" />}
                {isSubmitting ? t("roles.editor.saving") : t("roles.editor.save")}
              </Button>
            )}
          </form.Subscribe>
        </div>
      </DialogFooter>
    </form>
  )
}

function TextField({ form, label, name, required = false }: any) {
  const { t } = useTranslation()
  return (
    <form.Field name={name}>
      {(field: any) => {
        const invalid = field.state.meta.isTouched && !field.state.meta.isValid
        return (
          <Field invalid={invalid}>
            <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
            <FieldControl>
              <Input
                aria-invalid={invalid || undefined}
                aria-required={required || undefined}
                id={field.name}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                type="text"
                value={field.state.value}
              />
            </FieldControl>
            <FieldError
              errors={field.state.meta.errors.map(() => ({
                message: t("roles.editor.validation.required"),
              }))}
            />
          </Field>
        )
      }}
    </form.Field>
  )
}

function SelectField({ form, label, name, options }: any) {
  return (
    <form.Field name={name}>
      {(field: any) => (
        <Field>
          <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
          <Select
            items={Object.fromEntries(options)}
            onValueChange={field.handleChange}
            value={field.state.value}
          >
            <FieldControl>
              <SelectTrigger id={field.name} onBlur={field.handleBlur}>
                <SelectValue />
              </SelectTrigger>
            </FieldControl>
            <SelectContent alignItemWithTrigger={false} side="bottom" align="start" sideOffset={4}>
              <SelectGroup>
                {options.map(([value, optionLabel]: [string, string]) => (
                  <SelectItem key={value} value={value}>
                    {optionLabel}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      )}
    </form.Field>
  )
}

function DraftStateSync({
  isDirty,
  onDirtyChange,
}: {
  isDirty: boolean
  onDirtyChange: (value: boolean) => void
}) {
  useEffect(() => onDirtyChange(isDirty), [isDirty, onDirtyChange])
  return null
}

function createRoleDraft(role: RoleResponse | null): RoleDraft {
  return {
    title: role?.title ?? "",
    company: role?.company ?? "",
    recruitmentTrack: role?.recruitmentTrack ?? "unspecified",
    location: role?.location ?? "",
  }
}

function toBasicInput(value: RoleDraft) {
  return {
    title: value.title.trim(),
    company: value.company.trim() || null,
    recruitmentTrack: value.recruitmentTrack === "unspecified" ? null : value.recruitmentTrack,
    location: value.location.trim() || null,
  }
}

function toCreateInput(value: RoleDraft): CreateRoleRequest {
  return toBasicInput(value)
}
