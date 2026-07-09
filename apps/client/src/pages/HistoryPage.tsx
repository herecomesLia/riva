import { useTranslation } from "react-i18next"

import { PagePlaceholder } from "@/components/layout/PagePlaceholder"

export function HistoryPage() {
  const { t } = useTranslation()

  return (
    <PagePlaceholder
      badge={t("placeholderPages.history.badge")}
      description={t("placeholderPages.history.description")}
      title={t("placeholderPages.history.title")}
    />
  )
}
