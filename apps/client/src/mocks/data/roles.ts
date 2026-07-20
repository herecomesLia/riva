import type {
  JobDescriptionAnalysis,
  MatchingAnalysis,
  MatchingAnalysisResult,
  ReadyTargetRole,
  RolesPageResponse,
  TargetRole,
  TargetRoleWithoutReadyJobDescription,
} from "@/models/roles"

type TargetRoleBaseFixture = Omit<TargetRole, "jobDescription" | "jobDescriptionAnalysis">

const completeProfileContext = {
  exists: true,
  version: 12,
  completed: true,
} as const

function createMatchingAnalysisResult(): MatchingAnalysisResult {
  return {
    overallMatchScore: 78,
    coreRequirementsSummary:
      "Lead complex React product delivery with strong engineering judgment and measurable impact.",
    matchedCapabilities: ["React architecture", "TypeScript", "Design systems"],
    missingCapabilities: ["Large-scale experimentation"],
    underrepresentedCapabilities: ["Cross-functional technical leadership"],
    resumeHighlights: [
      "Led the merchant operations console from architecture through delivery.",
      "Improved Core Web Vitals pass rate from 71% to 94%.",
    ],
    resumeGaps: [
      "Describe experimentation design and decision-making with more concrete examples.",
    ],
    highRiskQuestions: [
      "How did you align partner teams when frontend architecture decisions affected delivery scope?",
      "Which experiment metrics did you use to decide whether a product change should ship?",
    ],
    preparationRecommendations: [
      "Prepare a STAR narrative about balancing delivery speed and frontend quality.",
      "Quantify the impact of technical leadership across partner teams.",
    ],
  }
}

function createJobDescriptionAnalysis(jobDescriptionVersion: number): JobDescriptionAnalysis {
  return {
    jobDescriptionVersion,
    analysisVersion: 1,
    parsedAt: "2026-07-14T08:45:00.000Z",
    rivaSummary: "负责可扩展前端架构与复杂业务交付，重点要求 React、TypeScript 和跨团队协作能力。",
    responsibilities: [
      "负责商家运营产品的前端架构与交付。",
      "与产品、设计和后端团队协作，推进复杂业务流程。",
    ],
    qualificationRequirements: {
      education: ["本科及以上"],
      graduationCohorts: [],
      majors: ["计算机或相关专业"],
      experience: ["五年以上前端工程经验"],
      languages: [],
      certifications: [],
      other: [],
    },
    requiredSkills: {
      programmingLanguages: ["TypeScript"],
      frameworksAndLibraries: ["React"],
      platforms: [],
      tools: [],
      conceptsAndMethods: ["前端架构", "性能优化"],
      databasesAndMiddleware: [],
      other: [],
    },
    preferredQualifications: ["有实验平台建设经验", "熟悉无障碍设计"],
    softSkills: ["技术领导力", "跨团队沟通"],
    businessDomains: ["商家运营", "电商平台"],
  }
}

function createRoleBase(
  id: string,
  title: string,
  overrides: Partial<TargetRoleBaseFixture> = {},
): TargetRoleBaseFixture {
  return {
    id,
    title,
    company: "ByteDance",
    recruitmentType: "experienced",
    location: "Shanghai",
    experienceRange: { minYears: 5, maxYears: null },
    preparationStatus: "preparing",
    isCurrent: false,
    createdAt: "2026-07-01T09:00:00.000Z",
    updatedAt: "2026-07-14T09:00:00.000Z",
    version: 4,
    matchingAnalysis: null,
    ...overrides,
  }
}

function createMissingJobDescriptionRole(
  id: string,
  title: string,
  overrides: Partial<TargetRoleBaseFixture> = {},
): TargetRoleWithoutReadyJobDescription {
  return {
    ...createRoleBase(id, title, overrides),
    jobDescription: {
      status: "missing",
      rawText: null,
      version: null,
      parsingFailureReason: null,
    },
    jobDescriptionAnalysis: null,
  }
}

function createParsingJobDescriptionRole(
  id: string,
  title: string,
  overrides: Partial<TargetRoleBaseFixture> = {},
): TargetRoleWithoutReadyJobDescription {
  return {
    ...createRoleBase(id, title, overrides),
    jobDescription: {
      status: "parsing",
      rawText:
        "Own the frontend architecture for merchant operations workflows and collaborate across product teams.",
      version: 2,
      parsingFailureReason: null,
    },
    jobDescriptionAnalysis: null,
  }
}

