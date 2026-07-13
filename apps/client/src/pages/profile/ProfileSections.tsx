import { Link } from "@tanstack/react-router"
import { PencilIcon } from "lucide-react"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Separator } from "@/components/ui/separator"
import type { JobProfile, ProfileSection } from "@/models/profile"

import { ReviewStatusBadge } from "./ProfileStatusBadge"
import { employmentTypeLabel, formatMonth } from "./profile-formatters"

type ProfileSectionsProps = {
  profile: JobProfile
}

function ReadonlySectionCard({
  children,
  description,
  footer,
  section,
}: {
  children: ReactNode
  description?: string
  footer?: ReactNode
  section: ProfileSection
}) {
  const { t } = useTranslation()

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{t(`profile.sections.${section}`)}</h2>
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        <CardAction>
          <Button disabled size="sm" variant="outline">
            <PencilIcon data-icon="inline-start" />
            {t("profile.actions.edit")}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>{children}</CardContent>
      {footer && <CardFooter>{footer}</CardFooter>}
    </Card>
  )
}

function EmptySection() {
  const { t } = useTranslation()

  return (
    <Empty className="min-h-36 p-6">
      <EmptyHeader>
        <EmptyTitle>{t("profile.emptySection")}</EmptyTitle>
        <EmptyDescription>{t("profile.emptySection")}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

function DateRange({
  endDate,
  isCurrent,
  startDate,
}: {
  endDate: string | null
  isCurrent: boolean
  startDate: string | null
}) {
  const { i18n, t } = useTranslation()
  const start = formatMonth(startDate, i18n.language, "—")
  const end = isCurrent ? t("profile.field.present") : formatMonth(endDate, i18n.language, "—")

  return (
    <p className="text-sm text-muted-foreground">
      {t("profile.field.dateRange", {
        end,
        start,
      })}
    </p>
  )
}

function DetailList({ items, title }: { items: string[]; title: string }) {
  if (items.length === 0) {
    return null
  }

  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-sm font-medium">{title}</h4>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-sm leading-6 text-muted-foreground">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  )
}

export function ProfileSections({ profile }: ProfileSectionsProps) {
  return (
    <div className="flex flex-col gap-6">
      <section className="grid gap-6 xl:grid-cols-2">
        <BasicInformationSection profile={profile} />
        <EducationSection profile={profile} />
      </section>
      <WorkExperienceSection profile={profile} />
      <ProjectExperienceSection profile={profile} />
      <section className="grid gap-6 xl:grid-cols-2">
        <SkillsSection profile={profile} />
        <CredentialsSection profile={profile} />
      </section>
      <section className="grid gap-6 xl:grid-cols-2">
        <CareerDirectionSection profile={profile} />
        <TargetRolesSection profile={profile} />
      </section>
    </div>
  )
}

function BasicInformationSection({ profile }: ProfileSectionsProps) {
  const { t } = useTranslation()
  const information = profile.basicInformation
  const details = [
    ["name", information.name],
    ["professionalTitle", information.professionalTitle],
    ["location", information.location],
    ["email", information.email],
    ["phone", information.phone],
  ] as const
  const links = [
    ["portfolioUrl", information.portfolioUrl],
    ["githubUrl", information.githubUrl],
    ["linkedinUrl", information.linkedinUrl],
  ] as const

  return (
    <ReadonlySectionCard section="basicInformation">
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-2">
          <ReviewStatusBadge status={information.reviewStatus} />
        </div>
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          {details.map(([key, value]) =>
            value ? (
              <div key={key} className="flex flex-col gap-1">
                <dt className="text-sm text-muted-foreground">{t(`profile.field.${key}`)}</dt>
                <dd className="text-sm font-medium">{value}</dd>
              </div>
            ) : null,
          )}
        </dl>
        {information.personalSummary && (
          <div className="flex flex-col gap-1.5">
            <h3 className="text-sm font-medium">{t("profile.field.personalSummary")}</h3>
            <p className="text-sm leading-6 text-muted-foreground">{information.personalSummary}</p>
          </div>
        )}
        {links.some(([, value]) => value) && (
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
            {links.map(([key, value]) =>
              value ? (
                <a
                  key={key}
                  className="text-primary underline-offset-4 hover:underline"
                  href={value}
                  rel="noreferrer"
                  target="_blank"
                >
                  {t(`profile.field.${key}`)}
                </a>
              ) : null,
            )}
          </div>
        )}
      </div>
    </ReadonlySectionCard>
  )
}

function EducationSection({ profile }: ProfileSectionsProps) {
  const { t } = useTranslation()

  return (
    <ReadonlySectionCard section="education">
      {profile.education.length === 0 ? (
        <EmptySection />
      ) : (
        <div className="flex flex-col gap-5">
          {profile.education.map((education, index) => (
            <div key={education.id} className="flex flex-col gap-2">
              {index > 0 && <Separator className="mb-3" />}
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="font-medium">{education.school}</h3>
                  {(education.degree || education.major) && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t("profile.field.degreeMajor", {
                        degree: education.degree ?? "—",
                        major: education.major ?? "—",
                      })}
                    </p>
                  )}
                </div>
                <ReviewStatusBadge status={education.reviewStatus} />
              </div>
              <DateRange
                endDate={education.endDate}
                isCurrent={education.isCurrent}
                startDate={education.startDate}
              />
              {education.description && (
                <p className="text-sm leading-6 text-muted-foreground">{education.description}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </ReadonlySectionCard>
  )
}

function WorkExperienceSection({ profile }: ProfileSectionsProps) {
  const { t } = useTranslation()
  const skillsById = new Map(profile.skills.map((skill) => [skill.id, skill.name]))

  return (
    <ReadonlySectionCard section="workExperience">
      {profile.workExperiences.length === 0 ? (
        <EmptySection />
      ) : (
        <div className="flex flex-col gap-6">
          {profile.workExperiences.map((experience, index) => (
            <article key={experience.id} className="flex flex-col gap-4">
              {index > 0 && <Separator />}
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <h3 className="font-heading text-lg font-medium">{experience.title}</h3>
                  <p className="text-sm text-muted-foreground">
                    {[
                      experience.company,
                      employmentTypeLabel(experience.employmentType, t),
                      experience.location,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <DateRange
                    endDate={experience.endDate}
                    isCurrent={experience.isCurrent}
                    startDate={experience.startDate}
                  />
                </div>
                <ReviewStatusBadge status={experience.reviewStatus} />
              </div>
              <div className="grid gap-5 lg:grid-cols-2">
                <DetailList
                  items={experience.responsibilities}
                  title={t("profile.field.responsibilities")}
                />
                <DetailList
                  items={experience.achievements}
                  title={t("profile.field.achievements")}
                />
              </div>
              {experience.skillIds.length > 0 && (
                <div className="flex flex-col gap-2">
                  <h4 className="text-sm font-medium">{t("profile.field.skills")}</h4>
                  <div className="flex flex-wrap gap-2">
                    {experience.skillIds.map((skillId) => (
                      <Badge key={skillId} variant="outline">
                        {skillsById.get(skillId) ?? skillId}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </ReadonlySectionCard>
  )
}

function ProjectExperienceSection({ profile }: ProfileSectionsProps) {
  const { t } = useTranslation()
  const workExperienceById = new Map(
    profile.workExperiences.map((experience) => [experience.id, experience.company]),
  )

  return (
    <ReadonlySectionCard section="projectExperience">
      {profile.projectExperiences.length === 0 ? (
        <EmptySection />
      ) : (
        <div className="flex flex-col gap-6">
          {profile.projectExperiences.map((project, index) => (
            <article key={project.id} className="flex flex-col gap-4">
              {index > 0 && <Separator />}
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <h3 className="font-heading text-lg font-medium">{project.name}</h3>
                  {project.role && <p className="text-sm text-muted-foreground">{project.role}</p>}
                  <DateRange
                    endDate={project.endDate}
                    isCurrent={project.endDate === null}
                    startDate={project.startDate}
                  />
                </div>
                <ReviewStatusBadge status={project.reviewStatus} />
              </div>
              {project.background && (
                <p className="text-sm leading-6 text-muted-foreground">{project.background}</p>
              )}
              {project.relatedWorkExperienceId &&
                workExperienceById.get(project.relatedWorkExperienceId) && (
                  <p className="text-sm text-muted-foreground">
                    {workExperienceById.get(project.relatedWorkExperienceId)}
                  </p>
                )}
              <div className="grid gap-5 lg:grid-cols-3">
                <DetailList
                  items={project.responsibilities}
                  title={t("profile.field.responsibilities")}
                />
                <DetailList
                  items={project.contributions}
                  title={t("profile.field.contributions")}
                />
                <DetailList items={project.achievements} title={t("profile.field.achievements")} />
              </div>
              {project.technologies.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {project.technologies.map((technology) => (
                    <Badge key={technology} variant="outline">
                      {technology}
                    </Badge>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </ReadonlySectionCard>
  )
}

function SkillsSection({ profile }: ProfileSectionsProps) {
  return (
    <ReadonlySectionCard section="skills">
      {profile.skills.length === 0 ? (
        <EmptySection />
      ) : (
        <div className="flex flex-wrap gap-2">
          {profile.skills.map((skill) => (
            <Badge key={skill.id} variant="outline">
              {skill.name}
            </Badge>
          ))}
        </div>
      )}
    </ReadonlySectionCard>
  )
}

function CredentialsSection({ profile }: ProfileSectionsProps) {
  const { i18n, t } = useTranslation()

  return (
    <ReadonlySectionCard section="credentials">
      {profile.credentials.length === 0 ? (
        <EmptySection />
      ) : (
        <div className="flex flex-col gap-5">
          {profile.credentials.map((credential, index) => (
            <div key={credential.id} className="flex flex-col gap-2">
              {index > 0 && <Separator className="mb-3" />}
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium">{credential.name}</h3>
                    <Badge variant="outline">
                      {t(`profile.credentialType.${credential.type}`)}
                    </Badge>
                  </div>
                  {(credential.issuer || credential.awardedAt) && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {[
                        credential.issuer,
                        credential.awardedAt &&
                          t("profile.field.awardedAt", {
                            value: formatMonth(credential.awardedAt, i18n.language, ""),
                          }),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                </div>
                <ReviewStatusBadge status={credential.reviewStatus} />
              </div>
              {credential.description && (
                <p className="text-sm leading-6 text-muted-foreground">{credential.description}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </ReadonlySectionCard>
  )
}

function CareerDirectionSection({ profile }: ProfileSectionsProps) {
  const { t } = useTranslation()
  const direction = profile.careerDirection

  return (
    <ReadonlySectionCard section="careerDirection">
      <div className="flex flex-col gap-5">
        <ReviewStatusBadge status={direction.reviewStatus} />
        <DetailList items={direction.desiredTitles} title={t("profile.field.desiredTitles")} />
        <DetailList
          items={direction.desiredLocations}
          title={t("profile.field.desiredLocations")}
        />
        {direction.employmentTypes.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">{t("profile.field.employmentTypes")}</h3>
            <div className="flex flex-wrap gap-2">
              {direction.employmentTypes.map((type) => (
                <Badge key={type} variant="outline">
                  {employmentTypeLabel(type, t)}
                </Badge>
              ))}
            </div>
          </div>
        )}
        {direction.summary && (
          <p className="text-sm leading-6 text-muted-foreground">{direction.summary}</p>
        )}
      </div>
    </ReadonlySectionCard>
  )
}

function TargetRolesSection({ profile }: ProfileSectionsProps) {
  const { t } = useTranslation()

  return (
    <ReadonlySectionCard
      footer={
        <Button nativeButton={false} render={<Link to="/roles" />} size="sm" variant="link">
          {t("profile.actions.viewTargetRoles")}
        </Button>
      }
      section="targetRoles"
    >
      {profile.targetRoles.length === 0 ? (
        <EmptySection />
      ) : (
        <div className="flex flex-col gap-4">
          {profile.targetRoles.map((role, index) => (
            <div key={role.id} className="flex flex-wrap items-start justify-between gap-3">
              {index > 0 && <Separator />}
              <div>
                <h3 className="font-medium">{role.title}</h3>
                {[role.company, role.location].filter(Boolean).length > 0 && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {[role.company, role.location].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
              <ReviewStatusBadge status={role.reviewStatus} />
            </div>
          ))}
        </div>
      )}
    </ReadonlySectionCard>
  )
}
