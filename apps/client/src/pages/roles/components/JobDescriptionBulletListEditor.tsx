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
import { parseBulletItems } from "@/lib/text"

type JobDescriptionBulletListEditorProps = {
  description?: string
  items: string[]
  label: string
  onChange: (items: string[]) => void
}

export function JobDescriptionBulletListEditor({
  description,
  items,
  label,
  onChange,
}: JobDescriptionBulletListEditorProps) {
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
          <p className="text-sm text-muted-foreground">
            {t("roles.jd.analysisEditor.bulletListEmpty")}
          </p>
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
              aria-label={t("roles.jd.analysisEditor.deleteBullet", { count: index + 1 })}
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
            {t("roles.jd.analysisEditor.addBullet")}
          </Button>
          <Button onClick={() => setIsPasteDialogOpen(true)} type="button" variant="outline">
            {t("roles.jd.analysisEditor.pasteAndOrganize")}
          </Button>
        </div>
      </div>

      <Dialog onOpenChange={(open) => !open && closePasteDialog()} open={isPasteDialogOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b px-6 py-5 pr-14">
            <DialogTitle className="text-xl font-medium leading-tight">
              {isPreviewing
                ? t("roles.jd.analysisEditor.organizedResult")
                : t("roles.jd.analysisEditor.pasteContent")}
            </DialogTitle>
            <DialogDescription>
              {isPreviewing
                ? t("roles.jd.analysisEditor.organizedResultDescription")
                : t("roles.jd.analysisEditor.pasteContentDescription")}
            </DialogDescription>
          </DialogHeader>
          <div
            className="min-h-0 overflow-y-auto px-6 py-5"
            data-testid="job-description-bullet-editor-scroll"
          >
            {isPreviewing ? (
              <div className="flex flex-col gap-2">
                {parsedItems.map((item, index) => (
                  <p key={`${index}-${item}`}>
                    {index + 1}. {item}
                  </p>
                ))}
                {parsedItems.length <= 1 && (
                  <p className="text-sm text-muted-foreground">
                    {t("roles.jd.analysisEditor.ambiguousBulletPaste")}
                  </p>
                )}
              </div>
            ) : (
              <Textarea
                aria-label={t("roles.jd.analysisEditor.pasteContent")}
                className="min-h-40 resize-y"
                onChange={(event) => setPasteValue(event.target.value)}
                value={pasteValue}
              />
            )}
          </div>
          <DialogFooter className="border-t bg-popover px-6 py-4">
            {isPreviewing ? (
              <>
                <Button onClick={() => setIsPreviewing(false)} type="button" variant="outline">
                  {t("roles.jd.analysisEditor.backToEdit")}
                </Button>
                <Button
                  onClick={() => {
                    onChange(shouldReplace ? parsedItems : [...items, ...parsedItems])
                    closePasteDialog()
                  }}
                  type="button"
                >
                  {t("roles.jd.analysisEditor.applyBullets")}
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
                  {t("roles.jd.analysisEditor.replaceBullets")}
                </label>
                <label className="mr-auto flex items-center gap-2 text-sm text-muted-foreground">
                  <input
                    checked={!shouldReplace}
                    name="bullet-paste-mode"
                    onChange={() => setShouldReplace(false)}
                    type="radio"
                  />
                  {t("roles.jd.analysisEditor.appendBullets")}
                </label>
                <Button onClick={closePasteDialog} type="button" variant="outline">
                  {t("roles.editor.cancel")}
                </Button>
                <Button onClick={() => setIsPreviewing(true)} type="button">
                  {t("roles.jd.analysisEditor.previewBullets")}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Field>
  )
}
