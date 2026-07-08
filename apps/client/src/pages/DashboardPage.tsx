import { CalendarDaysIcon, ClipboardCheckIcon, SparklesIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

const summaryCards = [
  {
    badgeKey: "dashboard.cards.currentRole.badge",
    descriptionKey: "dashboard.cards.currentRole.description",
    icon: ClipboardCheckIcon,
    titleKey: "dashboard.cards.currentRole.title",
  },
  {
    badgeKey: "dashboard.cards.nextSession.badge",
    descriptionKey: "dashboard.cards.nextSession.description",
    icon: CalendarDaysIcon,
    titleKey: "dashboard.cards.nextSession.title",
  },
  {
    badgeKey: "dashboard.cards.recommendation.badge",
    descriptionKey: "dashboard.cards.recommendation.description",
    icon: SparklesIcon,
    titleKey: "dashboard.cards.recommendation.title",
  },
]

export function DashboardPage() {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Badge className="w-fit" variant="outline">
          {t("dashboard.badge")}
        </Badge>
        <h1 className="font-heading text-2xl font-medium">{t("dashboard.title")}</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          {t("dashboard.description")}
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        {summaryCards.map((card) => {
          const Icon = card.icon

          return (
            <Card key={card.titleKey}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Icon data-icon="inline-start" />
                  {t(card.titleKey)}
                </CardTitle>
                <CardDescription>{t(card.descriptionKey)}</CardDescription>
              </CardHeader>
              <CardContent>
                <Skeleton className="h-16 w-full" />
              </CardContent>
              <CardFooter>
                <Badge variant="secondary">{t(card.badgeKey)}</Badge>
              </CardFooter>
            </Card>
          )
        })}
      </section>
    </div>
  )
}
