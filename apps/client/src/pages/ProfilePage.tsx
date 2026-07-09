import { useTranslation } from "react-i18next"

import { PagePlaceholder } from "@/components/layout/PagePlaceholder"

export function ProfilePage() {
  const { t } = useTranslation()

  return (
    <PagePlaceholder
      badge={t("placeholderPages.profile.badge")}
      description={t("placeholderPages.profile.description")}
      title={t("placeholderPages.profile.title")}
    />
  )
}
