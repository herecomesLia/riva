import type { TFunction } from "i18next"
import type { LucideIcon } from "lucide-react"
import {
  AlertCircleIcon,
  BriefcaseBusinessIcon,
  Building2Icon,
  CalendarDaysIcon,
  CodeXmlIcon,
  ExternalLinkIcon,
  FolderOpenIcon,
  GraduationCapIcon,
  LightbulbIcon,
  ListChecksIcon,
  ShieldCheckIcon,
  SparklesIcon,
  UserRoundIcon,
} from "lucide-react"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type {
  ResumeImportDraft,
  ResumeImportProtectedSource,
  ResumeImportSection,
  ResumeImportSkipReason,
} from "@/models/profile"
import type { ProfileResumeApplyConflict } from "@/pages/profile/profile-resume-workflow"

import { ProfileSkillBadge } from "./ProfileSkillBadge"
import { employmentTypeLabel } from "./profile-formatters"
import { DateRange, DetailList } from "./profile-section-shared"

type ProfileResumeDraftReviewStateProps = {
  applyConflict: ProfileResumeApplyConflict | null
  applyError: boolean
  draft: ResumeImportDraft
  isApplying: boolean
  onApply: () => void
  onCancel: () => void
}

export function ProfileResumeDraftReviewState({
  applyConflict,
  applyError,
  draft,
  isApplying,
  onApply,
  onCancel,
}: ProfileResumeDraftReviewStateProps) {
  const { t } = useTranslation()
  const skillsById = new Map(draft.skills.map((skill) => [skill.id, skill.name]))
  const isProtected = (section: ResumeImportSection, itemId: string) =>
    draft.protectedItems.some((item) => item.section === section && item.itemId === itemId)

  return (
    <Card aria-busy={isApplying} data-testid="profile-resume-draft-review">
      <CardHeader>
        <CardTitle>{t("profile.importDraft.title")}</CardTitle>
        <CardDescription>{t("profile.importDraft.description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {applyConflict && (
          <Alert data-testid="profile-resume-draft-conflict" variant="destructive">
            <AlertCircleIcon />
            <AlertTitle>{t("profile.importDraft.conflictTitle")}</AlertTitle>
            <AlertDescription>{t("profile.importDraft.conflictDescription")}</AlertDescription>
          </Alert>
        )}
        {applyError && (
          <Alert data-testid="profile-resume-draft-apply-error" variant="destructive">
            <AlertCircleIcon />
            <AlertTitle>{t("profile.importDraft.applyFailedTitle")}</AlertTitle>
            <AlertDescription>{t("profile.importDraft.applyFailedDescription")}</AlertDescription>
          </Alert>
        )}

        <section className="flex flex-col gap-3" data-testid="resume-draft-overview">
          <div>
            <h2 className="font-heading text-lg font-semibold">
              {t("profile.importDraft.overview")}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t(
                draft.baseProfileId === null
                  ? "profile.importDraft.firstImport"
                  : "profile.importDraft.updateExisting",
              )}
            </p>
          </div>
          <dl className="grid gap-3 sm:grid-cols-3">
            <DraftCount
              description={t("profile.importDraft.newItemsDescription")}
              label={t("profile.importDraft.newItems")}
              value={draft.changeSummary.newItems}
            />
            <DraftCount
              description={t("profile.importDraft.changedItemsDescription")}
              label={t("profile.importDraft.changedItems")}
              value={draft.changeSummary.changedItems}
            />
            <DraftCount
              description={t("profile.importDraft.missingItemsDescription")}
              label={t("profile.importDraft.missingItems")}
              value={draft.changeSummary.missingItems}
            />
          </dl>
          {draft.changeSummary.missingItems > 0 && (
            <Alert>
              <ShieldCheckIcon />
              <AlertDescription>
                {t("profile.importDraft.missingItemsDescription")}
              </AlertDescription>
            </Alert>
          )}
        </section>

        {draft.summaryAction !== "none" && (
          <DraftSection
            icon={SparklesIcon}
            testId="resume-draft-summary"
            title={t("profile.importDraft.summary")}
          >
            {draft.summaryAction === "set" && (
              <>
                <Badge variant="secondary">{t("profile.importDraft.summarySet")}</Badge>
                <p className="text-sm font-medium">{t("profile.importDraft.summaryDetected")}</p>
                <p className="whitespace-pre-wrap text-sm leading-6">{draft.summary}</p>
              </>
            )}
            {draft.summaryAction === "preserve" && (
              <>
                <Badge variant="secondary">{t("profile.importDraft.summaryPreserve")}</Badge>
                <p className="text-sm text-muted-foreground">
                  {t("profile.importDraft.summaryPreserveDescription")}
                </p>
                <p className="text-sm font-medium">{t("profile.importDraft.summaryDetected")}</p>
                <p className="whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-sm leading-6">
                  {draft.summary}
                </p>
              </>
            )}
          </DraftSection>
        )}

        <DraftSection
          empty={draft.education.length === 0 ? t("profile.importDraft.emptyEducation") : undefined}
          icon={GraduationCapIcon}
          testId="resume-draft-education"
          title={t("profile.sections.education")}
        >
          {draft.education.map((education) => (
            <DraftItem key={education.id}>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                {isProtected("education", education.id) && <ProtectedNotice />}
                <h3 className="font-semibold">{education.school}</h3>
                {(education.degree || education.major) && (
                  <p className="text-sm text-muted-foreground">
                    {[education.degree, education.major].filter(Boolean).join(" · ")}
                  </p>
                )}
                <DateRange
                  endDate={education.endDate}
                  isCurrent={education.isCurrent}
                  startDate={education.startDate}
                />
              </div>
            </DraftItem>
          ))}
        </DraftSection>

        <DraftSection
          empty={
            draft.workExperiences.length === 0
              ? t("profile.importDraft.emptyWorkExperience")
              : undefined
          }
          icon={BriefcaseBusinessIcon}
          testId="resume-draft-work"
          title={t("profile.sections.workExperience")}
        >
          {draft.workExperiences.map((experience) => (
            <DraftItem key={experience.id}>
              <div className="flex min-w-0 flex-1 flex-col gap-4">
                {isProtected("workExperience", experience.id) && <ProtectedNotice />}
                <div>
                  <h3 className="font-semibold">{experience.title}</h3>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <Building2Icon aria-hidden="true" className="size-4" />
                      {experience.company}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{employmentTypeLabel(experience.employmentType, t)}</span>
                    {experience.location && <span>· {experience.location}</span>}
                  </p>
                  <p className="mt-1 inline-flex items-center gap-1.5">
                    <CalendarDaysIcon aria-hidden="true" className="size-4 text-muted-foreground" />
                    <DateRange
                      endDate={experience.endDate}
                      isCurrent={experience.isCurrent}
                      startDate={experience.startDate}
                    />
                  </p>
                </div>
                <DetailList
                  items={experience.responsibilities}
                  title={t("profile.field.responsibilities")}
                />
                <DetailList
                  items={experience.achievements}
                  title={t("profile.field.achievements")}
                />
                <DraftSkills skillIds={experience.skillIds} skillsById={skillsById} />
              </div>
            </DraftItem>
          ))}
        </DraftSection>

        <DraftSection
          empty={
            draft.projectExperiences.length === 0
              ? t("profile.importDraft.emptyProjectExperience")
              : undefined
          }
          icon={FolderOpenIcon}
          testId="resume-draft-projects"
          title={t("profile.sections.projectExperience")}
        >
          {draft.projectExperiences.map((project) => (
            <DraftItem key={project.id}>
              <div className="flex min-w-0 flex-1 flex-col gap-4">
                {isProtected("projectExperience", project.id) && <ProtectedNotice />}
                <div>
                  <h3 className="font-semibold">{project.name}</h3>
                  {project.role && (
                    <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                      <UserRoundIcon aria-hidden="true" className="size-4" />
                      {project.role}
                    </p>
                  )}
                  <p className="mt-1">
                    <DateRange
                      endDate={project.endDate}
                      isCurrent={project.endDate === null}
                      startDate={project.startDate}
                    />
                  </p>
                  {project.projectUrl && (
                    <a
                      className="mt-2 inline-flex items-center gap-1.5 text-sm text-primary underline-offset-4 hover:underline"
                      href={project.projectUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {t("profile.importDraft.projectLink")}
                      <ExternalLinkIcon aria-hidden="true" className="size-4" />
                    </a>
                  )}
                </div>
                <DetailList
                  items={project.responsibilities}
                  title={t("profile.field.responsibilities")}
                />
                <DetailList items={project.achievements} title={t("profile.field.achievements")} />
                <DraftSkills skillIds={project.skillIds} skillsById={skillsById} />
              </div>
            </DraftItem>
          ))}
        </DraftSection>

        <DraftSection
          empty={draft.skills.length === 0 ? t("profile.importDraft.emptySkills") : undefined}
          icon={LightbulbIcon}
          testId="resume-draft-skills"
          title={t("profile.sections.skills")}
        >
          <div className="flex flex-wrap gap-2">
            {draft.skills.map((skill) => (
              <ProfileSkillBadge key={skill.id} name={skill.name} />
            ))}
          </div>
        </DraftSection>

        <AttentionSections draft={draft} t={t} />
      </CardContent>
      <CardFooter className="flex flex-wrap justify-end gap-2">
        <Button disabled={isApplying} onClick={onCancel} variant="outline">
          {t("profile.importDraft.cancel")}
        </Button>
        <Button disabled={isApplying} onClick={onApply}>
          {isApplying ? t("profile.importDraft.applying") : t("profile.importDraft.apply")}
        </Button>
      </CardFooter>
    </Card>
  )
}

