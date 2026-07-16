import { PlusIcon, Trash2Icon } from "lucide-react"
import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldControl, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import { parseBulletItems } from "@/models/profile-text"

type BulletListEditorProps = {
  description?: string
  items: string[]
  label: string
  onChange: (items: string[]) => void
}

export function BulletListEditor({ description, items, label, onChange }: BulletListEditorProps) {
  const { t } = useTranslation()
  const [pasteValue, setPasteValue] = useState("")
  const [isPasteDialogOpen, setIsPasteDialogOpen] = useState(false)
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [shouldReplace, setShouldReplace] = useState(false)
  const inputs = useRef<Array<HTMLTextAreaElement | null>>([])
  const parsedItems = parseBulletItems(pasteValue)

  function updateItem(index: number, value: string) {
    onChange(items.map((item, itemIndex) => (itemIndex === index ? value : item)))
  }

  function addItem() {
    const nextIndex = items.length
    onChange([...items, ""])
    requestAnimationFrame(() => inputs.current[nextIndex]?.focus())
  }

  function closePasteDialog() {
    setIsPasteDialogOpen(false)
    setIsPreviewing(false)
    setPasteValue("")
    setShouldReplace(false)
  }

  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      {description && <FieldDescription>{description}</FieldDescription>}
      <div className="flex flex-col gap-3">
        {items.length === 0 && (
          <p className="text-sm text-muted-foreground">{t("profile.editor.bulletListEmpty")}</p>
        )}
        {items.map((item, index) => (
          <div className="flex items-start gap-2" key={index}>
            <div className="flex-1">
              <FieldControl>
                <Textarea
                  aria-label={`${label} ${index + 1}`}
                  className="min-h-16 resize-y"
                  onBlur={(event) => {
                    if (!event.target.value.trim())
                      onChange(items.filter((_, itemIndex) => itemIndex !== index))
                  }}
                  onChange={(event) => updateItem(index, event.target.value)}
                  ref={(element) => {
                    inputs.current[index] = element
                  }}
                  value={item}
                />
              </FieldControl>
            </div>
            <Button
              aria-label={t("profile.editor.deleteBullet", { count: index + 1 })}
              onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}
              size="icon"
              type="button"
              variant="ghost"
            >
              <Trash2Icon />
            </Button>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button onClick={addItem} type="button" variant="outline">
            <PlusIcon data-icon="inline-start" />
            {t("profile.editor.addBullet")}
          </Button>
          <Button onClick={() => setIsPasteDialogOpen(true)} type="button" variant="outline">
            {t("profile.editor.pasteAndOrganize")}
          </Button>
        </div>
      </div>

      <Dialog onOpenChange={(open) => !open && closePasteDialog()} open={isPasteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isPreviewing
                ? t("profile.editor.organizedResult")
                : t("profile.editor.pasteContent")}
            </DialogTitle>
            <DialogDescription>
              {isPreviewing
                ? t("profile.editor.organizedResultDescription")
                : t("profile.editor.pasteContentDescription")}
            </DialogDescription>
          </DialogHeader>
          {isPreviewing ? (
            <div className="flex flex-col gap-2">
              {parsedItems.map((item, index) => (
                <p key={`${index}-${item}`}>
                  {index + 1}. {item}
                </p>
              ))}
              {parsedItems.length <= 1 && (
                <p className="text-sm text-muted-foreground">
                  {t("profile.editor.ambiguousBulletPaste")}
                </p>
              )}
            </div>
          ) : (
            <Textarea
              aria-label={t("profile.editor.pasteContent")}
              className="min-h-40 resize-y"
              onChange={(event) => setPasteValue(event.target.value)}
              value={pasteValue}
            />
          )}
          <DialogFooter>
            {isPreviewing ? (
              <>
                <Button onClick={() => setIsPreviewing(false)} type="button" variant="outline">
                  {t("profile.editor.backToEdit")}
                </Button>
                <Button
                  onClick={() => {
                    onChange(shouldReplace ? parsedItems : [...items, ...parsedItems])
                    closePasteDialog()
                  }}
                  type="button"
                >
                  {t("profile.editor.applyBullets")}
                </Button>
              </>
            ) : (
              <>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    checked={shouldReplace}
                    name="bullet-paste-mode"
                    onChange={() => setShouldReplace(true)}
                    type="radio"
                  />
                  {t("profile.editor.replaceBullets")}
                </label>
                <label className="mr-auto flex items-center gap-2 text-sm text-muted-foreground">
                  <input
                    checked={!shouldReplace}
                    name="bullet-paste-mode"
                    onChange={() => setShouldReplace(false)}
                    type="radio"
                  />
                  {t("profile.editor.appendBullets")}
                </label>
                <Button onClick={closePasteDialog} type="button" variant="outline">
                  {t("profile.editor.cancel")}
                </Button>
                <Button onClick={() => setIsPreviewing(true)} type="button">
                  {t("profile.editor.previewBullets")}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Field>
  )
}
