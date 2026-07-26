import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { useEffect, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type ProfileItemCarouselProps<T> = {
  getItemKey: (item: T) => string
  itemCardClassName?: string
  items: T[]
  renderItem: (item: T) => ReactNode
  sectionLabel: string
}

const carouselArrowClassName =
  "pointer-events-auto bg-transparent opacity-40 transition-opacity hover:bg-transparent hover:opacity-100 focus-visible:bg-transparent focus-visible:opacity-100 active:!translate-y-0 active:bg-transparent dark:hover:bg-transparent dark:focus-visible:bg-transparent"

export function ProfileItemCarousel<T>({
  getItemKey,
  itemCardClassName,
  items,
  renderItem,
  sectionLabel,
}: ProfileItemCarouselProps<T>) {
  const { t } = useTranslation()
  const [currentIndex, setCurrentIndex] = useState(0)

  useEffect(() => {
    setCurrentIndex((index) => Math.min(index, Math.max(items.length - 1, 0)))
  }, [items.length])

  if (items.length === 0) {
    return null
  }

  const safeIndex = Math.min(currentIndex, items.length - 1)
  const currentItem = items[safeIndex]
  const hasMultipleItems = items.length > 1
  const canGoPrevious = safeIndex > 0
  const canGoNext = safeIndex < items.length - 1

  function showPrevious() {
    setCurrentIndex((index) => Math.max(0, index - 1))
  }

  function showNext() {
    setCurrentIndex((index) => Math.min(items.length - 1, index + 1))
  }

  return (
    <div
      className={cn(
        "relative flex flex-1 rounded-xl border bg-background/60 py-4",
        hasMultipleItems ? "px-11" : "px-4",
        itemCardClassName,
      )}
    >
      <div aria-live="polite" className="min-w-0 flex-1" key={getItemKey(currentItem)}>
        {renderItem(currentItem)}
      </div>
      {canGoPrevious && (
        <div className="pointer-events-none absolute inset-y-0 left-2 flex items-center">
          <Button
            aria-label={t("profile.carousel.previous", { section: sectionLabel })}
            className={carouselArrowClassName}
            onClick={showPrevious}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <ChevronLeftIcon />
          </Button>
        </div>
      )}
      {canGoNext && (
        <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
          <Button
            aria-label={t("profile.carousel.next", { section: sectionLabel })}
            className={carouselArrowClassName}
            onClick={showNext}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <ChevronRightIcon />
          </Button>
        </div>
      )}
    </div>
  )
}
