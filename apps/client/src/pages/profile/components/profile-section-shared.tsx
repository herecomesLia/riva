import { useTranslation } from "react-i18next"
import type { LucideIcon } from "lucide-react"

import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { cn } from "@/lib/utils"

import { formatMonth } from "./profile-formatters"

export function EmptySection() {
  const { t } = useTranslation()

  return (
    <Empty className="min-h-36 p-6">
      <EmptyHeader>
        <EmptyTitle>{t("profile.emptySection")}</EmptyTitle>
        <EmptyDescription>{t("profile.emptySection")}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

export function DateRange({
  className,
  endDate,
  startDate,
}: {
  className?: string
  endDate: string | null
  startDate: string
}) {
  const { i18n, t } = useTranslation()
  const start = formatMonth(startDate, i18n.language, "—")
  const end =
    endDate === null ? t("profile.field.present") : formatMonth(endDate, i18n.language, "—")

  return (
    <span className={cn("text-sm text-muted-foreground", className)}>
      {t("profile.field.dateRange", {
        end,
        start,
      })}
    </span>
  )
}

export function DetailList({
  icon: Icon,
  items,
  title,
}: {
  icon?: LucideIcon
  items: string[]
  title: string
}) {
  if (items.length === 0) {
    return null
  }

  return (
    <div className="flex flex-col gap-2">
      <h4 className="flex items-center gap-2 text-sm font-medium">
        {Icon && <Icon aria-hidden="true" className="size-4 shrink-0 text-primary" />}
        {title}
      </h4>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-sm leading-6 text-muted-foreground">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  )
}
