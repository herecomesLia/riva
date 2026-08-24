import type { TFunction } from "i18next"

import type { EmploymentType } from "@/models/profile"

export function formatDate(value: string, language: string) {
  return new Intl.DateTimeFormat(language, { dateStyle: "medium" }).format(new Date(value))
}

export function formatMonth(value: string | null, language: string, present: string) {
  if (!value) {
    return present
  }

  return new Intl.DateTimeFormat(language, { month: "short", year: "numeric" }).format(
    new Date(`${value}-01T00:00:00.000Z`),
  )
}

export function employmentTypeLabel(type: EmploymentType | null, t: TFunction) {
  return type ? t(`profile.employmentType.${type}`) : "—"
}
