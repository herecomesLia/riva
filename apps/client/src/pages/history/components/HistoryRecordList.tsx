import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CalendarClockIcon,
  ChevronRightIcon,
  ClipboardListIcon,
  MessageSquareTextIcon,
  SearchXIcon,
  SparklesIcon,
} from "lucide-react"
import { Link } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import type {
  TrainingRecordsPageResponse,
  TrainingRecordStatus,
  TrainingRecordSummary,
} from "@/models/training-records"

import type { HistoryRouteSearch } from "../history-navigation"

export function HistoryRecordList({
  emptyReason,
  loading,
  onClearFilters,
  onPageChange,
  page,
  search,
}: {
  emptyReason?: "neverTrained" | "noMatches"
  loading: boolean
  onClearFilters: () => void
  onPageChange: (page: number) => void
  page: TrainingRecordsPageResponse | null
  search: HistoryRouteSearch
}) {
  const { t } = useTranslation()

  return (
    <section aria-labelledby="history-records-title" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h2 className="font-heading text-lg font-semibold" id="history-records-title">
            {t("history.records.title")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("history.records.description")}</p>
        </div>
        {!loading && page && (
          <p className="text-sm text-muted-foreground">
            {t("history.records.resultCount", { count: page.pagination.totalItems })}
          </p>
        )}
      </div>

      {loading ? (
        <div className="flex flex-col gap-3" data-testid="history-records-loading">
          {Array.from({ length: 3 }, (_, index) => (
            <RecordSkeleton key={index} />
          ))}
        </div>
      ) : emptyReason ? (
        <HistoryEmpty reason={emptyReason} onClearFilters={onClearFilters} />
      ) : (
        page && (
          <>
            <div className="flex flex-col gap-3">
              {page.items.map((record) => (
                <HistoryRecordCard key={record.id} record={record} search={search} />
              ))}
            </div>
            {page.pagination.totalPages > 1 && (
              <nav
                aria-label={t("history.pagination.label")}
                className="flex items-center justify-between gap-3"
              >
                <Button
                  disabled={page.pagination.page <= 1}
                  onClick={() => onPageChange(page.pagination.page - 1)}
                  variant="outline"
                >
                  <ArrowLeftIcon aria-hidden="true" data-icon="inline-start" />
                  {t("history.pagination.previous")}
                </Button>
                <p className="text-sm text-muted-foreground">
                  {t("history.pagination.page", {
                    page: page.pagination.page,
                    total: page.pagination.totalPages,
                  })}
                </p>
                <Button
                  disabled={page.pagination.page >= page.pagination.totalPages}
                  onClick={() => onPageChange(page.pagination.page + 1)}
                  variant="outline"
                >
                  {t("history.pagination.next")}
                  <ArrowRightIcon aria-hidden="true" data-icon="inline-end" />
                </Button>
              </nav>
            )}
          </>
        )
      )}
    </section>
  )
}

