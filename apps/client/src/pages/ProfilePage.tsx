import { useQuery } from "@tanstack/react-query"
import { AlertCircleIcon, InboxIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { PagePlaceholder } from "@/components/layout/PagePlaceholder"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { getResumeProfileViewModel, type PageViewState } from "@/services/auth"

export function ProfilePage() {
  const { t } = useTranslation()
  const profileQuery = useQuery({
    queryFn: getResumeProfileViewModel,
    queryKey: ["resume-profile-view-model"],
  })
  const viewState: PageViewState = profileQuery.isPending
    ? "loading"
    : profileQuery.isError
      ? "error"
      : profileQuery.data.state

  return (
    <div className="flex flex-col gap-6">
      <PagePlaceholder
        badge={t("placeholderPages.profile.badge")}
        description={t("placeholderPages.profile.description")}
        title={t("placeholderPages.profile.title")}
      />

      {viewState === "loading" && <ProfileLoadingCard />}
      {viewState === "empty" && (
        <ProfileStateCard
          description={t("common.pageState.empty.description")}
          icon={InboxIcon}
          title={t("common.pageState.empty.title")}
        />
      )}
      {viewState === "error" && (
        <ProfileStateCard
          description={t("common.pageState.error.description")}
          icon={AlertCircleIcon}
          title={t("common.pageState.error.title")}
        />
      )}
    </div>
  )
}

function ProfileLoadingCard() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-72" />
      </CardHeader>
    </Card>
  )
}

function ProfileStateCard({
  description,
  icon: Icon,
  title,
}: {
  description: string
  icon: typeof InboxIcon
  title: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon data-icon="inline-start" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </Card>
  )
}
