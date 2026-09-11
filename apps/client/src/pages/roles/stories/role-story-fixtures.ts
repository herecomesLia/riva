import type { JobDescriptionResponse } from "@/api/generated/models"
import { jdFailReason, matchResultFixture, extractedJdFixture } from "@/mocks/fixtures/target-role"
import type { JdState, MatchState, RolesData, RoleView } from "@/models/target-role-workflow"

export type RolesStoryScenario =
  | "noRoles"
  | "singleRoleWithoutJobDescription"
  | "multipleRoles"
  | "multipleRolesReady"
  | "multipleRolesCurrentMissing"
  | "multipleRolesJdMissing"
  | "rolesWithoutCurrent"
  | "roleWithJobDescriptionExtracting"
  | "roleWithJobDescriptionFailed"
  | "roleWithExtractedJobDescription"
  | "profileMissing"
  | "profileIncomplete"
  | "matchingAnalysisGenerating"
  | "matchingAnalysisFailed"
  | "matchingAnalysisStale"
  | "matchingAnalysisCurrent"
  | "archivedRoles"

const emptyJd = {
  responsibilities: [],
  requirements: {
    education: [],
    graduationCohorts: [],
    majors: [],
    experience: [],
    languages: [],
    certifications: [],
    other: [],
  },
  hardSkills: {
    programmingLanguages: [],
    frameworksAndLibraries: [],
    platforms: [],
    tools: [],
    conceptsAndMethods: [],
    databasesAndMiddleware: [],
    other: [],
  },
  softSkills: [],
  preferredQualifications: [],
  businessDomains: [],
} satisfies JobDescriptionResponse

const completeProfile = { exists: true, complete: true }
const failedMatchReason =
  "The matching analysis could not be generated right now. Your profile and JD are preserved; please try again."

function createRole(
  id: string,
  title: string,
  options: {
    company?: string
    location?: string
    isArchived?: boolean
    jdState?: JdState
    matchState?: MatchState
  } = {},
): RoleView {
  const jdState = options.jdState ?? {
    status: "ready",
    result: structuredClone(extractedJdFixture),
  }
  return {
    id,
    title,
    company: options.company ?? "ByteDance",
    recruitmentTrack: "experienced",
    location: options.location ?? "Shanghai",
    isArchived: options.isArchived ?? false,
    jd: jdState.status === "ready" ? structuredClone(jdState.result) : structuredClone(emptyJd),
    jdState,
    matchState: options.matchState ?? { status: "none" },
    createdAt: "2026-07-01T09:00:00.000Z",
    updatedAt: "2026-07-14T09:00:00.000Z",
  }
}

function frontendRole(options: Parameters<typeof createRole>[2] = {}) {
  return createRole("role_frontend_bytedance", "Senior Frontend Engineer", options)
}

function productRole(options: Parameters<typeof createRole>[2] = {}) {
  return createRole("role_product_manager_meituan", "Product Manager", {
    company: "Meituan",
    location: "Beijing",
    ...options,
  })
}

