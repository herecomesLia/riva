import { AlertCircleIcon, CheckCircle2Icon } from "lucide-react"
import { useEffect, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
import {
  applyJobDescriptionImportDraft,
  createJobDescriptionImportDraft,
  type JobDescriptionImportDraft,
} from "@/services/job-description-import"

type ImportDialogState =
  | { status: "input" }
  | { status: "parsing" }
  | { status: "ready"; draft: JobDescriptionImportDraft }
  | { status: "failed"; failureReason: string }

type JobDescriptionImportDialogProps = {
  applyDraft?: typeof applyJobDescriptionImportDraft
  createDraft?: typeof createJobDescriptionImportDraft
  onApplied: (roleId: string) => Promise<void> | void
  onDirtyChange?: (isDirty: boolean) => void
  onOpenChange: (open: boolean) => void
  open: boolean
}

export function JobDescriptionImportDialog({
  applyDraft = applyJobDescriptionImportDraft,
  createDraft = createJobDescriptionImportDraft,
  onApplied,
  onDirtyChange,
  onOpenChange,
  open,
}: JobDescriptionImportDialogProps) {
  const { t } = useTranslation()
  const [rawText, setRawText] = useState("")
  const [state, setState] = useState<ImportDialogState>({ status: "input" })
  const [inputError, setInputError] = useState(false)
  const [isApplying, setIsApplying] = useState(false)
  const [applyError, setApplyError] = useState(false)

  useEffect(() => {
    onDirtyChange?.(open && state.status === "input" && rawText.trim().length > 0)
  }, [onDirtyChange, open, rawText, state.status])

  useEffect(() => {
    if (open) return
    setApplyError(false)
    setInputError(false)
    setIsApplying(false)
    setRawText("")
    setState({ status: "input" })
  }, [open])

  async function handleSubmit() {
    const normalizedText = rawText.trim()
    if (!normalizedText) {
      setInputError(true)
      return
    }

    setInputError(false)
    setState({ status: "parsing" })
    try {
      const draft = await createDraft({ rawText: normalizedText })
      if (draft.status !== "ready") throw new Error("Job description import draft is not ready.")
      setState({ draft, status: "ready" })
    } catch {
      setState({
        failureReason: t("roles.import.failed.requestDescription"),
        status: "failed",
      })
    }
  }

  async function handleApply(draft: JobDescriptionImportDraft) {
    if (isApplying) return
    setApplyError(false)
    setIsApplying(true)
    try {
      const appliedDraft = await applyDraft(draft.id)
      if (appliedDraft.status !== "applied" || !appliedDraft.appliedRoleId) {
        throw new Error("Applied job description draft did not identify the created role.")
      }
      await onApplied(appliedDraft.appliedRoleId)
      onOpenChange(false)
    } catch {
      setApplyError(true)
    } finally {
      setIsApplying(false)
    }
  }

  function returnToInput() {
    setApplyError(false)
    setInputError(false)
    setState({ status: "input" })
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("roles.import.title")}</DialogTitle>
          <DialogDescription>{t("roles.import.description")}</DialogDescription>
        </DialogHeader>

        {state.status === "input" && (
          <form
            className="flex flex-col gap-6"
            noValidate
            onSubmit={(event) => {
              event.preventDefault()
              void handleSubmit()
            }}
          >
            <FieldGroup>
              <Field invalid={inputError}>
                <FieldLabel htmlFor="job-description-import-text">
                  {t("roles.import.input.label")}
                </FieldLabel>
                <FieldControl>
                  <Textarea
                    aria-invalid={inputError || undefined}
                    id="job-description-import-text"
                    maxLength={50_000}
                    onChange={(event) => {
                      setRawText(event.target.value)
                      if (inputError) setInputError(false)
                    }}
                    placeholder={t("roles.import.input.placeholder")}
                    rows={12}
                    value={rawText}
                  />
                </FieldControl>
                <FieldError>{inputError ? t("roles.import.input.required") : undefined}</FieldError>
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
                {t("roles.import.actions.cancel")}
              </Button>
              <Button type="submit">{t("roles.import.actions.start")}</Button>
            </DialogFooter>
          </form>
        )}

        {state.status === "parsing" && (
          <>
            <Card aria-busy="true" aria-live="polite" size="sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Spinner />
                  {t("roles.import.parsing.title")}
                </CardTitle>
                <CardDescription>{t("roles.import.parsing.description")}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">{t("roles.import.parsing.preserve")}</p>
              </CardContent>
            </Card>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)} variant="outline">
                {t("roles.import.actions.cancel")}
              </Button>
            </DialogFooter>
          </>
        )}

        {state.status === "ready" && (
          <>
            <Card size="sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2Icon />
                  {t("roles.import.ready.title")}
                </CardTitle>
                <CardDescription>{t("roles.import.ready.description")}</CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="grid gap-5 sm:grid-cols-2">
                  <ImportResult label={t("roles.import.ready.company")}>
                    {state.draft.parsedCompany ?? t("roles.fallbackValue")}
                  </ImportResult>
                  <ImportResult label={t("roles.import.ready.roleTitle")}>
                    {state.draft.parsedTitle ?? t("roles.fallbackValue")}
                  </ImportResult>
                  <ImportResult label={t("roles.import.ready.location")}>
                    {state.draft.parsedLocation ?? t("roles.fallbackValue")}
                  </ImportResult>
                  <ImportResult className="sm:col-span-2" label={t("roles.import.ready.summary")}>
                    <p className="max-h-48 overflow-y-auto whitespace-pre-wrap">
                      {state.draft.parsedDescription ?? state.draft.rawText}
                    </p>
                  </ImportResult>
                </dl>
              </CardContent>
            </Card>
            {applyError && (
              <Alert variant="destructive">
                <AlertCircleIcon />
                <AlertTitle>{t("roles.import.applyFailed.title")}</AlertTitle>
                <AlertDescription>{t("roles.import.applyFailed.description")}</AlertDescription>
              </Alert>
            )}
            <DialogFooter>
              <Button disabled={isApplying} onClick={() => onOpenChange(false)} variant="outline">
                {t("roles.import.actions.cancel")}
              </Button>
              <Button disabled={isApplying} onClick={returnToInput} variant="outline">
                {t("roles.import.actions.back")}
              </Button>
              <Button disabled={isApplying} onClick={() => void handleApply(state.draft)}>
                {isApplying && <Spinner data-icon="inline-start" />}
                {isApplying ? t("roles.import.actions.applying") : t("roles.import.actions.apply")}
              </Button>
            </DialogFooter>
          </>
        )}

        {state.status === "failed" && (
          <>
            <Alert variant="destructive">
              <AlertCircleIcon />
              <AlertTitle>{t("roles.import.failed.title")}</AlertTitle>
              <AlertDescription>{state.failureReason}</AlertDescription>
            </Alert>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)} variant="outline">
                {t("roles.import.actions.cancel")}
              </Button>
              <Button onClick={returnToInput}>{t("roles.import.actions.reenter")}</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function ImportResult({
  children,
  className,
  label,
}: {
  children: ReactNode
  className?: string
  label: string
}) {
  return (
    <div className={className}>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-medium">{children}</dd>
    </div>
  )
}
