import type {
  JobProfile,
  JobProfileSnapshot,
  ResumeFile,
  ResumeRecognition,
} from "@/models/profile"

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

function createRecognition(resume: ResumeFile, overrides: Partial<ResumeRecognition> = {}) {
  return {
    resumeId: resume.id,
    processingStatus: resume.processingStatus,
    completedAt: resume.parsedAt,
    failureReason: resume.failureReason,
    pendingReviewCount: 0,
    ...overrides,
  } satisfies ResumeRecognition
}

function createCompleteProfile(overrides: Partial<JobProfile> = {}): JobProfile {
  return {
    profileId: "profile_lin_chen",
    status: "active",
    completeness: {
      percentage: 100,
      missingSections: [],
      needsReviewSections: [],
    },
    updatedAt: "2026-07-10T09:15:00.000Z",
    version: 7,
    pendingReviewCount: 0,
    matchingAnalysisStale: false,
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
        reviewStatus: "confirmed",
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
        reviewStatus: "confirmed",
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
        reviewStatus: "confirmed",
      },
    ],
    projectExperiences: [
      {
        id: "project_merchant_console",
        name: "Merchant Operations Console",
        role: "Frontend technical lead",
        startDate: "2024-02",
        endDate: null,
        background: "A unified workspace for merchant support and operational workflows.",
        responsibilities: ["Defined frontend architecture and delivery milestones."],
        contributions: ["Built a configurable workflow renderer shared by six product flows."],
        achievements: ["Cut average case handling time by 23% after rollout."],
        technologies: ["React", "TypeScript", "TanStack Query"],
        projectUrl: null,
        relatedWorkExperienceId: "work_northstar_2022",
        source: "userEdited",
        reviewStatus: "confirmed",
      },
    ],
    skills: [
      {
        id: "skill_react",
        name: "React",
        category: "Frontend",
        source: "resumeExtracted",
        reviewStatus: "confirmed",
      },
      {
        id: "skill_typescript",
        name: "TypeScript",
        category: "Frontend",
        source: "resumeExtracted",
        reviewStatus: "confirmed",
      },
      {
        id: "skill_design_systems",
        name: "Design systems",
        category: "Frontend",
        source: "userAdded",
        reviewStatus: "confirmed",
      },
      {
        id: "skill_javascript",
        name: "JavaScript",
        category: "Frontend",
        source: "resumeExtracted",
        reviewStatus: "confirmed",
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
        reviewStatus: "confirmed",
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
        reviewStatus: "confirmed",
      },
    ],
    targetRoles: [
      {
        id: "target_role_frontend_lead",
        title: "Frontend Technical Lead",
        company: null,
        location: "Shanghai",
        source: "userAdded",
        reviewStatus: "confirmed",
      },
    ],
    ...overrides,
  }
}

const profile = createCompleteProfile()

export const profileResponseMock = {
  profile,
  recognition: createRecognition(profile.resume!),
  resumeUpdate: null,
  matchingAnalysis: {
    status: "current",
    profileVersion: profile.version,
    generatedAt: "2026-07-10T09:16:00.000Z",
    failureReason: null,
  },
} satisfies JobProfileSnapshot
