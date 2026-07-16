import { useTranslation } from "react-i18next"

import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"

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
  endDate,
  isCurrent,
  startDate,
}: {
  endDate: string | null
  isCurrent: boolean
  startDate: string | null
}) {
  const { i18n, t } = useTranslation()
  const start = formatMonth(startDate, i18n.language, "—")
  const end = isCurrent ? t("profile.field.present") : formatMonth(endDate, i18n.language, "—")

  return (
    <p className="text-sm text-muted-foreground">
      {t("profile.field.dateRange", {
        end,
        start,
      })}
    </p>
  )
}

export function DetailList({ items, title }: { items: string[]; title: string }) {
  if (items.length === 0) {
    return null
  }

  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-sm font-medium">{title}</h4>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-sm leading-6 text-muted-foreground">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  )
}
