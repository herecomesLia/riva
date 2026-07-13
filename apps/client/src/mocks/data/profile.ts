import type {
  BasicInformation,
  JobProfile,
  JobProfileSnapshot,
  ResumeFile,
  ResumeRecognition,
  ResumeUpdate,
} from "@/models/profile"

export type ProfileMockScenario =
  | "notCreated"
  | "uploading"
  | "parsing"
  | "recognitionFailed"
  | "awaitingConfirmation"
  | "needsReview"
  | "complete"
  | "incomplete"
  | "saveFailure"
  | "resumeUpdateAwaitingConfirmation"
  | "matchingAnalysisStale"

const profileMockScenarios = new Set<ProfileMockScenario>([
  "notCreated",
  "uploading",
  "parsing",
  "recognitionFailed",
  "awaitingConfirmation",
  "needsReview",
  "complete",
  "incomplete",
  "saveFailure",
  "resumeUpdateAwaitingConfirmation",
  "matchingAnalysisStale",
])

export function isProfileMockScenario(value: string | undefined): value is ProfileMockScenario {
  return value !== undefined && profileMockScenarios.has(value as ProfileMockScenario)
}

function createBasicInformation(): BasicInformation {
  return {
    name: "Lin Chen",
    professionalTitle: "Frontend Engineer",
    location: "Shanghai",
    email: "lin.chen@example.com",
    phone: "+86 138 0000 1234",
    personalSummary:
      "Frontend engineer focused on accessible product experiences and scalable design systems.",
    portfolioUrl: "https://portfolio.example.com/lin-chen",
    githubUrl: "https://github.com/lin-chen",
    linkedinUrl: "https://www.linkedin.com/in/lin-chen",
    fieldSources: {
      name: "resumeExtracted",
      professionalTitle: "userEdited",
      location: "resumeExtracted",
      email: "resumeExtracted",
      phone: "resumeExtracted",
      personalSummary: "userEdited",
      portfolioUrl: "userAdded",
      githubUrl: "userAdded",
      linkedinUrl: "userAdded",
    },
    reviewStatus: "confirmed",
  }
}

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
    basicInformation: createBasicInformation(),
    education: [
      {
        id: "education_fudan_2018",
        school: "Fudan University",
        degree: "Bachelor of Engineering",
        major: "Computer Science",
        startDate: "2014-09",
        endDate: "2018-06",
        isCurrent: false,
        description: "Coursework included software engineering and human-computer interaction.",
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
    careerDirection: {
      desiredTitles: ["Senior Frontend Engineer", "Frontend Technical Lead"],
      desiredIndustries: ["SaaS", "E-commerce"],
      desiredLocations: ["Shanghai", "Remote"],
      desiredLevels: ["senior", "lead"],
      employmentTypes: ["fullTime"],
      jobSearchType: "active",
      jobSearchStage: "applying",
      focusAreas: ["System design", "Frontend architecture", "Leadership"],
      summary: "Product-focused frontend roles with ownership of complex workflows.",
      source: "userEdited",
      reviewStatus: "confirmed",
    },
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

function createAwaitingConfirmationProfile(): JobProfile {
  const resume = createResume({
    id: "resume_pending_confirmation",
    uploadedAt: "2026-07-12T09:00:00.000Z",
  })

  return createCompleteProfile({
    status: "awaitingConfirmation",
    completeness: {
      percentage: 76,
      missingSections: ["credentials"],
      needsReviewSections: ["basicInformation", "workExperience", "projectExperience"],
    },
    updatedAt: "2026-07-12T09:01:13.000Z",
    version: 1,
    pendingReviewCount: 4,
    resume,
    basicInformation: {
      ...createBasicInformation(),
      professionalTitle: null,
      fieldSources: {
        ...createBasicInformation().fieldSources,
        professionalTitle: "resumeExtracted",
      },
      reviewStatus: "needsReview",
    },
    workExperiences: createCompleteProfile().workExperiences.map((experience, index) => ({
      ...experience,
      reviewStatus: index === 0 ? "needsReview" : "confirmed",
    })),
    projectExperiences: createCompleteProfile().projectExperiences.map((experience) => ({
      ...experience,
      reviewStatus: "needsReview",
    })),
  })
}

function createIncompleteProfile(): JobProfile {
  return createCompleteProfile({
    completeness: {
      percentage: 52,
      missingSections: ["education", "projectExperience", "credentials", "targetRoles"],
      needsReviewSections: ["basicInformation", "careerDirection"],
    },
    updatedAt: "2026-07-09T05:20:00.000Z",
    version: 3,
    pendingReviewCount: 2,
    basicInformation: {
      ...createBasicInformation(),
      phone: null,
      personalSummary: null,
      portfolioUrl: null,
      githubUrl: null,
      linkedinUrl: null,
      reviewStatus: "needsReview",
    },
    education: [],
    projectExperiences: [],
    credentials: [],
    careerDirection: {
      desiredTitles: ["Frontend Engineer"],
      desiredIndustries: [],
      desiredLocations: [],
      desiredLevels: [],
      employmentTypes: ["fullTime"],
      jobSearchType: "exploring",
      jobSearchStage: "preparing",
      focusAreas: [],
      summary: null,
      source: "resumeExtracted",
      reviewStatus: "incomplete",
    },
    targetRoles: [],
  })
}

function createResumeUpdate(): ResumeUpdate {
  return {
    id: "resume_update_2026_07",
    createdAt: "2026-07-12T12:15:00.000Z",
    status: "awaitingConfirmation",
    pendingReviewCount: 3,
    resume: createResume({
      id: "resume_2026_07",
      fileName: "lin-chen-resume-july.pdf",
      fileSize: 301_088,
      uploadedAt: "2026-07-12T12:13:00.000Z",
      parsedAt: "2026-07-12T12:15:00.000Z",
      processingStatus: "succeeded",
    }),
  }
}

function createSnapshot(
  profile: JobProfile | null,
  recognition: ResumeRecognition | null = null,
): JobProfileSnapshot {
  return {
    profile,
    recognition,
    resumeUpdate: null,
  }
}

export function createProfileMockSnapshot(scenario: ProfileMockScenario): JobProfileSnapshot {
  if (scenario === "notCreated") {
    return createSnapshot(null)
  }

  if (scenario === "uploading") {
    const resume = createResume({
      id: "resume_uploading",
      uploadedAt: "2026-07-12T08:00:00.000Z",
      parsedAt: null,
      processingStatus: "uploaded",
    })
    const profile = createCompleteProfile({
      status: "uploadingResume",
      completeness: {
        percentage: 0,
        missingSections: [
          "basicInformation",
          "education",
          "workExperience",
          "projectExperience",
          "skills",
          "credentials",
          "careerDirection",
          "targetRoles",
        ],
        needsReviewSections: [],
      },
      updatedAt: resume.uploadedAt,
      version: 1,
      pendingReviewCount: 0,
      resume,
      basicInformation: {
        ...createBasicInformation(),
        name: null,
        professionalTitle: null,
        location: null,
        email: null,
        phone: null,
        personalSummary: null,
        portfolioUrl: null,
        githubUrl: null,
        linkedinUrl: null,
        fieldSources: {},
        reviewStatus: "incomplete",
      },
      education: [],
      workExperiences: [],
      projectExperiences: [],
      skills: [],
      credentials: [],
      careerDirection: {
        desiredTitles: [],
        desiredIndustries: [],
        desiredLocations: [],
        desiredLevels: [],
        employmentTypes: [],
        jobSearchType: "exploring",
        jobSearchStage: "preparing",
        focusAreas: [],
        summary: null,
        source: "resumeExtracted",
        reviewStatus: "incomplete",
      },
      targetRoles: [],
    })
    return createSnapshot(profile, createRecognition(resume))
  }

  if (scenario === "parsing") {
    const resume = createResume({
      id: "resume_parsing",
      uploadedAt: "2026-07-12T08:00:00.000Z",
      parsedAt: null,
      processingStatus: "parsing",
    })
    return createSnapshot(
      createCompleteProfile({
        status: "parsingResume",
        updatedAt: resume.uploadedAt,
        version: 1,
        resume,
      }),
      createRecognition(resume),
    )
  }

  if (scenario === "recognitionFailed") {
    const resume = createResume({
      id: "resume_failed",
      uploadedAt: "2026-07-12T08:00:00.000Z",
      parsedAt: "2026-07-12T08:02:00.000Z",
      processingStatus: "failed",
      failureReason: "The document could not be parsed.",
    })
    return createSnapshot(
      createCompleteProfile({
        status: "recognitionFailed",
        updatedAt: resume.parsedAt!,
        version: 1,
        resume,
      }),
      createRecognition(resume),
    )
  }

  if (scenario === "awaitingConfirmation") {
    const profile = createAwaitingConfirmationProfile()
    return createSnapshot(profile, createRecognition(profile.resume!, { pendingReviewCount: 4 }))
  }

  if (scenario === "needsReview") {
    const profile = createAwaitingConfirmationProfile()
    profile.status = "active"
    profile.updatedAt = "2026-07-12T10:00:00.000Z"
    return createSnapshot(profile, createRecognition(profile.resume!, { pendingReviewCount: 4 }))
  }

  if (scenario === "incomplete") {
    const profile = createIncompleteProfile()
    return createSnapshot(profile, createRecognition(profile.resume!, { pendingReviewCount: 2 }))
  }

  if (scenario === "resumeUpdateAwaitingConfirmation") {
    const profile = createCompleteProfile()
    return {
      ...createSnapshot(profile, createRecognition(profile.resume!)),
      resumeUpdate: createResumeUpdate(),
    }
  }

  if (scenario === "matchingAnalysisStale") {
    return createSnapshot(
      createCompleteProfile({
        updatedAt: "2026-07-12T10:30:00.000Z",
        version: 8,
        matchingAnalysisStale: true,
      }),
      createRecognition(createResume()),
    )
  }

  return createSnapshot(createCompleteProfile(), createRecognition(createResume()))
}
