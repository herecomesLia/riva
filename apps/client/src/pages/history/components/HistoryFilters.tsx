import { CalendarRangeIcon, TargetIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel, FieldSet, FieldLegend } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { TrainingRecordTargetRole } from "@/models/training-records"

import type { HistoryFiltersValue, HistoryKindFilter, HistoryTimeRange } from "../history-types"

const kinds: HistoryKindFilter[] = ["all", "targetedPractice", "mockInterview"]
const periods: HistoryTimeRange[] = ["all", "last7Days", "last30Days", "last90Days"]

export function HistoryFilters({
  filters,
  loading,
  onChange,
  targetRoles,
}: {
  filters: HistoryFiltersValue
  loading: boolean
  onChange: (filters: HistoryFiltersValue) => void
  targetRoles: TrainingRecordTargetRole[]
}) {
  const { t } = useTranslation()
  const selectedRole = targetRoles.find((role) => role.id === filters.targetRoleId)

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t("history.filters.title")}</h2>
        </CardTitle>
        <CardDescription>{t("history.filters.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="grid gap-5 @3xl/app:grid-cols-[1.5fr_1fr_1fr]">
            <FilterSkeleton />
            <FilterSkeleton />
            <FilterSkeleton />
          </div>
        ) : (
          <FieldGroup className="grid gap-5 @3xl/app:grid-cols-[1.5fr_1fr_1fr]">
            <FieldSet>
              <FieldLegend variant="label">{t("history.filters.kindLabel")}</FieldLegend>
              <ToggleGroup
                aria-label={t("history.filters.kindLabel")}
                className="flex-wrap justify-start"
                onValueChange={(values) => {
                  const kind = values[0] as HistoryKindFilter | undefined
                  if (kind) onChange({ ...filters, kind })
                }}
                spacing={0}
                value={[filters.kind]}
                variant="outline"
              >
                {kinds.map((kind) => (
                  <ToggleGroupItem key={kind} value={kind}>
                    {t(`history.filters.kinds.${kind}`)}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </FieldSet>

            <Field>
              <FieldLabel htmlFor="history-target-role">
                <TargetIcon aria-hidden="true" />
                {t("history.filters.roleLabel")}
              </FieldLabel>
              <Select
                onValueChange={(targetRoleId) => {
                  if (targetRoleId) onChange({ ...filters, targetRoleId })
                }}
                value={filters.targetRoleId}
              >
                <SelectTrigger className="w-full" id="history-target-role">
                  <SelectValue>
                    {selectedRole ? formatRole(selectedRole) : t("history.filters.allRoles")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent align="start" alignItemWithTrigger={false}>
                  <SelectGroup>
                    <SelectItem value="all">{t("history.filters.allRoles")}</SelectItem>
                    {targetRoles.map((role) => (
                      <SelectItem key={role.id} value={role.id}>
                        {formatRole(role)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel htmlFor="history-time-range">
                <CalendarRangeIcon aria-hidden="true" />
                {t("history.filters.periodLabel")}
              </FieldLabel>
              <Select
                onValueChange={(timeRange) => {
                  if (timeRange) onChange({ ...filters, timeRange: timeRange as HistoryTimeRange })
                }}
                value={filters.timeRange}
              >
                <SelectTrigger className="w-full" id="history-time-range">
                  <SelectValue>{t(`history.filters.periods.${filters.timeRange}`)}</SelectValue>
                </SelectTrigger>
                <SelectContent align="start" alignItemWithTrigger={false}>
                  <SelectGroup>
                    {periods.map((period) => (
                      <SelectItem key={period} value={period}>
                        {t(`history.filters.periods.${period}`)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
        )}
      </CardContent>
    </Card>
  )
}

function formatRole(role: TrainingRecordTargetRole): string {
  return role.company ? `${role.title} · ${role.company}` : role.title
}

function FilterSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-9 w-full" />
    </div>
  )
}
