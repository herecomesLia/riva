import type {
  MatchingAnalysis,
  ReadyTargetRole,
  RolesPageResponse,
  TargetRole,
  TargetRoleWithoutReadyJobDescription,
} from "@/models/roles"

import {
  createJobDescriptionAnalysisFixture,
  createMatchingAnalysisResultFixture,
} from "./role-fixture-builders"

type TargetRoleBaseFixture = Omit<TargetRole, "jobDescription" | "jobDescriptionAnalysis">

const completeProfileContext = {
  exists: true,
  version: 12,
  completed: true,
} as const

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
    jobDescriptionAnalysis: createJobDescriptionAnalysisFixture({
      jobDescriptionVersion,
      parsedAt: "2026-07-14T08:45:00.000Z",
    }),
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
    result: createMatchingAnalysisResultFixture(),
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
    result: createMatchingAnalysisResultFixture(),
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
    roles: [createMissingJobDescriptionRole("role_frontend_bytedance", "Senior Frontend Engineer")],
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
    roles: [createParsingJobDescriptionRole("role_frontend_bytedance", "Senior Frontend Engineer")],
    currentRoleId: "role_frontend_bytedance",
    profileContext: completeProfileContext,
  },
  roleWithJobDescriptionFailed: {
    roles: [
      createFailedJobDescriptionRole("role_frontend_tiktok", "Frontend Engineer", {
        company: "TikTok",
      }),
    ],
    currentRoleId: "role_frontend_tiktok",
    profileContext: completeProfileContext,
  },
  roleWithParsedJobDescription: {
    roles: [
      createReadyJobDescriptionRole("role_frontend_bytedance", "Senior Frontend Engineer", 4, null),
    ],
    currentRoleId: "role_frontend_bytedance",
    profileContext: completeProfileContext,
  },
  profileMissing: {
    roles: [
      createReadyJobDescriptionRole("role_frontend_bytedance", "Senior Frontend Engineer", 4, null),
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
      createReadyJobDescriptionRole("role_frontend_bytedance", "Senior Frontend Engineer", 4, null),
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
        { updatedAt: "2026-07-15T09:00:00.000Z", version: 6 },
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
