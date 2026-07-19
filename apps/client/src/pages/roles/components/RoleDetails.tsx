import { useTranslation } from "react-i18next"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { ProfileContext, TargetRole } from "@/models/roles"

import { JobDescriptionCard } from "./JobDescriptionCard"
import { MatchingAnalysisCard } from "./MatchingAnalysisCard"
import { RoleStatusBadges } from "./RoleStatusBadges"
import { TargetRoleOverview } from "./TargetRoleOverview"

export type TargetRoleTab = "overview" | "job-description" | "matching-analysis"

export type RoleDetailsActions = {
  archive: () => void
  delete: () => void
  edit: () => void
  setCurrent: () => void
  togglePreparationStatus: () => void
  editJobDescription: () => void
  retryJobDescriptionParsing: () => void
  retryJobDescriptionSynchronization: () => void
  generateMatchingAnalysis: () => void
  retryMatchingAnalysisSynchronization: () => void
}

export function RoleDetails({
  actions,
  activeTab,
  onTabChange,
  pending,
  profileContext,
  role,
  jobDescriptionSynchronizationError = false,
  matchingAnalysisSynchronizationError = false,
}: {
  actions?: RoleDetailsActions
  activeTab: TargetRoleTab
  jobDescriptionSynchronizationError?: boolean
  matchingAnalysisSynchronizationError?: boolean
  onTabChange: (tab: TargetRoleTab) => void
  pending?: boolean
  profileContext: ProfileContext
  role: TargetRole
}) {
  const { i18n, t } = useTranslation()
  const updatedAt = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(role.updatedAt))

  return (
    <Card
      className="min-w-0 border border-border/80 bg-card shadow-sm"
      data-testid="role-details-card"
    >
      <CardHeader className="border-b border-border/70 pb-(--card-spacing)">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <CardTitle className="text-2xl font-semibold tracking-tight">
              <h2>{role.title}</h2>
            </CardTitle>
            <CardDescription>
              {role.company ?? t("roles.fallbackValue")} · {t("roles.summary.updatedAt")}{" "}
              {updatedAt}
            </CardDescription>
          </div>
          <RoleStatusBadges role={role} />
        </div>
      </CardHeader>

      <CardContent className="min-w-0">
        <Tabs
          className="min-w-0 gap-5"
          onValueChange={(value) => onTabChange(value as TargetRoleTab)}
          value={activeTab}
        >
          <div className="max-w-full overflow-x-auto" data-testid="target-role-tabs-scroll">
            <TabsList aria-label={t("roles.tabs.label")} className="min-w-max" variant="line">
              <TabsTrigger value="overview">{t("roles.tabs.overview")}</TabsTrigger>
              <TabsTrigger value="job-description">{t("roles.tabs.jobDescription")}</TabsTrigger>
              <TabsTrigger value="matching-analysis">
                {t("roles.tabs.matchingAnalysis")}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview">
            {activeTab === "overview" && (
              <TargetRoleOverview actions={actions} pending={pending} role={role} />
            )}
          </TabsContent>
          <TabsContent value="job-description">
            {activeTab === "job-description" && (
              <JobDescriptionCard
                onEdit={actions?.editJobDescription}
                onRetry={actions?.retryJobDescriptionParsing}
                onRetrySynchronization={actions?.retryJobDescriptionSynchronization}
                pending={pending}
                role={role}
                synchronizationError={jobDescriptionSynchronizationError}
              />
            )}
          </TabsContent>
          <TabsContent value="matching-analysis">
            {activeTab === "matching-analysis" && (
              <MatchingAnalysisCard
                onGenerate={actions?.generateMatchingAnalysis}
                onRetrySynchronization={actions?.retryMatchingAnalysisSynchronization}
                pending={pending}
                profileContext={profileContext}
                role={role}
                synchronizationError={matchingAnalysisSynchronizationError}
              />
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