function HistoryRecordCard({
  record,
  search,
}: {
  record: TrainingRecordSummary
  search: HistoryRouteSearch
}) {
  const { i18n, t } = useTranslation()
  const KindIcon = record.kind === "targetedPractice" ? ClipboardListIcon : MessageSquareTextIcon
  const kindLabel = t(`history.filters.kinds.${record.kind}`)
  const detailLabel =
    record.kind === "targetedPractice"
      ? t(`history.questionTypes.${record.questionType}`)
      : t(`history.rounds.${record.round}`)
  const detailLink =
    record.kind === "targetedPractice" ? (
      <Link params={{ recordId: record.id }} search={search} to="/history/practice/$recordId" />
    ) : (
      <Link params={{ recordId: record.id }} search={search} to="/history/interview/$recordId" />
    )

  return (
    <Card size="sm">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>
                <KindIcon aria-hidden="true" data-icon="inline-start" />
                {kindLabel}
              </Badge>
              <Badge variant={statusBadgeVariant(record.status)}>
                {t(`history.status.${record.status}`)}
              </Badge>
              <Badge variant="outline">{detailLabel}</Badge>
              <Badge variant="outline">{t(`history.difficulty.${record.difficulty}`)}</Badge>
            </div>
            <CardTitle className="text-base">{formatRole(record)}</CardTitle>
          </div>
          <p className="flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground">
            <CalendarClockIcon aria-hidden="true" className="size-4" />
            <time dateTime={record.startedAt}>
              {formatDateTime(record.startedAt, i18n.language)}
            </time>
          </p>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 @3xl/app:grid-cols-[minmax(0,1fr)_auto]">
        <div className="flex min-w-0 flex-col gap-1.5">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <SparklesIcon aria-hidden="true" className="size-4" />
            {t("history.records.reviewLabel")}
          </p>
          <p className="line-clamp-2 leading-6">
            {record.reviewSummary ?? t("history.records.noReview")}
          </p>
        </div>
        <dl className="grid grid-cols-1 gap-4 text-sm @sm/app:grid-cols-3 @3xl/app:min-w-72">
          <RecordDatum
            label={t("history.overview.metrics.duration")}
            value={t("history.records.duration", {
              minutes: Math.max(1, Math.round(record.durationSeconds / 60)),
            })}
          />
          <RecordDatum
            label={t("history.records.questionLabel")}
            value={t("history.records.questionCount", {
              answered: record.answeredQuestionCount,
              total: record.totalQuestionCount,
            })}
          />
          <RecordDatum
            label={t("history.overview.metrics.averageScore")}
            value={
              record.overallScore === null
                ? t("history.records.noScore")
                : t("history.records.score", { score: record.overallScore })
            }
          />
        </dl>
      </CardContent>
      <CardFooter className="justify-end">
        <Button
          aria-label={t("history.records.viewDetailsLabel", {
            date: formatDateTime(record.startedAt, i18n.language),
            kind: kindLabel,
            role: record.targetRole.title,
          })}
          nativeButton={false}
          render={detailLink}
          variant="ghost"
        >
          {t("history.records.viewDetails")}
          <ChevronRightIcon aria-hidden="true" data-icon="inline-end" />
        </Button>
      </CardFooter>
    </Card>
  )
}

function RecordDatum({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="truncate text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  )
}

function HistoryEmpty({
  onClearFilters,
  reason,
}: {
  onClearFilters: () => void
  reason: "neverTrained" | "noMatches"
}) {
  const { t } = useTranslation()

  return (
    <Card>
      <CardContent>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              {reason === "neverTrained" ? <SparklesIcon /> : <SearchXIcon />}
            </EmptyMedia>
            <EmptyTitle>{t(`history.empty.${reason}.title`)}</EmptyTitle>
            <EmptyDescription>{t(`history.empty.${reason}.description`)}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            {reason === "neverTrained" ? (
              <Button nativeButton={false} render={<Link to="/practice" />}>
                {t("history.empty.neverTrained.action")}
              </Button>
            ) : (
              <Button onClick={onClearFilters} variant="outline">
                {t("history.empty.noMatches.action")}
              </Button>
            )}
          </EmptyContent>
        </Empty>
      </CardContent>
    </Card>
  )
}

function RecordSkeleton() {
  return (
    <Card size="sm">
      <CardHeader>
        <div className="flex flex-wrap justify-between gap-3">
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-5 w-16" />
            </div>
            <Skeleton className="h-5 w-48" />
          </div>
          <Skeleton className="h-4 w-36" />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-3/4" />
      </CardContent>
    </Card>
  )
}

function statusBadgeVariant(status: TrainingRecordStatus): "default" | "secondary" | "outline" {
  if (status === "completed") return "secondary"
  if (status === "partiallyCompleted") return "default"
  return "outline"
}

function formatRole(record: TrainingRecordSummary): string {
  return record.targetRole.company
    ? `${record.targetRole.title} · ${record.targetRole.company}`
    : record.targetRole.title
}

function formatDateTime(value: string, language: string): string {
  return new Intl.DateTimeFormat(language, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}
