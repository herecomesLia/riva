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
        technologyStack: ["React", "TypeScript", "TanStack Query"],
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
    ...overrides,
  }
}

function createCompleteSnapshot(): JobProfileSnapshot {
  const profile = createCompleteProfile()

  return {
    profile,
    recognition: createRecognition(profile.resume!),
    resumeUpdate: null,
  }
}

function createProfileWithoutResumeSnapshot(): JobProfileSnapshot {
  const profile = createCompleteProfile({ resume: null })

  return {
    profile,
    recognition: null,
    resumeUpdate: null,
  }
}

function createEmptyManualProfileSnapshot(): JobProfileSnapshot {
  const profile = createCompleteProfile({
    completeness: {
      percentage: 0,
      missingSections: ["education", "workExperience", "projectExperience", "skills"],
    },
    education: [],
    profileId: "profile_manual_empty",
    projectExperiences: [],
    resume: null,
    skills: [],
    status: "active",
    updatedAt: "2026-07-11T09:00:00.000Z",
    version: 1,
    workExperiences: [],
  })

  return { profile, recognition: null, resumeUpdate: null }
}

function createInitialResumeSnapshot(
  status: "uploadingResume" | "parsingResume" | "recognitionFailed",
  failureReason = status === "recognitionFailed"
    ? "The resume could not be recognized because its text layer is unavailable."
    : null,
): JobProfileSnapshot {
  const processingStatus =
    status === "uploadingResume" ? "uploaded" : status === "parsingResume" ? "parsing" : "failed"
  const resume = createResume({
    failureReason,
    id: `resume_initial_${processingStatus}`,
    parsedAt: null,
    processingStatus,
  })
  const profile = createCompleteProfile({
    completeness: {
      percentage: 0,
      missingSections: ["education", "workExperience", "projectExperience", "skills"],
    },
    education: [],
    projectExperiences: [],
    resume,
    skills: [],
    status,
    updatedAt: "2026-07-13T08:00:00.000Z",
    version: 1,
    workExperiences: [],
  })

  return {
    profile,
    recognition: createRecognition(resume),
    resumeUpdate: null,
  }
}

function createInitialResumeRecognitionSucceededSnapshot(): JobProfileSnapshot {
  const resume = createResume({
    id: "resume_initial_succeeded",
    parsedAt: "2026-07-13T08:02:00.000Z",
    processingStatus: "succeeded",
  })
  const profile = createCompleteProfile({
    resume,
    updatedAt: resume.parsedAt!,
    version: 2,
  })

  return {
    profile,
    recognition: createRecognition(resume),
    resumeUpdate: null,
  }
}

function createPartialProfileSnapshot(): JobProfileSnapshot {
  const completeProfile = createCompleteProfile()
  const profile = createCompleteProfile({
    completeness: {
      percentage: 75,
      missingSections: ["projectExperience"],
    },
    education: completeProfile.education.map((education, index) =>
      index === 0 ? { ...education, degree: null } : education,
    ),
    projectExperiences: [],
    workExperiences: completeProfile.workExperiences.map((experience, index) =>
      index === 0 ? { ...experience, location: null } : experience,
    ),
  })

  return {
    profile,
    recognition: createRecognition(profile.resume!),
    resumeUpdate: null,
  }
}

function createResumeUpdateSucceededSnapshot(): JobProfileSnapshot {
  const resume = createResume({
    id: "resume_update_2026_07_succeeded",
    parsedAt: "2026-07-13T08:04:00.000Z",
    processingStatus: "succeeded",
    uploadedAt: "2026-07-13T08:00:00.000Z",
  })
  const profile = createCompleteProfile({
    resume,
    updatedAt: "2026-07-13T08:04:00.000Z",
    version: 8,
  })

  return {
    profile,
    recognition: createRecognition(profile.resume!),
    resumeUpdate: {
      id: "resume_update_2026_07",
      createdAt: "2026-07-13T08:00:00.000Z",
      status: "succeeded",
      resume,
      changeSummary: { changedItems: 2, missingItems: 1, newItems: 1 },
      failureReason: null,
      preservesManualChanges: true,
    },
  }
}

function createResumeUpdateProcessingSnapshot(status: "uploading" | "parsing"): JobProfileSnapshot {
  const profile = createCompleteProfile()
  const resume = createResume({
    id: "resume_update_2026_07",
    parsedAt: null,
    processingStatus: status === "uploading" ? "uploaded" : "parsing",
  })

  return {
    profile,
    recognition: createRecognition(profile.resume!),
    resumeUpdate: {
      id: "resume_update_2026_07",
      createdAt: "2026-07-13T08:00:00.000Z",
      status,
      resume,
      changeSummary: null,
      failureReason: null,
      preservesManualChanges: true,
    },
  }
}

function createResumeUpdateFailedSnapshot(): JobProfileSnapshot {
  const profile = createCompleteProfile()
  const failureReason =
    "The updated resume could not be recognized because its text layer is unavailable."
  const resume = createResume({
    failureReason,
    id: "resume_update_2026_07",
    parsedAt: null,
    processingStatus: "failed",
  })

  return {
    profile,
    recognition: createRecognition(profile.resume!),
    resumeUpdate: {
      id: "resume_update_2026_07",
      createdAt: "2026-07-13T08:00:00.000Z",
      status: "failed",
      resume,
      changeSummary: null,
      failureReason,
      preservesManualChanges: true,
    },
  }
}

export type ProfileMockScenario =
  | "complete"
  | "noProfile"
  | "emptyManualProfile"
  | "profileWithoutResume"
  | "initialResumeUploading"
  | "initialResumeRecognizing"
  | "initialResumeRecognitionSucceeded"
  | "initialResumeRecognitionFailed"
  | "initialResumeRecognitionFailedWithoutReason"
  | "partial"
  | "resumeUpdateUploading"
  | "resumeUpdateRecognizing"
  | "resumeUpdateSucceeded"
  | "resumeUpdateFailed"

const profileMockScenarios = {
  complete: createCompleteSnapshot(),
  noProfile: { profile: null, recognition: null, resumeUpdate: null },
  emptyManualProfile: createEmptyManualProfileSnapshot(),
  profileWithoutResume: createProfileWithoutResumeSnapshot(),
  initialResumeUploading: createInitialResumeSnapshot("uploadingResume"),
  initialResumeRecognizing: createInitialResumeSnapshot("parsingResume"),
  initialResumeRecognitionSucceeded: createInitialResumeRecognitionSucceededSnapshot(),
  initialResumeRecognitionFailed: createInitialResumeSnapshot("recognitionFailed"),
  initialResumeRecognitionFailedWithoutReason: createInitialResumeSnapshot(
    "recognitionFailed",
    null,
  ),
  partial: createPartialProfileSnapshot(),
  resumeUpdateUploading: createResumeUpdateProcessingSnapshot("uploading"),
  resumeUpdateRecognizing: createResumeUpdateProcessingSnapshot("parsing"),
  resumeUpdateSucceeded: createResumeUpdateSucceededSnapshot(),
  resumeUpdateFailed: createResumeUpdateFailedSnapshot(),
} satisfies Record<ProfileMockScenario, JobProfileSnapshot>

export const profileResponseMock = profileMockScenarios.complete

export function createProfileMockSnapshot(
  scenario: ProfileMockScenario = "complete",
): JobProfileSnapshot {
  return structuredClone(profileMockScenarios[scenario])
}
