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

export function formatFileSize(fileSize: number, language: string) {
  return new Intl.NumberFormat(language, {
    maximumFractionDigits: 1,
    style: "unit",
    unit: fileSize >= 1_000_000 ? "megabyte" : "kilobyte",
    unitDisplay: "short",
  }).format(fileSize >= 1_000_000 ? fileSize / 1_000_000 : fileSize / 1_000)
}

export function employmentTypeLabel(type: EmploymentType, t: TFunction) {
  return t(`profile.employmentType.${type}`)
}