function createFailedJobDescriptionRole(
  id: string,
  title: string,
  overrides: Partial<TargetRoleBaseFixture> = {},
): TargetRoleWithoutReadyJobDescription {
  return {
    ...createRoleBase(id, title, overrides),
    jobDescription: {
      status: "failed",
      rawText:
        "Build reliable web applications for international creators and improve user-facing performance.",
      version: 3,
      parsingFailureReason:
        "We could not extract structured requirements from this JD. Please review the text and try again.",
    },
    jobDescriptionAnalysis: null,
  }
}

function createReadyJobDescriptionRole(
  id: string,
  title: string,
  jobDescriptionVersion: number,
  matchingAnalysis: MatchingAnalysis | null = null,
  overrides: Partial<TargetRoleBaseFixture> = {},
): ReadyTargetRole {
  return {
    ...createRoleBase(id, title, { matchingAnalysis, ...overrides }),
    jobDescription: {
      status: "ready",
      rawText:
        "Lead frontend architecture for merchant operations products. Build React and TypeScript experiences, improve performance, and mentor engineers through complex delivery decisions.",
      version: jobDescriptionVersion,
      parsingFailureReason: null,
    },
    jobDescriptionAnalysis: createJobDescriptionAnalysis(jobDescriptionVersion),
  }
}

function createCurrentMatchingAnalysis(): MatchingAnalysis {
  return {
    status: "current",
    profileVersion: completeProfileContext.version,
    jobDescriptionVersion: 4,
    jobDescriptionAnalysisVersion: 1,
    generatedAt: "2026-07-14T09:00:00.000Z",
    failureReason: null,
    result: createMatchingAnalysisResult(),
  }
}

function createStaleMatchingAnalysis(): MatchingAnalysis {
  return {
    status: "stale",
    profileVersion: 11,
    jobDescriptionVersion: 3,
    jobDescriptionAnalysisVersion: 1,
    generatedAt: "2026-07-10T10:30:00.000Z",
    failureReason: null,
    result: createMatchingAnalysisResult(),
  }
}

function createGeneratingMatchingAnalysis(): MatchingAnalysis {
  return {
    status: "generating",
    profileVersion: completeProfileContext.version,
    jobDescriptionVersion: 4,
    jobDescriptionAnalysisVersion: 1,
    generatedAt: null,
    failureReason: null,
    result: null,
  }
}

function createFailedMatchingAnalysis(): MatchingAnalysis {
  return {
    status: "failed",
    profileVersion: completeProfileContext.version,
    jobDescriptionVersion: 4,
    jobDescriptionAnalysisVersion: 1,
    generatedAt: null,
    failureReason:
      "The matching analysis could not be generated right now. Your profile and JD are preserved; please try again.",
    result: null,
  }
}

export type RolesMockScenario =
  | "noRoles"
  | "singleRoleWithoutJobDescription"
  | "multipleRoles"
  | "rolesWithoutCurrent"
  | "roleWithJobDescriptionParsing"
  | "roleWithJobDescriptionFailed"
  | "roleWithParsedJobDescription"
  | "profileMissing"
  | "profileIncomplete"
  | "matchingAnalysisGenerating"
  | "matchingAnalysisFailed"
  | "matchingAnalysisStale"
  | "matchingAnalysisCurrent"
  | "archivedRoles"

