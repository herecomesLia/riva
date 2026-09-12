import type { JobDescriptionResponse } from "@/api/generated/models"

export function hasJobDescription(jd: JobDescriptionResponse): boolean {
  return (
    jd.responsibilities.length > 0 ||
    Object.values(jd.requirements).some((items) => items.length > 0) ||
    Object.values(jd.hardSkills).some((items) => items.length > 0) ||
    jd.softSkills.length > 0 ||
    jd.preferredQualifications.length > 0 ||
    jd.businessDomains.length > 0
  )
}
