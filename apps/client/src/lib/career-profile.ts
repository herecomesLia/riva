import type { CareerProfileResponse } from "@/api/generated/models"

export function isCareerProfileComplete(profile: CareerProfileResponse | null): boolean {
  return (
    profile !== null &&
    profile.education.length > 0 &&
    profile.workExperiences.length > 0 &&
    profile.projects.length > 0 &&
    profile.skills.length > 0
  )
}
