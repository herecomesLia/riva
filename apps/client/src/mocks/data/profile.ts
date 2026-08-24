import type { Profile, ProfileContent, ProfileSnapshot } from "@/models/profile"

const completeContent: ProfileContent = {
  summary: "Frontend engineer focused on accessible product experiences.",
  education: [
    {
      school: "Fudan University",
      degree: "Bachelor of Engineering",
      major: "Computer Science",
      startDate: "2014-09",
      endDate: "2018-06",
      isCurrent: false,
    },
    {
      school: "Tongji University",
      degree: "Master of Engineering",
      major: "Software Engineering",
      startDate: "2018-09",
      endDate: "2021-06",
      isCurrent: false,
    },
  ],
  workExperiences: [
    {
      company: "Northstar Commerce",
      title: "Senior Frontend Engineer",
      employmentType: "fullTime",
      location: "Shanghai",
      startDate: "2022-04",
      endDate: null,
      isCurrent: true,
      responsibilities: [
        "Led frontend delivery for merchant workflow products.",
        "Maintained the shared component library and accessibility standards.",
      ],
      achievements: [
        "Reduced checkout workflow completion time by 18%.",
        "Improved core web vitals pass rate from 71% to 94%.",
      ],
      skills: ["React", "TypeScript", "Design systems"],
    },
    {
      company: "Orbit Labs",
      title: "Frontend Engineer",
      employmentType: "fullTime",
      location: "Hangzhou",
      startDate: "2018-07",
      endDate: "2022-03",
      isCurrent: false,
      responsibilities: ["Built operational dashboards for enterprise users."],
      achievements: ["Introduced a reusable charting foundation used by four teams."],
      skills: ["React", "JavaScript"],
    },
  ],
  projectExperiences: [
    {
      name: "Merchant Operations Console",
      role: "Frontend technical lead",
      startDate: "2024-02",
      endDate: null,
      isCurrent: true,
      responsibilities: ["Defined frontend architecture and delivery milestones."],
      achievements: ["Cut average case handling time by 23% after rollout."],
      skills: ["React", "TypeScript", "TanStack Query"],
      projectUrl: null,
    },
  ],
  skills: ["React", "TypeScript", "Design systems", "JavaScript", "TanStack Query"],
}

function createProfile(content: ProfileContent = completeContent, version = 7): Profile {
  return {
    content: structuredClone(content),
    updatedAt: "2026-07-10T09:15:00.000Z",
    version,
  }
}

export type ProfileMockScenario = "complete" | "noProfile" | "emptyManualProfile" | "partial"

const emptyContent: ProfileContent = {
  education: [],
  projectExperiences: [],
  skills: [],
  summary: null,
  workExperiences: [],
}

export const profileResponseMock = createProfile()

export function createProfileMockSnapshot(
  scenario: ProfileMockScenario = "complete",
): ProfileSnapshot {
  if (scenario === "noProfile") return null
  if (scenario === "emptyManualProfile") return createProfile(emptyContent, 1)
  if (scenario === "partial") {
    const partial = structuredClone(completeContent)
    partial.projectExperiences = []
    partial.skills = partial.skills.slice(0, 2)
    partial.workExperiences = partial.workExperiences.map((item) => ({
      ...item,
      skills: item.skills.filter((skill) => partial.skills.includes(skill)),
    }))
    return createProfile(partial)
  }
  return createProfile()
}
