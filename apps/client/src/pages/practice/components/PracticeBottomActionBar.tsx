import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

type PracticeBottomActionBarProps = {
  actionsTestId: string
  ariaLabel: string
  children: ReactNode
  error?: ReactNode
  testId: string
}

export function PracticeBottomActionBar({
  actionsTestId,
  ariaLabel,
  children,
  error,
  testId,
}: PracticeBottomActionBarProps) {
  return (
    <section
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur transition-[left] duration-200 ease-linear md:left-(--sidebar-width) md:group-has-data-[collapsible=icon]/sidebar-wrapper:left-(--sidebar-width-icon)"
      aria-label={ariaLabel}
      data-testid={testId}
    >
      <div className="px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-6">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-3">
          {error}
          <div
            className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2 sm:flex sm:flex-wrap"
            data-testid={actionsTestId}
          >
            {children}
          </div>
        </div>
      </div>
    </section>
  )
}

export function PracticeActionErrorAlert({ description }: { description: string }) {
  const { t } = useTranslation()

  return (
    <Alert role="alert" variant="destructive">
      <AlertTitle>{t("practice.errors.actionTitle")}</AlertTitle>
      <AlertDescription>{description}</AlertDescription>
    </Alert>
  )
}
