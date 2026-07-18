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
import type {
  ActiveTargetRolePreparationStatus,
  CreateTargetRoleInput,
  TargetRole,
  TargetRoleRecruitmentType,
  UpdateTargetRoleInput,
} from "@/models/roles"

import { getRolesActionErrorCode } from "../roles-errors"

type RoleDraft = {
  title: string
  company: string
  recruitmentType: TargetRoleRecruitmentType | "unspecified"
  location: string
  minYears: string
  maxYears: string
  preparationStatus: ActiveTargetRolePreparationStatus
}

type RoleEditorDialogProps = {
  mode: "create" | "edit"
  onCreate: (input: CreateTargetRoleInput) => Promise<void>
  onDirtyChange: (isDirty: boolean) => void
  onOpenChange: (open: boolean) => void
  onSaved: () => void
  onUpdate: (input: UpdateTargetRoleInput) => Promise<void>
  open: boolean
  role: TargetRole | null
}

const optionalNonNegativeInteger = z
  .string()
  .refine((value) => value === "" || (/^\d+$/.test(value) && Number(value) >= 0), "nonNegative")

const roleDraftSchema = z
  .object({
    title: z.string().trim().min(1, "required"),
    company: z.string(),
    recruitmentType: z.enum(["campus", "experienced", "unspecified"]),
    location: z.string(),
    minYears: optionalNonNegativeInteger,
    maxYears: optionalNonNegativeInteger,
    preparationStatus: z.enum(["preparing", "paused"]),
  })
  .superRefine((value, context) => {
    if (
      value.minYears !== "" &&
      value.maxYears !== "" &&
      Number(value.minYears) > Number(value.maxYears)
    ) {
      context.addIssue({ code: "custom", message: "experienceRange", path: ["maxYears"] })
    }
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
          <DialogTitle>{t(`roles.editor.${mode}.title`)}</DialogTitle>
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

function RoleEditorForm({
  mode,
  onCreate,
  onDirtyChange,
  onOpenChange,
  onSaved,
  onUpdate,
  role,
}: Omit<RoleEditorDialogProps, "open">) {
  const { t } = useTranslation()
  const [saveError, setSaveError] = useState<"requestFailed" | "versionConflict" | null>(null)
  const form = useForm({
    defaultValues: createRoleDraft(role),
    validators: { onSubmit: roleDraftSchema },
    onSubmit: async ({ value }) => {
      setSaveError(null)
      try {
        if (mode === "create") {
          await onCreate(toCreateInput(value))
        } else if (role) {
          await onUpdate({ ...toBasicInput(value), roleId: role.id, version: role.version })
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
            name="recruitmentType"
            options={[
              ["unspecified", t("roles.editor.options.unspecified")],
              ["campus", t("roles.recruitmentType.campus")],
              ["experienced", t("roles.recruitmentType.experienced")],
            ]}
          />
          <TextField form={form} label={t("roles.editor.fields.location")} name="location" />
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField form={form} label={t("roles.editor.fields.minYears")} name="minYears" number />
          <TextField form={form} label={t("roles.editor.fields.maxYears")} name="maxYears" number />
        </div>
        {mode === "create" && (
          <SelectField
            form={form}
            label={t("roles.editor.fields.preparationStatus")}
            name="preparationStatus"
            options={[
              ["preparing", t("roles.preparationStatus.preparing")],
              ["paused", t("roles.preparationStatus.paused")],
            ]}
          />
        )}
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
              {isSubmitting ? t("roles.editor.saving") : t("roles.editor.save")}
            </Button>
          )}
        </form.Subscribe>
      </DialogFooter>
    </form>
  )
}

function TextField({ form, label, name, number = false, required = false }: any) {
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
                min={number ? 0 : undefined}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                step={number ? 1 : undefined}
                type={number ? "number" : "text"}
                value={field.state.value}
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

function SelectField({ form, label, name, options }: any) {
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

function translateValidationError(t: ReturnType<typeof useTranslation>["t"], error: unknown) {
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String(error.message)
      : String(error)
  return t(
    `roles.editor.validation.${message === "required" || message === "experienceRange" ? message : "nonNegative"}`,
  )
}

function createRoleDraft(role: TargetRole | null): RoleDraft {
  return {
    title: role?.title ?? "",
    company: role?.company ?? "",
    recruitmentType: role?.recruitmentType ?? "unspecified",
    location: role?.location ?? "",
    minYears: role?.experienceRange?.minYears?.toString() ?? "",
    maxYears: role?.experienceRange?.maxYears?.toString() ?? "",
    preparationStatus: role?.preparationStatus === "paused" ? "paused" : "preparing",
  }
}

function toBasicInput(value: RoleDraft) {
  const minYears = value.minYears === "" ? null : Number(value.minYears)
  const maxYears = value.maxYears === "" ? null : Number(value.maxYears)
  return {
    title: value.title.trim(),
    company: value.company.trim() || null,
    recruitmentType: value.recruitmentType === "unspecified" ? null : value.recruitmentType,
    location: value.location.trim() || null,
    experienceRange: minYears === null && maxYears === null ? null : { minYears, maxYears },
  }
}

function toCreateInput(value: RoleDraft): CreateTargetRoleInput {
  return { ...toBasicInput(value), preparationStatus: value.preparationStatus }
}
