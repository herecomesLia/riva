import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { TargetRole } from "@/models/roles"

import { RoleStatusBadges } from "./RoleStatusBadges"
import { getRolesForCategory, type TargetRoleListCategory } from "./roles-list-utils"

export function RolesList({
  category,
  className,
  currentRoleId,
  onCategoryChange,
  roles,
  selectedRoleId,
  onSelectRole,
}: {
  category: TargetRoleListCategory
  className?: string
  currentRoleId: string | null
  onCategoryChange: (category: TargetRoleListCategory) => void
  roles: TargetRole[]
  selectedRoleId: string | null
  onSelectRole: (roleId: string) => void
}) {
  const { t } = useTranslation()
  const activeRoles = getRolesForCategory(roles, "active")
  const archivedRoles = getRolesForCategory(roles, "archived")
  const visibleRoles = category === "active" ? activeRoles : archivedRoles

  return (
    <Card
      className={cn("flex min-h-0 flex-col gap-3 [--card-spacing:--spacing(4)]", className)}
      data-testid="roles-list-card"
    >
      <CardHeader className="gap-1.5">
        <CardTitle>
          <h2>{t("roles.list.title")}</h2>
        </CardTitle>
        <div
          aria-label={t("roles.list.categoryLabel")}
          className="flex items-center gap-2"
          data-testid="roles-list-categories"
          role="tablist"
        >
          <Button
            aria-selected={category === "active"}
            className="h-6 rounded-md px-2 text-[11px] font-medium text-muted-foreground hover:bg-primary/[0.08] hover:text-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary"
            data-active={category === "active"}
            onClick={() => onCategoryChange("active")}
            role="tab"
            variant="ghost"
          >
            {t("roles.list.categories.active", { count: activeRoles.length })}
          </Button>
          <Button
            aria-selected={category === "archived"}
            className="h-6 rounded-md px-2 text-[11px] font-medium text-muted-foreground hover:bg-primary/[0.08] hover:text-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary"
            data-active={category === "archived"}
            onClick={() => onCategoryChange("archived")}
            role="tab"
            variant="ghost"
          >
            {t("roles.list.categories.archived", { count: archivedRoles.length })}
          </Button>
        </div>
      </CardHeader>
      <CardContent
        className="min-h-0 max-h-[13.25rem] overflow-x-hidden overflow-y-auto pr-2.5 [scrollbar-gutter:stable] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-transparent hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/30"
        data-testid="roles-list-scroll"
      >
        <div aria-label={t("roles.list.title")} className="flex flex-col gap-2" role="list">
          {visibleRoles.map((role) => (
            <div key={role.id} role="listitem">
              <RoleListItem
                isCurrent={role.id === currentRoleId}
                onSelectRole={onSelectRole}
                role={role}
                selected={selectedRoleId === role.id}
              />
            </div>
          ))}
          {visibleRoles.length === 0 && (
            <p className="px-1 py-6 text-center text-sm text-muted-foreground" role="status">
              {t(`roles.list.empty.${category}`)}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function RoleListItem({
  isCurrent,
  onSelectRole,
  role,
  selected,
}: {
  isCurrent: boolean
  onSelectRole: (roleId: string) => void
  role: TargetRole
  selected: boolean
}) {
  const { t } = useTranslation()
  const isArchived = role.status === "archived"
  const score = getRoleMatchScore(role)

  return (
    <Button
      aria-pressed={selected}
      className={cn(
        "h-auto w-full justify-start overflow-hidden rounded-2xl border px-2.5 py-2.5 text-left whitespace-normal transition-colors focus-visible:border-primary focus-visible:ring-1 active:not-aria-[haspopup]:translate-y-0",
        selected
          ? isArchived
            ? "border-muted-foreground/50 bg-muted text-foreground"
            : "border-primary/55 bg-primary/10 text-foreground shadow-xs"
          : isArchived
            ? "border-transparent bg-muted/40 text-muted-foreground hover:border-muted-foreground/50 hover:bg-muted/80"
            : "border-transparent bg-card/40 hover:border-primary/60 hover:bg-primary/[0.08]",
      )}
      data-role-status={isArchived ? "archived" : "active"}
      onClick={() => onSelectRole(role.id)}
      variant="ghost"
    >
      <span className="flex min-w-0 flex-1 items-center gap-2.5">
        <span className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
          <span className="w-full truncate font-medium">{role.title}</span>
          <span className="w-full truncate text-xs text-muted-foreground">
            {role.company ?? t("roles.fallbackValue")}
          </span>
          <RoleStatusBadges isCurrent={isCurrent} role={role} />
        </span>
        {score !== null && <RoleMatchScoreRing archived={isArchived} score={score} />}
      </span>
    </Button>
  )
}

function RoleMatchScoreRing({ archived, score }: { archived: boolean; score: number }) {
  const { t } = useTranslation()

  return (
    <span
      aria-label={t("roles.list.matchScore", { score })}
      className={cn(
        "relative flex size-11 basis-11 shrink-0 items-center justify-center text-primary",
        archived ? "text-muted-foreground" : "text-primary",
      )}
      data-role-status={archived ? "archived" : "active"}
      data-testid="role-match-score-ring"
    >
      <svg aria-hidden="true" className="size-full -rotate-90" viewBox="0 0 36 36">
        <circle
          className="stroke-current opacity-15"
          cx="18"
          cy="18"
          fill="none"
          r="15.5"
          strokeWidth="3"
        />
        <circle
          className="stroke-current"
          cx="18"
          cy="18"
          fill="none"
          pathLength="100"
          r="15.5"
          strokeDasharray={`${score} 100`}
          strokeLinecap="round"
          strokeWidth="3"
        />
      </svg>
      <span className="absolute font-heading text-[10px] font-semibold tabular-nums">{score}%</span>
    </span>
  )
}

function getRoleMatchScore(role: TargetRole): number | null {
  const analysis = role.matchingAnalysis
  return analysis?.status === "current" || analysis?.status === "stale"
    ? analysis.result.overallMatchScore
    : null
}
