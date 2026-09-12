import type { RoleResources } from "../types"
import { hasJobDescription } from "@/lib/job-description"
import type {
  JobDescriptionResponse,
  TargetRoleListResponse,
  TargetRoleResponse,
  TaskStatusResponse,
  TaskFailureResponse,
} from "@/api/generated/models"
import { jdFailReason, matchResultFixture, extractedJdFixture } from "@/mocks/fixtures/target-role"
import type { MatchingAnalysisState } from "@/mocks/models/role"

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

export type RoleStoryData = TargetRoleListResponse & RoleResources
const failedMatchReason =
  "The matching analysis could not be generated right now. Your profile and JD are preserved; please try again."

function createRole(
  id: string,
  title: string,
  options: {
    company?: string
    location?: string
    isArchived?: boolean
    jd?: JobDescriptionResponse
    jdTask?: TaskStatusResponse | TaskFailureResponse
    analysis?: MatchingAnalysisState
  } = {},
) {
  const jdTask = options.jdTask ?? { status: "idle", error: null }
  const role: TargetRoleResponse = {
    id,
    title,
    company: options.company ?? "ByteDance",
    recruitmentTrack: "experienced",
    location: options.location ?? "Shanghai",
    isArchived: options.isArchived ?? false,
    jd: structuredClone(options.jd ?? extractedJdFixture),
    createdAt: "2026-07-01T09:00:00.000Z",
    updatedAt: "2026-07-14T09:00:00.000Z",
  }
  const analysis: MatchingAnalysisState =
    options.analysis ??
    (jdTask.status === "failed"
      ? { status: "blocked", reason: "jobDescriptionFailed" }
      : jdTask.status !== "idle"
        ? { status: "blocked", reason: "jobDescriptionExtracting" }
        : !hasJobDescription(role.jd)
          ? { status: "blocked", reason: "jobDescriptionMissing" }
          : { status: "none" })
  return { role, jdTask, analysis }
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

const scenarios: Record<
  RolesStoryScenario,
  {
    entries: ReturnType<typeof createRole>[]
    activeTargetRoleId: string | null
    blockedReason?: "profileMissing" | "profileIncomplete"
  }
> = {
  noRoles: { entries: [], activeTargetRoleId: null },
  singleRoleWithoutJobDescription: {
    entries: [frontendRole({ jd: emptyJd })],
    activeTargetRoleId: "role_frontend_bytedance",
  },
  multipleRoles: {
    entries: [
      frontendRole({ analysis: { status: "current", result: matchResultFixture } }),
      productRole({ jd: emptyJd }),
    ],
    activeTargetRoleId: "role_frontend_bytedance",
  },
  multipleRolesReady: {
    entries: [
      frontendRole({ analysis: { status: "current", result: matchResultFixture } }),
      productRole(),
    ],
    activeTargetRoleId: "role_frontend_bytedance",
  },
  multipleRolesCurrentMissing: {
    entries: [frontendRole({ jd: emptyJd }), productRole()],
    activeTargetRoleId: "role_frontend_bytedance",
  },
  multipleRolesJdMissing: {
    entries: [frontendRole({ jd: emptyJd }), productRole({ jd: emptyJd })],
    activeTargetRoleId: "role_frontend_bytedance",
  },
  rolesWithoutCurrent: {
    entries: [frontendRole(), productRole({ jd: emptyJd })],
    activeTargetRoleId: null,
  },
  roleWithJobDescriptionExtracting: {
    entries: [frontendRole({ jdTask: { status: "running", error: null } })],
    activeTargetRoleId: "role_frontend_bytedance",
  },
  roleWithJobDescriptionFailed: {
    entries: [
      createRole("role_frontend_tiktok", "Frontend Engineer", {
        company: "TikTok",
        jdTask: { status: "failed", error: { code: "invalid_output", message: jdFailReason } },
      }),
    ],
    activeTargetRoleId: "role_frontend_tiktok",
  },
  roleWithExtractedJobDescription: {
    entries: [frontendRole()],
    activeTargetRoleId: "role_frontend_bytedance",
  },
  profileMissing: {
    entries: [frontendRole()],
    activeTargetRoleId: "role_frontend_bytedance",
    blockedReason: "profileMissing",
  },
  profileIncomplete: {
    entries: [frontendRole()],
    activeTargetRoleId: "role_frontend_bytedance",
    blockedReason: "profileIncomplete",
  },
  matchingAnalysisGenerating: {
    entries: [frontendRole({ analysis: { status: "generating" } })],
    activeTargetRoleId: "role_frontend_bytedance",
  },
  matchingAnalysisFailed: {
    entries: [frontendRole({ analysis: { status: "failed", reason: failedMatchReason } })],
    activeTargetRoleId: "role_frontend_bytedance",
  },
  matchingAnalysisStale: {
    entries: [frontendRole({ analysis: { status: "stale", result: matchResultFixture } })],
    activeTargetRoleId: "role_frontend_bytedance",
  },
  matchingAnalysisCurrent: {
    entries: [frontendRole({ analysis: { status: "current", result: matchResultFixture } })],
    activeTargetRoleId: "role_frontend_bytedance",
  },
  archivedRoles: {
    entries: [
      frontendRole({ analysis: { status: "current", result: matchResultFixture } }),
      createRole("role_frontend_meituan", "Frontend Engineer", {
        company: "Meituan",
        isArchived: true,
      }),
    ],
    activeTargetRoleId: "role_frontend_bytedance",
  },
}

export function createRoleStoryResponse(scenario: RolesStoryScenario): RoleStoryData {
  const { entries, activeTargetRoleId, blockedReason } = structuredClone(scenarios[scenario])
  return {
    targetRoles: entries.map(({ role }) => role),
    activeTargetRoleId,
    jdTasksByRoleId: Object.fromEntries(entries.map(({ role, jdTask }) => [role.id, jdTask])),
    matchingByRoleId: Object.fromEntries(
      entries.map(({ role, analysis }) => [
        role.id,
        blockedReason ? { status: "blocked", reason: blockedReason } : analysis,
      ]),
    ),
  }
}

export function createRoleStoryRole(
  scenario: Exclude<RolesStoryScenario, "noRoles">,
): TargetRoleResponse {
  return createRoleStoryResponse(scenario).targetRoles[0]!
}

export function createManyRolesResponse() {
  const response = createRoleStoryResponse("multipleRoles")
  const template = response.targetRoles[1]!
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

  response.targetRoles.push(
    ...titles.map((title, index) => ({
      ...structuredClone(template),
      id: `role-many-${String(index + 3).padStart(2, "0")}`,
      title,
      company: index % 2 === 0 ? "Northstar Labs" : "Harbor Cloud",
      createdAt: `2026-07-${String(index + 1).padStart(2, "0")}T08:00:00.000Z`,
      updatedAt: `2026-07-${String(index + 1).padStart(2, "0")}T09:00:00.000Z`,
    })),
  )
  for (const role of response.targetRoles) {
    response.jdTasksByRoleId[role.id] ??= { status: "idle", error: null }
    response.matchingByRoleId[role.id] ??= { status: "blocked", reason: "jobDescriptionMissing" }
  }
  return response
}

export function createLongJobDescriptionResponse() {
  const response = createRoleStoryResponse("roleWithExtractedJobDescription")
  response.targetRoles[0]!.jd.responsibilities.push(
    "Define measurable frontend reliability and performance standards across product teams.",
    "Lead cross-functional technical planning for multi-quarter platform initiatives.",
    "Coach engineers through architecture reviews and production incident follow-up.",
  )
  return response
}

export function createLongMatchingAnalysisResponse() {
  const response = createRoleStoryResponse("matchingAnalysisCurrent")
  const match = response.matchingByRoleId[response.targetRoles[0]!.id]!
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
  const id = response.targetRoles[0]!.id
  const analysis = response.matchingByRoleId[id]!
  if (analysis.status !== "stale") throw new Error("Expected a stale result.")
  response.jdTasksByRoleId[id] = { status: "running", error: null }
  response.matchingByRoleId[id] = {
    status: "blocked",
    reason: "jobDescriptionExtracting",
    result: analysis.result,
  }
  return response
}
