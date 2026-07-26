import { CalendarDaysIcon } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

type LocalizedMonthPickerProps = {
  disabled?: boolean
  id: string
  invalid?: boolean
  onBlur?: () => void
  onChange: (value: string) => void
  value: string
}

const minimumYear = 1950

function parseMonthValue(value: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(value)

  if (!match) {
    return null
  }

  const year = Number(match[1])
  const month = Number(match[2])

  if (month < 1 || month > 12) {
    return null
  }

  return { month: match[2], year }
}

function formatMonthValue(value: string, locale: string) {
  const parsed = parseMonthValue(value)

  if (!parsed) {
    return ""
  }

  return new Intl.DateTimeFormat(locale, {
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(Date.UTC(parsed.year, Number(parsed.month) - 1, 1)))
}

export function LocalizedMonthPicker({
  disabled = false,
  id,
  invalid = false,
  onBlur,
  onChange,
  value,
}: LocalizedMonthPickerProps) {
  const { i18n, t } = useTranslation()
  const locale = i18n.resolvedLanguage ?? i18n.language
  const parsedValue = parseMonthValue(value)
  const currentYear = new Date().getFullYear()
  const maximumYear = currentYear + 10
  const firstYear = Math.max(maximumYear, parsedValue?.year ?? maximumYear)
  const lastYear = Math.min(minimumYear, parsedValue?.year ?? minimumYear)
  const yearOptions = Array.from({ length: firstYear - lastYear + 1 }, (_, index) => {
    const year = String(firstYear - index)
    return { label: year, value: year }
  })
  const monthOptions = Array.from({ length: 12 }, (_, index) => ({
    label: new Intl.DateTimeFormat(locale, {
      month: "long",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(2000, index, 1))),
    value: String(index + 1).padStart(2, "0"),
  }))
  const monthSelectItems = [
    { label: t("profile.monthPicker.placeholder"), value: null },
    ...monthOptions,
  ]
  const [open, setOpen] = useState(false)
  const [selectedYear, setSelectedYear] = useState(String(parsedValue?.year ?? currentYear))
  const [selectedMonth, setSelectedMonth] = useState(parsedValue?.month ?? "")

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setSelectedYear(String(parsedValue?.year ?? currentYear))
      setSelectedMonth(parsedValue?.month ?? "")
    }

    setOpen(nextOpen)
  }

  return (
    <Popover onOpenChange={handleOpenChange} open={open}>
      <PopoverTrigger
        disabled={disabled}
        render={
          <Button
            aria-invalid={invalid}
            className="w-full min-w-0 justify-between font-normal"
            disabled={disabled}
            id={id}
            onBlur={onBlur}
            type="button"
            variant="outline"
          />
        }
      >
        <span className={cn("min-w-0 truncate text-left", !value && "text-muted-foreground")}>
          {value ? formatMonthValue(value, locale) : t("profile.monthPicker.placeholder")}
        </span>
        <CalendarDaysIcon aria-hidden="true" data-icon="inline-end" />
      </PopoverTrigger>

      <PopoverContent align="start">
        <Field>
          <FieldLabel htmlFor={`${id}-year`}>{t("profile.monthPicker.year")}</FieldLabel>
          <Select
            items={yearOptions}
            onValueChange={(year) => {
              if (year) {
                setSelectedYear(year)
                setSelectedMonth("")
              }
            }}
            value={selectedYear}
          >
            <SelectTrigger className="w-full" id={`${id}-year`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectGroup>
                {yearOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>

        <Field>
          <FieldLabel htmlFor={`${id}-month`}>{t("profile.monthPicker.month")}</FieldLabel>
          <Select
            items={monthSelectItems}
            onValueChange={(month) => {
              if (!month) return

              const nextValue = `${selectedYear}-${month}`
              setSelectedMonth(month)
              if (nextValue !== value) onChange(nextValue)
              setOpen(false)
            }}
            value={selectedMonth || null}
          >
            <SelectTrigger className="w-full" id={`${id}-month`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectGroup>
                {monthOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>

        <Button
          disabled={!value}
          onClick={() => {
            onChange("")
            setOpen(false)
          }}
          type="button"
          variant="outline"
        >
          {t("profile.monthPicker.clear")}
        </Button>
      </PopoverContent>
    </Popover>
  )
}
