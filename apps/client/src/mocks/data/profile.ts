import type { JobProfile, JobProfileSnapshot, ResumeFile } from "@/models/profile"

function createResume(overrides: Partial<ResumeFile> = {}): ResumeFile {
  return {
    id: "resume_2026_01",
    fileName: "lin-chen-resume.pdf",
    mimeType: "application/pdf",
    fileSize: 284_416,
    uploadedAt: "2026-07-01T08:30:00.000Z",
    parsedAt: "2026-07-01T08:31:12.000Z",
    processingStatus: "succeeded",
    failureReason: null,
    ...overrides,
  }
}

function createCompleteProfile(overrides: Partial<JobProfile> = {}): JobProfile {
  return {
    profileId: "profile_lin_chen",
    summary: "Frontend engineer focused on accessible product experiences.",
    status: "active",
    completeness: {
      percentage: 100,
      missingSections: [],
    },
    updatedAt: "2026-07-10T09:15:00.000Z",
    version: 7,
    resume: createResume(),
    education: [
      {
        id: "education_fudan_2018",
        school: "Fudan University",
        degree: "Bachelor of Engineering",
        major: "Computer Science",
        startDate: "2014-09",
        endDate: "2018-06",
        isCurrent: false,
        source: "resumeExtracted",
      },
      {
        id: "education_tongji_2021",
        school: "Tongji University",
        degree: "Master of Engineering",
        major: "Software Engineering",
        startDate: "2018-09",
        endDate: "2021-06",
        isCurrent: false,
        source: "resumeExtracted",
      },
    ],
    workExperiences: [
      {
        id: "work_northstar_2022",
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
        skillIds: ["skill_react", "skill_typescript", "skill_design_systems"],
        source: "userEdited",
      },
      {
        id: "work_orbit_2018",
        company: "Orbit Labs",
        title: "Frontend Engineer",
        employmentType: "fullTime",
        location: "Hangzhou",
        startDate: "2018-07",
        endDate: "2022-03",
        isCurrent: false,
        responsibilities: ["Built operational dashboards for enterprise users."],
        achievements: ["Introduced a reusable charting foundation used by four teams."],
        skillIds: ["skill_react", "skill_javascript"],
        source: "resumeExtracted",
      },
    ],
    projectExperiences: [
      {
        id: "project_merchant_console",
        name: "Merchant Operations Console",
        role: "Frontend technical lead",
        startDate: "2024-02",
        endDate: null,
        responsibilities: ["Defined frontend architecture and delivery milestones."],
        achievements: ["Cut average case handling time by 23% after rollout."],
        skillIds: ["skill_react", "skill_typescript", "skill_tanstack_query"],
        projectUrl: null,
        source: "userEdited",
      },
    ],
    skills: [
      {
        id: "skill_react",
        name: "React",
        source: "resumeExtracted",
      },
      {
        id: "skill_typescript",
        name: "TypeScript",
        source: "resumeExtracted",
      },
      {
        id: "skill_design_systems",
        name: "Design systems",
        source: "userAdded",
      },
      {
        id: "skill_javascript",
        name: "JavaScript",
        source: "resumeExtracted",
      },
      {
        id: "skill_tanstack_query",
        name: "TanStack Query",
        source: "resumeExtracted",
      },
    ],
    credentials: [
      {
        id: "certificate_aws_2023",
        type: "certificate",
        name: "AWS Certified Cloud Practitioner",
        issuer: "Amazon Web Services",
        awardedAt: "2023-08",
        expiresAt: null,
        credentialId: "AWS-CCP-2023-0174",
        credentialUrl: "https://www.credly.com/",
        description: null,
        source: "resumeExtracted",
      },
      {
        id: "award_design_2024",
        type: "award",
        name: "Product Excellence Award",
        issuer: "Northstar Commerce",
        awardedAt: "2024-12",
        expiresAt: null,
        credentialId: null,
        credentialUrl: null,
        description: "Recognized for cross-functional delivery of the merchant operations console.",
        source: "userAdded",
      },
    ],
    targetRoles: [
      {
        id: "target_role_frontend_lead",
        title: "Frontend Technical Lead",
        company: null,
        location: "Shanghai",
        source: "userAdded",
      },
    ],
    ...overrides,
  }
}

function createCompleteSnapshot(): JobProfileSnapshot {
  return { profile: createCompleteProfile() }
}

function createProfileWithoutResumeSnapshot(): JobProfileSnapshot {
  return { profile: createCompleteProfile({ resume: null }) }
}

function createEmptyManualProfileSnapshot(): JobProfileSnapshot {
  return {
    profile: createCompleteProfile({
      completeness: {
        percentage: 0,
        missingSections: [
          "education",
          "workExperience",
          "projectExperience",
          "skills",
          "credentials",
          "targetRoles",
        ],
      },
      credentials: [],
      education: [],
      profileId: "profile_manual_empty",
      projectExperiences: [],
      resume: null,
      skills: [],
      summary: null,
      targetRoles: [],
      updatedAt: "2026-07-11T09:00:00.000Z",
      version: 1,
      workExperiences: [],
    }),
  }
}

function createPartialProfileSnapshot(): JobProfileSnapshot {
  const completeProfile = createCompleteProfile()
  return {
    profile: createCompleteProfile({
      completeness: {
        percentage: 75,
        missingSections: ["projectExperience", "credentials"],
      },
      credentials: [],
      education: completeProfile.education.map((education, index) =>
        index === 0 ? { ...education, degree: null } : education,
      ),
      projectExperiences: [],
      workExperiences: completeProfile.workExperiences.map((experience, index) =>
        index === 0 ? { ...experience, location: null } : experience,
      ),
    }),
  }
}

export type ProfileMockScenario =
  "complete" | "noProfile" | "emptyManualProfile" | "profileWithoutResume" | "partial"

const profileMockScenarios = {
  complete: createCompleteSnapshot(),
  noProfile: { profile: null },
  emptyManualProfile: createEmptyManualProfileSnapshot(),
  profileWithoutResume: createProfileWithoutResumeSnapshot(),
  partial: createPartialProfileSnapshot(),
} satisfies Record<ProfileMockScenario, JobProfileSnapshot>

export const profileResponseMock = profileMockScenarios.complete

export function createProfileMockSnapshot(
  scenario: ProfileMockScenario = "complete",
): JobProfileSnapshot {
  return structuredClone(profileMockScenarios[scenario])
}
