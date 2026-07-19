import { useTranslation } from "react-i18next"

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
  const { t } = useTranslation()

  return (
    <section className="flex min-w-0 flex-col gap-4" data-testid="role-details-card">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="font-heading text-2xl font-semibold tracking-tight">{role.title}</h2>
          <p className="text-sm text-muted-foreground">
            {role.company ?? t("roles.fallbackValue")}
          </p>
        </div>
        <RoleStatusBadges role={role} />
      </header>

      <Tabs
        className="min-w-0 gap-4"
        onValueChange={(value) => onTabChange(value as TargetRoleTab)}
        value={activeTab}
      >
        <div className="max-w-full overflow-x-auto" data-testid="target-role-tabs-scroll">
          <TabsList aria-label={t("roles.tabs.label")} className="min-w-max" variant="line">
            <TabsTrigger value="overview">{t("roles.tabs.overview")}</TabsTrigger>
            <TabsTrigger value="job-description">{t("roles.tabs.jobDescription")}</TabsTrigger>
            <TabsTrigger value="matching-analysis">{t("roles.tabs.matchingAnalysis")}</TabsTrigger>
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
    </section>
  )
}
