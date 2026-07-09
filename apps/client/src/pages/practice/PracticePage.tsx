import { useTranslation } from "react-i18next"

import { PagePlaceholder } from "@/components/layout/PagePlaceholder"

export function PracticePage() {
  const { t } = useTranslation()

  return (
    <PagePlaceholder
      badge={t("placeholderPages.practice.badge")}
      description={t("placeholderPages.practice.description")}
      title={t("placeholderPages.practice.title")}
    />
  )
}
