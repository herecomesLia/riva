import { Link } from "@tanstack/react-router"
import { ArrowRightIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import type { DashboardResponse, DashboardWeaknessCategory } from "@/models/dashboard"
import type { Loadable } from "@/types"

const weaknessTitleKeys: Record<DashboardWeaknessCategory, string> = {
  pressureResponse: "dashboard.weaknesses.categories.pressureResponse",
  projectExpression: "dashboard.weaknesses.categories.projectExpression",
  quantifiedResults: "dashboard.weaknesses.categories.quantifiedResults",
}

type WeaknessesCardProps = {
  state: Loadable<DashboardResponse["weaknesses"]>
}

export function WeaknessesCard({ state }: WeaknessesCardProps) {
  const { t } = useTranslation()

  return (
    <Card className="min-w-0 @3xl/dashboard:col-span-5">
      <CardHeader>
        <CardTitle>{t("dashboard.weaknesses.eyebrow")}</CardTitle>
        {state.status === "loading" ? (
          <Skeleton className="h-4 w-4/5" />
        ) : (
          <CardDescription>{t("dashboard.weaknesses.description")}</CardDescription>
        )}
      </CardHeader>
      <CardContent>
        {state.status === "loading" ? (
          <WeaknessesLoadingContent />
        ) : state.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("dashboard.weaknesses.empty")}</p>
        ) : (
          <WeaknessesDataContent weaknesses={state.data} />
        )}
      </CardContent>
      <CardFooter>
        {state.status === "loading" ? (
          <Skeleton className="h-8 w-28" />
        ) : (
          <Button nativeButton={false} render={<Link to="/practice" />} size="sm" variant="link">
            {t("dashboard.actions.startPractice")}
            <ArrowRightIcon data-icon="inline-end" />
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}

function WeaknessesLoadingContent() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-5 w-2/5" />
          <Skeleton className="h-4 w-4/5" />
        </div>
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
    </div>
  )
}

function WeaknessesDataContent({ weaknesses }: { weaknesses: DashboardResponse["weaknesses"] }) {
  const { t } = useTranslation()

  return (
    <ul className="flex flex-col gap-3">
      {weaknesses.map((weakness, index) => (
        <li className="flex flex-col gap-3" key={weakness.id}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <p className="font-medium">{t(weaknessTitleKeys[weakness.category])}</p>
              <p className="text-sm text-muted-foreground">{weakness.description}</p>
            </div>
            <Badge className="shrink-0" variant="outline">
              {t("dashboard.weaknesses.recommendedPracticeCount", {
                count: weakness.recommendedPracticeCount,
              })}
            </Badge>
          </div>
          {index < weaknesses.length - 1 && <Separator />}
        </li>
      ))}
    </ul>
  )
}