function DraftCount({
  description,
  label,
  value,
}: {
  description: string
  label: string
  value: number
}) {
  return (
    <div className="rounded-lg border bg-muted/20 p-4">
      <dt className="text-sm font-medium">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold">{value}</dd>
      <dd className="mt-1 text-xs leading-5 text-muted-foreground">{description}</dd>
    </div>
  )
}

function DraftSection({
  children,
  empty,
  icon: Icon,
  testId,
  title,
}: {
  children: ReactNode
  empty?: string
  icon: LucideIcon
  testId: string
  title: string
}) {
  return (
    <section className="flex flex-col gap-3 border-t pt-6" data-testid={testId}>
      <h2 className="flex items-center gap-2 font-heading text-lg font-semibold">
        <Icon aria-hidden="true" className="size-5 text-primary" />
        {title}
      </h2>
      {empty ? <p className="text-sm text-muted-foreground">{empty}</p> : children}
    </section>
  )
}

function DraftItem({ children }: { children: ReactNode }) {
  return (
    <article className="flex gap-3 rounded-xl border bg-card p-4 shadow-sm sm:p-5">
      {children}
    </article>
  )
}

function ProtectedNotice() {
  const { t } = useTranslation()

  return (
    <div className="mt-1 flex flex-col items-start gap-1 rounded-md bg-muted/50 p-3 text-sm">
      <Badge variant="outline">{t("profile.importDraft.manualProtected")}</Badge>
      <p className="text-muted-foreground">{t("profile.importDraft.manualProtectedDescription")}</p>
    </div>
  )
}

