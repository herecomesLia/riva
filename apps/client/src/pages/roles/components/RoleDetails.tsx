import type { RoleResources } from "../types"
import { useTranslation } from "react-i18next"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { JdField } from "@/pages/roles/types"
import type { RoleResponse } from "@/api/generated/models"

import { JobDescriptionCard } from "./JobDescriptionCard"
import { MatchingAnalysisCard } from "./MatchingAnalysisCard"
import { RoleStatusBadges } from "./RoleStatusBadges"
import { RoleOverview } from "./RoleOverview"

export type RoleTab = "overview" | "job-description" | "matching-analysis"

export type RoleDetailsActions = {
  archive: () => void
  delete: () => void
  edit: () => void
  restore: () => void
  setCurrent: () => void
  editJd: () => void
  editJdField: (field: JdField) => void
  retryJdSynchronization: () => void
  retryJdExtraction: () => void
  abortJdExtraction: () => void
  startMatching: () => void
  abortMatching: () => void
  retryMatchingState: () => void
}

export function RoleDetails({
  actions,
  activeTab,
  activeRoleId,
  onTabChange,
  pending,
  jdTask,
  matchingState,
  role,
  jdSynchronizationError = false,
  matchSynchronizationError = false,
}: {
  actions?: RoleDetailsActions
  activeTab: RoleTab
  activeRoleId: string | null
  jdSynchronizationError?: boolean
  matchSynchronizationError?: boolean
  onTabChange: (tab: RoleTab) => void
  pending?: boolean
  jdTask: RoleResources["jdTasksByRoleId"][string]
  matchingState: RoleResources["matchingStatesByRoleId"][string]
  role: RoleResponse
}) {
  const { t } = useTranslation()
  const isCurrent = role.id === activeRoleId

  return (
    <Card className="@container/role min-w-0" data-testid="role-details-card">
      <CardHeader className="border-b border-border/70 pb-(--card-spacing)">
        <div className="flex flex-col gap-3 @lg/role:flex-row @lg/role:items-start @lg/role:justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <CardTitle className="break-words text-xl font-semibold leading-snug tracking-tight @lg/role:text-2xl">
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
          onValueChange={(value) => onTabChange(value as RoleTab)}
          value={activeTab}
        >
          <div
            className="max-w-full overflow-x-auto overflow-y-hidden pb-1"
            data-testid="role-tabs-scroll"
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
              <TabsTrigger
                className="data-active:text-primary data-active:after:bg-primary"
                value="matching-analysis"
              >
                {t("roles.tabs.matchingAnalysis")}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview">
            {activeTab === "overview" && (
              <RoleOverview actions={actions} isCurrent={isCurrent} pending={pending} role={role} />
            )}
          </TabsContent>
          <TabsContent value="job-description">
            {activeTab === "job-description" && (
              <JobDescriptionCard
                onEdit={actions?.editJd}
                onEditAnalysisModule={actions?.editJdField}
                onRetrySynchronization={actions?.retryJdSynchronization}
                onRetryExtraction={actions?.retryJdExtraction}
                onAbortExtraction={actions?.abortJdExtraction}
                pending={pending}
                role={role}
                jdTask={jdTask}
                synchronizationError={jdSynchronizationError}
              />
            )}
          </TabsContent>
          <TabsContent value="matching-analysis">
            {activeTab === "matching-analysis" && (
              <MatchingAnalysisCard
                onStartMatching={actions?.startMatching}
                onAbortMatching={actions?.abortMatching}
                onRetryMatchingState={actions?.retryMatchingState}
                pending={pending}
                matching={role.matching}
                matchingState={matchingState}
                isMatchingStateError={matchSynchronizationError}
              />
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
