import { AlertCircleIcon, BriefcaseBusinessIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"

export function RolesLoadingState() {
  const { t } = useTranslation()

  return (
    <div
      aria-busy="true"
      className="grid items-start gap-6 lg:grid-cols-[23rem_minmax(0,1fr)]"
      data-testid="roles-loading-state"
    >
      <Card data-testid="roles-list-loading-card">
        <CardHeader>
          <CardTitle>
            <h2>{t("roles.list.title")}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {Array.from({ length: 3 }, (_, index) => (
            <div className="flex flex-col gap-2 rounded-lg p-3" key={index}>
              <Skeleton className="h-5 w-4/5" />
              <Skeleton className="h-4 w-3/5" />
              <Skeleton className="h-5 w-20" />
            </div>
          ))}
        </CardContent>
      </Card>
      <Card data-testid="role-details-loading-card">
        <CardHeader>
          <CardTitle>
            <h2>{t("roles.details.title")}</h2>
          </CardTitle>
          <CardDescription>{t("roles.details.description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <Skeleton className="h-7 w-2/5" />
            <Skeleton className="h-5 w-1/4" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 4 }, (_, index) => (
              <div className="flex flex-col gap-2" key={index}>
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-5 w-3/4" />
              </div>
            ))}
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <Skeleton className="h-32 w-full rounded-2xl" />
            <Skeleton className="h-32 w-full rounded-2xl" />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export function RolesErrorState({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation()

  return (
    <Card role="alert">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertCircleIcon />
          {t("common.pageState.error.title")}
        </CardTitle>
        <CardDescription>{t("common.pageState.error.description")}</CardDescription>
      </CardHeader>
      <CardFooter>
        <Button onClick={onRetry}>{t("roles.actions.retry")}</Button>
      </CardFooter>
    </Card>
  )
}

export function RolesEmptyState() {
  const { t } = useTranslation()

  return (
    <Card data-testid="roles-empty-state">
      <CardContent>
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BriefcaseBusinessIcon />
            </EmptyMedia>
            <EmptyTitle>{t("roles.empty.title")}</EmptyTitle>
            <EmptyDescription>{t("roles.empty.description")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </CardContent>
    </Card>
  )
}

export function RolesNoSelectionState() {
  const { t } = useTranslation()

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t("roles.details.title")}</h2>
        </CardTitle>
        <CardDescription>{t("roles.details.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{t("roles.noSelection.title")}</EmptyTitle>
            <EmptyDescription>{t("roles.noSelection.description")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </CardContent>
    </Card>
  )
}
