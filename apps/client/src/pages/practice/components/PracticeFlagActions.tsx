import { BookmarkIcon, BrainIcon } from "lucide-react"
import type { ComponentProps } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

type PracticeFlagActionsProps = {
  disabled: boolean
  isWeak: boolean
  isSaved: boolean
  isSavedPending: boolean
  isWeakPending: boolean
  onSavedClick: () => void
  onWeakClick: () => void
  variant: ComponentProps<typeof Button>["variant"]
}

export function PracticeFlagActions({
  disabled,
  isWeak,
  isSaved,
  isSavedPending,
  isWeakPending,
  onSavedClick,
  onWeakClick,
  variant,
}: PracticeFlagActionsProps) {
  const { t } = useTranslation()

  return (
    <>
      <Button
        className="w-full sm:w-auto"
        aria-pressed={isSaved}
        disabled={disabled}
        onClick={onSavedClick}
        type="button"
        variant={variant}
      >
        {isSavedPending ? (
          <Spinner aria-hidden="true" data-icon="inline-start" />
        ) : (
          <BookmarkIcon
            className={cn(isSaved && "fill-destructive text-destructive")}
            data-icon="inline-start"
          />
        )}
        {isSaved ? t("practice.questionActions.unsave") : t("practice.questionActions.save")}
      </Button>
      <Button
        className="w-full sm:w-auto"
        aria-pressed={isWeak}
        disabled={disabled}
        onClick={onWeakClick}
        type="button"
        variant={variant}
      >
        {isWeakPending ? (
          <Spinner aria-hidden="true" data-icon="inline-start" />
        ) : (
          <BrainIcon className={cn(isWeak && "text-amber-500")} data-icon="inline-start" />
        )}
        {isWeak ? t("practice.questionActions.unmarkWeak") : t("practice.questionActions.markWeak")}
      </Button>
    </>
  )
}
