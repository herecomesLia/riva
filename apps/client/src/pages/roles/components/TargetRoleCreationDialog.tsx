import {
  ArrowLeftIcon,
  ChevronRightIcon,
  ClipboardPasteIcon,
  FileImageIcon,
  ImageIcon,
  LinkIcon,
  PencilLineIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldControl,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import type {
  CreateTargetRoleFromRecognitionInput,
  CreateTargetRoleInput,
  RecognizeTargetRoleInput,
  TargetRoleImportSourceType,
  TargetRoleRecognitionResult,
} from "@/models/roles"

import { RoleEditorForm, type RoleDraft } from "./RoleEditorDialog"

type CreationMethod = "manual" | TargetRoleImportSourceType
type RecognitionInputError = "imageRequired" | "textRequired" | "urlInvalid" | null

const creationMethods = [
  { value: "manual", icon: PencilLineIcon },
  { value: "text", icon: ClipboardPasteIcon },
  { value: "image", icon: FileImageIcon },
  { value: "url", icon: LinkIcon },
] satisfies { value: CreationMethod; icon: typeof PencilLineIcon }[]

export function TargetRoleCreationDialog({
  onCreateFromRecognition,
  onDirtyChange,
  onManualCreate,
  onOpenChange,
  onRecognize,
  onSaved,
  open,
}: {
  onCreateFromRecognition: (input: CreateTargetRoleFromRecognitionInput) => Promise<void>
  onDirtyChange: (isDirty: boolean) => void
  onManualCreate: (input: CreateTargetRoleInput) => Promise<void>
  onOpenChange: (open: boolean) => void
  onRecognize: (input: RecognizeTargetRoleInput) => Promise<TargetRoleRecognitionResult>
  onSaved: () => void
  open: boolean
}) {
  const { t } = useTranslation()
  const [method, setMethod] = useState<CreationMethod | null>(null)
  const [manualDirty, setManualDirty] = useState(false)
  const [text, setText] = useState("")
  const [images, setImages] = useState<File[]>([])
  const [url, setUrl] = useState("")
  const [recognition, setRecognition] = useState<TargetRoleRecognitionResult | null>(null)
  const [recognitionError, setRecognitionError] = useState(false)
  const [inputError, setInputError] = useState<RecognitionInputError>(null)
  const [isRecognizing, setIsRecognizing] = useState(false)
  const [confirmMethodChangeOpen, setConfirmMethodChangeOpen] = useState(false)

  const sourceDirty =
    text.trim().length > 0 || images.length > 0 || url.trim().length > 0 || recognition !== null

  useEffect(
    () => onDirtyChange(manualDirty || sourceDirty),
    [manualDirty, onDirtyChange, sourceDirty],
  )

  useEffect(() => {
    if (open) return
    setMethod(null)
    setManualDirty(false)
    setText("")
    setImages([])
    setUrl("")
    setRecognition(null)
    setRecognitionError(false)
    setInputError(null)
    setIsRecognizing(false)
    setConfirmMethodChangeOpen(false)
  }, [open])

  function returnToMethods() {
    if (manualDirty || sourceDirty) {
      setConfirmMethodChangeOpen(true)
      return
    }
    setMethod(null)
  }

  function discardEntryAndReturnToMethods() {
    setMethod(null)
    setManualDirty(false)
    setText("")
    setImages([])
    setUrl("")
    setRecognition(null)
    setRecognitionError(false)
    setInputError(null)
    setConfirmMethodChangeOpen(false)
  }

  async function recognize() {
    const input = createRecognitionInput(method, text, images, url)
    if (!input) {
      setInputError(
        method === "text" ? "textRequired" : method === "image" ? "imageRequired" : "urlInvalid",
      )
      return
    }

    setInputError(null)
    setRecognitionError(false)
    setIsRecognizing(true)
    try {
      setRecognition(await onRecognize(input))
    } catch {
      setRecognitionError(true)
    } finally {
      setIsRecognizing(false)
    }
  }

  return (
    <>
      <Dialog
        onOpenChange={(nextOpen) => {
          if (!nextOpen) onOpenChange(false)
        }}
        open={open && method === null}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl">{t("roles.creation.title")}</DialogTitle>
            <DialogDescription>{t("roles.creation.description")}</DialogDescription>
          </DialogHeader>

          <div
            aria-label={t("roles.creation.methodsLabel")}
            className="grid gap-5 sm:grid-cols-2 sm:gap-6"
            role="group"
          >
            {creationMethods.map(({ value, icon: Icon }) => (
              <Button
                aria-label={t(`roles.creation.methods.${value}`)}
                className="h-auto min-h-20 items-center justify-start gap-4 border-primary/20 bg-primary/10 px-6 py-6 text-left whitespace-normal hover:bg-primary/15"
                key={value}
                onClick={() => setMethod(value)}
                type="button"
                variant="outline-static"
              >
                <Icon aria-hidden="true" data-icon="inline-start" />
                <span className="min-w-0 flex-1">{t(`roles.creation.methods.${value}`)}</span>
                <ChevronRightIcon aria-hidden="true" data-icon="inline-end" />
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        onOpenChange={(nextOpen) => {
          if (!nextOpen) onOpenChange(false)
        }}
        open={open && method !== null}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle className="text-xl">
              {method ? t(`roles.creation.methodTitles.${method}`) : t("roles.creation.title")}
            </DialogTitle>
            <DialogDescription>{t("roles.creation.methodDialogDescription")}</DialogDescription>
          </DialogHeader>

          {recognition ? (
            <RecognitionReview
              onBack={() => setRecognition(null)}
              onCreate={onCreateFromRecognition}
              onDirtyChange={setManualDirty}
              onOpenChange={onOpenChange}
              onReturnToMethods={returnToMethods}
              onSaved={onSaved}
              recognition={recognition}
            />
          ) : method ? (
            <div className="flex min-w-0 flex-col gap-6">
              {method === "manual" && (
                <RoleEditorForm
                  mode="create"
                  onCreate={onManualCreate}
                  onDirtyChange={setManualDirty}
                  onOpenChange={onOpenChange}
                  onSaved={onSaved}
                  onUpdate={() => Promise.resolve()}
                  role={null}
                  footerStart={<ReturnToMethodsButton onClick={returnToMethods} />}
                />
              )}
              {method === "text" && (
                <TextImportPanel
                  error={inputError === "textRequired"}
                  onChange={(value) => {
                    setText(value)
                    setInputError(null)
                  }}
                  value={text}
                />
              )}
              {method === "image" && (
                <ImageImportPanel
                  error={inputError === "imageRequired"}
                  images={images}
                  onChange={(value) => {
                    setImages(value)
                    setInputError(null)
                  }}
                />
              )}
              {method === "url" && (
                <UrlImportPanel
                  error={inputError === "urlInvalid"}
                  onChange={(value) => {
                    setUrl(value)
                    setInputError(null)
                  }}
                  value={url}
                />
              )}

              {method !== "manual" && (
                <div className="flex flex-col gap-4">
                  {recognitionError && (
                    <Alert variant="destructive">
                      <AlertDescription>{t("roles.creation.recognitionFailed")}</AlertDescription>
                    </Alert>
                  )}
                  <DialogFooter className="sm:justify-between">
                    <ReturnToMethodsButton onClick={returnToMethods} />
                    <div className="flex flex-col-reverse gap-2 sm:flex-row">
                      <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
                        {t("roles.editor.cancel")}
                      </Button>
                      <Button
                        disabled={isRecognizing}
                        onClick={() => void recognize()}
                        type="button"
                      >
                        {isRecognizing ? (
                          <Spinner data-icon="inline-start" />
                        ) : (
                          <SparklesIcon data-icon="inline-start" />
                        )}
                        {isRecognizing
                          ? t("roles.creation.recognizing")
                          : t("roles.creation.recognize")}
                      </Button>
                    </div>
                  </DialogFooter>
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog onOpenChange={setConfirmMethodChangeOpen} open={confirmMethodChangeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("roles.creation.changeMethod.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("roles.creation.changeMethod.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("roles.creation.changeMethod.stay")}</AlertDialogCancel>
            <AlertDialogAction onClick={discardEntryAndReturnToMethods} variant="destructive">
              {t("roles.creation.changeMethod.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function ReturnToMethodsButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation()
  return (
    <Button className="self-start" onClick={onClick} type="button" variant="ghost">
      <ArrowLeftIcon data-icon="inline-start" />
      {t("roles.creation.backToMethods")}
    </Button>
  )
}

function TextImportPanel({
  error,
  onChange,
  value,
}: {
  error: boolean
  onChange: (value: string) => void
  value: string
}) {
  const { t } = useTranslation()
  return (
    <FieldGroup>
      <Field invalid={error}>
        <FieldLabel htmlFor="target-role-import-text">{t("roles.creation.text.label")}</FieldLabel>
        <FieldDescription>{t("roles.creation.text.description")}</FieldDescription>
        <FieldControl>
          <Textarea
            aria-required="true"
            className="min-h-72 resize-y"
            id="target-role-import-text"
            onChange={(event) => onChange(event.target.value)}
            placeholder={t("roles.creation.text.placeholder")}
            value={value}
          />
        </FieldControl>
        {error && <FieldError>{t("roles.creation.text.required")}</FieldError>}
      </Field>
    </FieldGroup>
  )
}

function ImageImportPanel({
  error,
  images,
  onChange,
}: {
  error: boolean
  images: File[]
  onChange: (images: File[]) => void
}) {
  const { t } = useTranslation()
  return (
    <FieldGroup>
      <Field invalid={error}>
        <FieldLabel htmlFor="target-role-import-images">
          {t("roles.creation.image.label")}
        </FieldLabel>
        <FieldDescription>{t("roles.creation.image.description")}</FieldDescription>
        <FieldControl>
          <Input
            accept="image/png,image/jpeg,image/webp"
            aria-required="true"
            id="target-role-import-images"
            multiple
            onChange={(event) => onChange(Array.from(event.target.files ?? []))}
            type="file"
          />
        </FieldControl>
        {error && <FieldError>{t("roles.creation.image.required")}</FieldError>}
      </Field>
      {images.length > 0 && (
        <AttachmentGroup aria-label={t("roles.creation.image.selectedImages")}>
          {images.map((image, index) => (
            <Attachment key={`${image.name}-${image.lastModified}`}>
              <AttachmentMedia>
                <ImageIcon />
              </AttachmentMedia>
              <AttachmentContent>
                <AttachmentTitle>{image.name}</AttachmentTitle>
                <AttachmentDescription>
                  {t("roles.creation.image.order", { count: index + 1 })}
                </AttachmentDescription>
              </AttachmentContent>
              <AttachmentActions>
                <AttachmentAction
                  aria-label={t("roles.creation.image.remove", { name: image.name })}
                  onClick={() => onChange(images.filter((candidate) => candidate !== image))}
                >
                  <XIcon />
                </AttachmentAction>
              </AttachmentActions>
            </Attachment>
          ))}
        </AttachmentGroup>
      )}
    </FieldGroup>
  )
}

function UrlImportPanel({
  error,
  onChange,
  value,
}: {
  error: boolean
  onChange: (value: string) => void
  value: string
}) {
  const { t } = useTranslation()
  return (
    <FieldGroup>
      <Field invalid={error}>
        <FieldLabel htmlFor="target-role-import-url">{t("roles.creation.url.label")}</FieldLabel>
        <FieldDescription>{t("roles.creation.url.description")}</FieldDescription>
        <FieldControl>
          <Input
            aria-required="true"
            id="target-role-import-url"
            onChange={(event) => onChange(event.target.value)}
            placeholder={t("roles.creation.url.placeholder")}
            type="url"
            value={value}
          />
        </FieldControl>
        {error && <FieldError>{t("roles.creation.url.invalid")}</FieldError>}
      </Field>
    </FieldGroup>
  )
}

function RecognitionReview({
  onBack,
  onCreate,
  onDirtyChange,
  onOpenChange,
  onReturnToMethods,
  onSaved,
  recognition,
}: {
  onBack: () => void
  onCreate: (input: CreateTargetRoleFromRecognitionInput) => Promise<void>
  onDirtyChange: (isDirty: boolean) => void
  onOpenChange: (open: boolean) => void
  onReturnToMethods: () => void
  onSaved: () => void
  recognition: TargetRoleRecognitionResult
}) {
  const { t } = useTranslation()
  const [rawText, setRawText] = useState(recognition.rawText)
  const [roleDirty, setRoleDirty] = useState(false)
  const initialDraft = useMemo<RoleDraft>(
    () => ({
      title: recognition.suggestedRole.title,
      company: recognition.suggestedRole.company ?? "",
      recruitmentType: recognition.suggestedRole.recruitmentType ?? "unspecified",
      location: recognition.suggestedRole.location ?? "",
      minYears: recognition.suggestedRole.experienceRange?.minYears?.toString() ?? "",
      maxYears: recognition.suggestedRole.experienceRange?.maxYears?.toString() ?? "",
      preparationStatus: "preparing",
    }),
    [recognition],
  )

  useEffect(
    () => onDirtyChange(roleDirty || rawText !== recognition.rawText),
    [onDirtyChange, rawText, recognition.rawText, roleDirty],
  )

  return (
    <div className="flex flex-col gap-6" data-testid="target-role-recognition-review">
      <Alert>
        <SparklesIcon />
        <AlertDescription>
          {t("roles.creation.review.source", { source: recognition.sourceLabel })}
        </AlertDescription>
      </Alert>
      <div>
        <Button onClick={onBack} type="button" variant="ghost">
          {t("roles.creation.review.back")}
        </Button>
      </div>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="target-role-recognized-text">
            {t("roles.creation.review.rawText")}
          </FieldLabel>
          <FieldDescription>{t("roles.creation.review.description")}</FieldDescription>
          <FieldControl>
            <Textarea
              className="min-h-48 resize-y"
              id="target-role-recognized-text"
              onChange={(event) => setRawText(event.target.value)}
              value={rawText}
            />
          </FieldControl>
        </Field>
      </FieldGroup>
      <RoleEditorForm
        initialDraft={initialDraft}
        mode="create"
        onCreate={(input) =>
          onCreate({ ...input, rawText: rawText.trim(), recognitionId: recognition.recognitionId })
        }
        onDirtyChange={setRoleDirty}
        onOpenChange={onOpenChange}
        onSaved={onSaved}
        onUpdate={() => Promise.resolve()}
        role={null}
        footerStart={<ReturnToMethodsButton onClick={onReturnToMethods} />}
      />
    </div>
  )
}

function createRecognitionInput(
  method: CreationMethod | null,
  text: string,
  images: File[],
  url: string,
): RecognizeTargetRoleInput | null {
  if (method === "text") return text.trim() ? { sourceType: "text", text: text.trim() } : null
  if (method === "image") return images.length > 0 ? { sourceType: "image", images } : null
  if (method !== "url") return null
  try {
    const parsed = new URL(url.trim())
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? { sourceType: "url", url: parsed.toString() }
      : null
  } catch {
    return null
  }
}
