import { InfoIcon, ListChecksIcon } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { JobProfile, ProfileSection } from "@/models/profile"

function sectionLabels(sections: ProfileSection[], language: string, t: (key: string) => string) {
  return new Intl.ListFormat(language, { style: "long", type: "conjunction" }).format(
    sections.map((section) => t(`profile.sections.${section}`)),
  )
}

export function ProfileSupportingInfo({ profile }: { profile: JobProfile }) {
  const { i18n, t } = useTranslation()
  const { missingSections, needsReviewSections } = profile.completeness
  const hasPendingItems = missingSections.length > 0 || needsReviewSections.length > 0

  return (
    <section className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ListChecksIcon className="size-5" />
            <h2>{t("profile.helper.pendingTitle")}</h2>
          </CardTitle>
          <CardDescription>{t("profile.helper.pendingDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
          {hasPendingItems ? (
            <>
              {missingSections.length > 0 && (
                <p>
                  {t("profile.helper.missing", {
                    sections: sectionLabels(missingSections, i18n.language, t),
                  })}
                </p>
              )}
              {needsReviewSections.length > 0 && (
                <p>
                  {t("profile.helper.needsReview", {
                    sections: sectionLabels(needsReviewSections, i18n.language, t),
                  })}
                </p>
              )}
            </>
          ) : (
            <p>{t("profile.helper.allClear")}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <InfoIcon className="size-5" />
            <h2>{t("profile.helper.title")}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-6 text-muted-foreground">
            {t("profile.helper.description")}
          </p>
        </CardContent>
      </Card>
    </section>
  )
}