function DraftSkills({
  skillIds,
  skillsById,
}: {
  skillIds: string[]
  skillsById: Map<string, string>
}) {
  const { t } = useTranslation()
  if (skillIds.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      <h4 className="flex items-center gap-2 text-sm font-medium">
        <CodeXmlIcon aria-hidden="true" className="size-4 shrink-0 text-primary" />
        {t("profile.field.technologyStack")}
      </h4>
      <div className="flex flex-wrap gap-2">
        {skillIds.map((skillId) => (
          <ProfileSkillBadge
            key={skillId}
            name={skillsById.get(skillId) ?? t("profile.importDraft.unknownSkill")}
            showIcon={false}
          />
        ))}
      </div>
    </div>
  )
}

function AttentionSections({ draft, t }: { draft: ResumeImportDraft; t: TFunction }) {
  const protectedGroups = new Map<string, number>()
  for (const item of draft.protectedItems) {
    const key = `${item.section}:${item.source}`
    protectedGroups.set(key, (protectedGroups.get(key) ?? 0) + 1)
  }

  return (
    <>
      {draft.protectedItems.length > 0 && (
        <DraftSection
          icon={ShieldCheckIcon}
          testId="resume-draft-protected-items"
          title={t("profile.importDraft.protectedTitle")}
        >
          <p className="text-sm text-muted-foreground">
            {t("profile.importDraft.protectedDescription")}
          </p>
          <ul className="flex flex-col gap-2 text-sm">
            {[...protectedGroups].map(([key, count]) => {
              const [section, source] = key.split(":") as [
                ResumeImportSection,
                ResumeImportProtectedSource,
              ]
              return (
                <li
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
                  key={key}
                >
                  <span>{sectionLabel(section, t)}</span>
                  <Badge variant="secondary">
                    {t(
                      source === "userEdited"
                        ? "profile.importDraft.protectedUserEdited"
                        : "profile.importDraft.protectedUserAdded",
                      { count },
                    )}
                  </Badge>
                </li>
              )
            })}
          </ul>
        </DraftSection>
      )}

      {draft.skippedItems.length > 0 && (
        <DraftSection
          icon={ListChecksIcon}
          testId="resume-draft-skipped-items"
          title={t("profile.importDraft.skippedTitle")}
        >
          <p className="text-sm text-muted-foreground">
            {t("profile.importDraft.skippedDescription")}
          </p>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-sm">
            {draft.skippedItems.map((item) => (
              <li key={`${item.section}:${item.sourceIndex}`}>
                <span className="font-medium">
                  {t("profile.importDraft.skippedItem", {
                    index: item.sourceIndex + 1,
                    section: sectionLabel(item.section, t),
                  })}
                </span>{" "}
                <span className="text-muted-foreground">
                  {item.reasons.map((reason) => skipReasonLabel(reason, t)).join("; ")}
                </span>
              </li>
            ))}
          </ul>
        </DraftSection>
      )}

      {draft.unresolvedItems.length > 0 && (
        <DraftSection
          icon={AlertCircleIcon}
          testId="resume-draft-unresolved-items"
          title={t("profile.importDraft.unresolvedTitle")}
        >
          <p className="text-sm text-muted-foreground">
            {t("profile.importDraft.unresolvedDescription")}
          </p>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-sm">
            {draft.unresolvedItems.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </DraftSection>
      )}
    </>
  )
}

function sectionLabel(section: ResumeImportSection, t: TFunction) {
  if (section === "summary") return t("profile.importDraft.summary")
  return t(`profile.sections.${section}`)
}

function skipReasonLabel(reason: ResumeImportSkipReason, t: TFunction) {
  const labels: Record<ResumeImportSkipReason, string> = {
    current_status_unknown: t("profile.importDraft.skipReasons.current_status_unknown"),
    employment_type_unknown: t("profile.importDraft.skipReasons.employment_type_unknown"),
    end_date_missing: t("profile.importDraft.skipReasons.end_date_missing"),
    end_date_precision_insufficient: t(
      "profile.importDraft.skipReasons.end_date_precision_insufficient",
    ),
    profile_schema_invalid: t("profile.importDraft.skipReasons.profile_schema_invalid"),
    start_date_missing: t("profile.importDraft.skipReasons.start_date_missing"),
    start_date_precision_insufficient: t(
      "profile.importDraft.skipReasons.start_date_precision_insufficient",
    ),
  }
  return labels[reason]
}
