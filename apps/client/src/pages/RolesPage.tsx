import { useTranslation } from "react-i18next"

import { PagePlaceholder } from "@/components/layout/PagePlaceholder"

export function RolesPage() {
  const { t } = useTranslation()

  return (
    <PagePlaceholder
      badge={t("placeholderPages.roles.badge")}
      description={t("placeholderPages.roles.description")}
      title={t("placeholderPages.roles.title")}
    />
  )
}