const rolesMockScenarios = {
  noRoles: {
    roles: [],
    currentRoleId: null,
    profileContext: completeProfileContext,
  },
  singleRoleWithoutJobDescription: {
    roles: [
      createMissingJobDescriptionRole("role_frontend_bytedance", "Senior Frontend Engineer", {
        isCurrent: true,
      }),
    ],
    currentRoleId: "role_frontend_bytedance",
    profileContext: completeProfileContext,
  },
  multipleRoles: {
    roles: [
      createReadyJobDescriptionRole(
        "role_frontend_bytedance",
        "Senior Frontend Engineer",
        4,
        createCurrentMatchingAnalysis(),
        { isCurrent: true },
      ),
      createMissingJobDescriptionRole("role_product_manager_meituan", "Product Manager", {
        company: "Meituan",
        location: "Beijing",
        preparationStatus: "paused",
      }),
    ],
    currentRoleId: "role_frontend_bytedance",
    profileContext: completeProfileContext,
  },
  rolesWithoutCurrent: {
    roles: [
      createReadyJobDescriptionRole(
        "role_frontend_bytedance",
        "Senior Frontend Engineer",
        4,
        null,
        { preparationStatus: "paused" },
      ),
      createMissingJobDescriptionRole("role_product_manager_meituan", "Product Manager", {
        company: "Meituan",
        location: "Beijing",
        preparationStatus: "paused",
      }),
    ],
    currentRoleId: null,
    profileContext: completeProfileContext,
  },
  roleWithJobDescriptionParsing: {
    roles: [
      createParsingJobDescriptionRole("role_frontend_bytedance", "Senior Frontend Engineer", {
        isCurrent: true,
      }),
    ],
    currentRoleId: "role_frontend_bytedance",
    profileContext: completeProfileContext,
  },
  roleWithJobDescriptionFailed: {
    roles: [
      createFailedJobDescriptionRole("role_frontend_tiktok", "Frontend Engineer", {
        company: "TikTok",
        isCurrent: true,
      }),
    ],
    currentRoleId: "role_frontend_tiktok",
    profileContext: completeProfileContext,
  },
  roleWithParsedJobDescription: {
    roles: [
      createReadyJobDescriptionRole(
        "role_frontend_bytedance",
        "Senior Frontend Engineer",
        4,
        null,
        {
          isCurrent: true,
        },
      ),
    ],
    currentRoleId: "role_frontend_bytedance",
    profileContext: completeProfileContext,
  },
  profileMissing: {
    roles: [
      createReadyJobDescriptionRole(
        "role_frontend_bytedance",
        "Senior Frontend Engineer",
        4,
        null,
        {
          isCurrent: true,
        },
      ),
    ],
    currentRoleId: "role_frontend_bytedance",
    profileContext: {
      exists: false,
      version: null,
      completed: false,
    },
  },
  profileIncomplete: {
    roles: [
      createReadyJobDescriptionRole(
        "role_frontend_bytedance",
        "Senior Frontend Engineer",
        4,
        null,
        {
          isCurrent: true,
        },
      ),
    ],
    currentRoleId: "role_frontend_bytedance",
    profileContext: {
      exists: true,
      version: 12,
      completed: false,
    },
  },
  matchingAnalysisGenerating: {
    roles: [
      createReadyJobDescriptionRole(
        "role_frontend_bytedance",
        "Senior Frontend Engineer",
        4,
        createGeneratingMatchingAnalysis(),
        { isCurrent: true },
      ),
    ],
    currentRoleId: "role_frontend_bytedance",
    profileContext: completeProfileContext,
  },
  matchingAnalysisFailed: {
    roles: [
      createReadyJobDescriptionRole(
        "role_frontend_bytedance",
        "Senior Frontend Engineer",
        4,
        createFailedMatchingAnalysis(),
        { isCurrent: true },
      ),
    ],
    currentRoleId: "role_frontend_bytedance",
    profileContext: completeProfileContext,
  },
  matchingAnalysisStale: {
    roles: [
      createReadyJobDescriptionRole(
        "role_frontend_bytedance",
        "Senior Frontend Engineer",
        4,
        createStaleMatchingAnalysis(),
        { isCurrent: true, updatedAt: "2026-07-15T09:00:00.000Z", version: 6 },
      ),
    ],
    currentRoleId: "role_frontend_bytedance",
    profileContext: { exists: true, version: 12, completed: true },
  },
  matchingAnalysisCurrent: {
    roles: [
      createReadyJobDescriptionRole(
        "role_frontend_bytedance",
        "Senior Frontend Engineer",
        4,
        createCurrentMatchingAnalysis(),
        { isCurrent: true },
      ),
    ],
    currentRoleId: "role_frontend_bytedance",
    profileContext: completeProfileContext,
  },
  archivedRoles: {
    roles: [
      createReadyJobDescriptionRole(
        "role_frontend_bytedance",
        "Senior Frontend Engineer",
        4,
        createCurrentMatchingAnalysis(),
        { isCurrent: true },
      ),
      createReadyJobDescriptionRole("role_frontend_meituan", "Frontend Engineer", 2, null, {
        company: "Meituan",
        preparationStatus: "archived",
        updatedAt: "2026-06-20T11:00:00.000Z",
      }),
    ],
    currentRoleId: "role_frontend_bytedance",
    profileContext: completeProfileContext,
  },
} satisfies Record<RolesMockScenario, RolesPageResponse>

export const rolesResponseMock = rolesMockScenarios.matchingAnalysisCurrent

export function createRolesMockResponse(
  scenario: RolesMockScenario = "matchingAnalysisCurrent",
): RolesPageResponse {
  return structuredClone(rolesMockScenarios[scenario])
}