const scenarios: Record<RolesStoryScenario, RolesData> = {
  noRoles: { roles: [], activeRoleId: null, profile: completeProfile },
  singleRoleWithoutJobDescription: {
    roles: [frontendRole({ jdState: { status: "missing" } })],
    activeRoleId: "role_frontend_bytedance",
    profile: completeProfile,
  },
  multipleRoles: {
    roles: [
      frontendRole({ matchState: { status: "current", result: matchResultFixture } }),
      productRole({ jdState: { status: "missing" } }),
    ],
    activeRoleId: "role_frontend_bytedance",
    profile: completeProfile,
  },
  multipleRolesReady: {
    roles: [
      frontendRole({ matchState: { status: "current", result: matchResultFixture } }),
      productRole(),
    ],
    activeRoleId: "role_frontend_bytedance",
    profile: completeProfile,
  },
  multipleRolesCurrentMissing: {
    roles: [frontendRole({ jdState: { status: "missing" } }), productRole()],
    activeRoleId: "role_frontend_bytedance",
    profile: completeProfile,
  },
  multipleRolesJdMissing: {
    roles: [
      frontendRole({ jdState: { status: "missing" } }),
      productRole({ jdState: { status: "missing" } }),
    ],
    activeRoleId: "role_frontend_bytedance",
    profile: completeProfile,
  },
  rolesWithoutCurrent: {
    roles: [frontendRole(), productRole({ jdState: { status: "missing" } })],
    activeRoleId: null,
    profile: completeProfile,
  },
  roleWithJobDescriptionExtracting: {
    roles: [frontendRole({ jdState: { status: "extracting", phase: "running" } })],
    activeRoleId: "role_frontend_bytedance",
    profile: completeProfile,
  },
  roleWithJobDescriptionFailed: {
    roles: [
      createRole("role_frontend_tiktok", "Frontend Engineer", {
        company: "TikTok",
        jdState: { status: "failed", reason: jdFailReason },
      }),
    ],
    activeRoleId: "role_frontend_tiktok",
    profile: completeProfile,
  },
  roleWithExtractedJobDescription: {
    roles: [frontendRole()],
    activeRoleId: "role_frontend_bytedance",
    profile: completeProfile,
  },
  profileMissing: {
    roles: [frontendRole()],
    activeRoleId: "role_frontend_bytedance",
    profile: { exists: false, complete: false },
  },
  profileIncomplete: {
    roles: [frontendRole()],
    activeRoleId: "role_frontend_bytedance",
    profile: { exists: true, complete: false },
  },
  matchingAnalysisGenerating: {
    roles: [frontendRole({ matchState: { status: "generating" } })],
    activeRoleId: "role_frontend_bytedance",
    profile: completeProfile,
  },
  matchingAnalysisFailed: {
    roles: [frontendRole({ matchState: { status: "failed", reason: failedMatchReason } })],
    activeRoleId: "role_frontend_bytedance",
    profile: completeProfile,
  },
  matchingAnalysisStale: {
    roles: [frontendRole({ matchState: { status: "stale", result: matchResultFixture } })],
    activeRoleId: "role_frontend_bytedance",
    profile: completeProfile,
  },
  matchingAnalysisCurrent: {
    roles: [frontendRole({ matchState: { status: "current", result: matchResultFixture } })],
    activeRoleId: "role_frontend_bytedance",
    profile: completeProfile,
  },
  archivedRoles: {
    roles: [
      frontendRole({ matchState: { status: "current", result: matchResultFixture } }),
      createRole("role_frontend_meituan", "Frontend Engineer", {
        company: "Meituan",
        isArchived: true,
      }),
    ],
    activeRoleId: "role_frontend_bytedance",
    profile: completeProfile,
  },
}

export function createRoleStoryResponse(scenario: RolesStoryScenario): RolesData {
  return structuredClone(scenarios[scenario])
}

export function createRoleStoryRole(scenario: Exclude<RolesStoryScenario, "noRoles">): RoleView {
  return createRoleStoryResponse(scenario).roles[0]!
}

export function createManyRolesResponse() {
  const response = createRoleStoryResponse("multipleRoles")
  const template = response.roles[1]!
  const titles = [
    "Design Systems Engineer",
    "Developer Experience Engineer",
    "Web Platform Engineer",
    "Frontend Infrastructure Engineer",
    "Staff UI Engineer",
    "Commerce Platform Engineer",
    "Growth Product Engineer",
    "Accessibility Engineer",
    "Frontend Performance Engineer",
    "Technical Lead, Web",
  ]

  response.roles.push(
    ...titles.map((title, index) => ({
      ...structuredClone(template),
      id: `role-many-${String(index + 3).padStart(2, "0")}`,
      title,
      company: index % 2 === 0 ? "Northstar Labs" : "Harbor Cloud",
      createdAt: `2026-07-${String(index + 1).padStart(2, "0")}T08:00:00.000Z`,
      updatedAt: `2026-07-${String(index + 1).padStart(2, "0")}T09:00:00.000Z`,
    })),
  )
  return response
}

export function createLongJobDescriptionResponse() {
  const response = createRoleStoryResponse("roleWithExtractedJobDescription")
  response.roles[0]!.jd.responsibilities.push(
    "Define measurable frontend reliability and performance standards across product teams.",
    "Lead cross-functional technical planning for multi-quarter platform initiatives.",
    "Coach engineers through architecture reviews and production incident follow-up.",
  )
  return response
}

export function createLongMatchingAnalysisResponse() {
  const response = createRoleStoryResponse("matchingAnalysisCurrent")
  const match = response.roles[0]!.matchState
  if (match.status !== "current") throw new Error("Expected a current match fixture.")
  match.result.preparationRecommendations.push(
    "Prepare a concise architecture narrative that connects user impact, system constraints, delivery milestones, and measurable reliability improvements.",
    "Rehearse trade-off discussions for performance budgets, observability coverage, and incremental platform migration.",
    "Select two cross-functional projects that demonstrate technical leadership without relying on formal authority.",
  )
  match.result.highRiskQuestions.push(
    "How would you recover a multi-quarter platform migration that is missing both its reliability goals and product milestones?",
    "Which frontend metrics would you use to distinguish perceived speed problems from backend latency or workflow design issues?",
  )
  return response
}

export function createStaleWhileExtractingResponse() {
  const response = createRoleStoryResponse("matchingAnalysisStale")
  response.roles[0]!.jdState = { status: "extracting", phase: "running" }
  return response
}
