import { useTranslation } from "react-i18next"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { JobDescriptionAnalysisModuleField, ProfileContext, TargetRole } from "@/models/roles"

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
  editJobDescriptionAnalysisModule?: (field: JobDescriptionAnalysisModuleField) => void
  startJobDescriptionParsing?: () => void
  generateMatchingAnalysis?: () => void
}

export function RoleDetails({
  actions,
  activeTab,
  currentRoleId,
  onTabChange,
  pending,
  profileContext,
  role,
  matchingAnalysisAvailable = true,
}: {
  actions?: RoleDetailsActions
  activeTab: TargetRoleTab
  currentRoleId: string | null
  matchingAnalysisAvailable?: boolean
  onTabChange: (tab: TargetRoleTab) => void
  pending?: boolean
  profileContext: ProfileContext
  role: TargetRole
}) {
  const { t } = useTranslation()
  const isCurrent = role.id === currentRoleId

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
            <CardDescription>{role.company ?? t("roles.fallbackValue")}</CardDescription>
          </div>
          <RoleStatusBadges isCurrent={isCurrent} role={role} />
        </div>
      </CardHeader>

      <CardContent className="min-w-0">
        <Tabs
          className="min-w-0 gap-5"
          onValueChange={(value) => onTabChange(value as TargetRoleTab)}
          value={activeTab}
        >
          <div
            className="max-w-full overflow-x-auto overflow-y-hidden pb-1"
            data-testid="target-role-tabs-scroll"
          >
            <TabsList aria-label={t("roles.tabs.label")} className="min-w-max" variant="line">
              <TabsTrigger
                className="data-active:text-primary data-active:after:bg-primary"
                value="overview"
              >
                {t("roles.tabs.overview")}
              </TabsTrigger>
              <TabsTrigger
                className="data-active:text-primary data-active:after:bg-primary"
                value="job-description"
              >
                {t("roles.tabs.jobDescription")}
              </TabsTrigger>
              {matchingAnalysisAvailable && (
                <TabsTrigger
                  className="data-active:text-primary data-active:after:bg-primary"
                  value="matching-analysis"
                >
                  {t("roles.tabs.matchingAnalysis")}
                </TabsTrigger>
              )}
            </TabsList>
          </div>

          <TabsContent value="overview">
            {activeTab === "overview" && (
              <TargetRoleOverview
                actions={actions}
                isCurrent={isCurrent}
                pending={pending}
                role={role}
              />
            )}
          </TabsContent>
          <TabsContent value="job-description">
            {activeTab === "job-description" && (
              <JobDescriptionCard
                onEdit={
                  role.preparationStatus === "archived" ? undefined : actions?.editJobDescription
                }
                onEditAnalysisModule={actions?.editJobDescriptionAnalysisModule}
                onStartParsing={actions?.startJobDescriptionParsing}
                pending={pending}
                role={role}
              />
            )}
          </TabsContent>
          {matchingAnalysisAvailable && (
            <TabsContent value="matching-analysis">
              {activeTab === "matching-analysis" && (
                <MatchingAnalysisCard
                  onGenerate={actions?.generateMatchingAnalysis}
                  pending={pending}
                  profileContext={profileContext}
                  role={role}
                />
              )}
            </TabsContent>
          )}
        </Tabs>
      </CardContent>
    </Card>
  )
}
