import type { RoleResources } from "../types"
import type {
  JobDescriptionResponse,
  RoleListResponse,
  RoleResponse,
  TaskStatusResponse,
  TaskFailureResponse,
} from "@/api/generated/models"
import { jdFailReason, matchResultFixture, extractedJdFixture } from "@/mocks/fixtures/role"
import type { RoleMatchingResponse } from "@/api/generated/models"

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
  | "matchingAnalysisGenerating"
  | "matchingAnalysisFailed"
  | "matchingAnalysisStale"
  | "matchingAnalysisCurrent"
  | "archivedRoles"

const emptyJd = {
  updatedAt: "2026-07-01T00:00:00Z",
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

export type RoleStoryData = RoleListResponse & RoleResources
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
    matching?: RoleMatchingResponse
    analysis?: TaskStatusResponse | TaskFailureResponse
  } = {},
) {
  const jdTask = options.jdTask ?? { status: "idle", error: null }
  const role: RoleResponse = {
    id,
    title,
    matching: structuredClone(
      options.matching ?? { result: null, generatedAt: null, isStale: false },
    ),
    company: options.company ?? "ByteDance",
    recruitmentTrack: "experienced",
    location: options.location ?? "Shanghai",
    isArchived: options.isArchived ?? false,
    jd: structuredClone(options.jd ?? extractedJdFixture),
    createdAt: "2026-07-01T09:00:00.000Z",
    updatedAt: "2026-07-14T09:00:00.000Z",
  }
  const analysis = options.analysis ?? { status: "idle" as const, error: null }
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
    activeRoleId: string | null
  }
> = {
  noRoles: { entries: [], activeRoleId: null },
  singleRoleWithoutJobDescription: {
    entries: [frontendRole({ jd: emptyJd })],
    activeRoleId: "role_frontend_bytedance",
  },
  multipleRoles: {
    entries: [
      frontendRole({
        matching: {
          result: matchResultFixture,
          generatedAt: "2026-07-14T09:00:00Z",
          isStale: false,
        },
      }),
      productRole({ jd: emptyJd }),
    ],
    activeRoleId: "role_frontend_bytedance",
  },
  multipleRolesReady: {
    entries: [
      frontendRole({
        matching: {
          result: matchResultFixture,
          generatedAt: "2026-07-14T09:00:00Z",
          isStale: false,
        },
      }),
      productRole(),
    ],
    activeRoleId: "role_frontend_bytedance",
  },
  multipleRolesCurrentMissing: {
    entries: [frontendRole({ jd: emptyJd }), productRole()],
    activeRoleId: "role_frontend_bytedance",
  },
  multipleRolesJdMissing: {
    entries: [frontendRole({ jd: emptyJd }), productRole({ jd: emptyJd })],
    activeRoleId: "role_frontend_bytedance",
  },
  rolesWithoutCurrent: {
    entries: [frontendRole(), productRole({ jd: emptyJd })],
    activeRoleId: null,
  },
  roleWithJobDescriptionExtracting: {
    entries: [frontendRole({ jdTask: { status: "running", error: null } })],
    activeRoleId: "role_frontend_bytedance",
  },
  roleWithJobDescriptionFailed: {
    entries: [
      createRole("role_frontend_tiktok", "Frontend Engineer", {
        company: "TikTok",
        jdTask: { status: "failed", error: { code: "invalid_output", message: jdFailReason } },
      }),
    ],
    activeRoleId: "role_frontend_tiktok",
  },
  roleWithExtractedJobDescription: {
    entries: [frontendRole()],
    activeRoleId: "role_frontend_bytedance",
  },
  matchingAnalysisGenerating: {
    entries: [frontendRole({ analysis: { status: "running", error: null } })],
    activeRoleId: "role_frontend_bytedance",
  },
  matchingAnalysisFailed: {
    entries: [
      frontendRole({
        analysis: {
          status: "failed",
          error: { code: "invalid_output", message: failedMatchReason },
        },
      }),
    ],
    activeRoleId: "role_frontend_bytedance",
  },
  matchingAnalysisStale: {
    entries: [
      frontendRole({
        matching: {
          result: matchResultFixture,
          generatedAt: "2026-07-14T09:00:00Z",
          isStale: true,
        },
      }),
    ],
    activeRoleId: "role_frontend_bytedance",
  },
  matchingAnalysisCurrent: {
    entries: [
      frontendRole({
        matching: {
          result: matchResultFixture,
          generatedAt: "2026-07-14T09:00:00Z",
          isStale: false,
        },
      }),
    ],
    activeRoleId: "role_frontend_bytedance",
  },
  archivedRoles: {
    entries: [
      frontendRole({
        matching: {
          result: matchResultFixture,
          generatedAt: "2026-07-14T09:00:00Z",
          isStale: false,
        },
      }),
      createRole("role_frontend_meituan", "Frontend Engineer", {
        company: "Meituan",
        isArchived: true,
      }),
    ],
    activeRoleId: "role_frontend_bytedance",
  },
}

export function createRoleStoryResponse(scenario: RolesStoryScenario): RoleStoryData {
  const { entries, activeRoleId } = structuredClone(scenarios[scenario])
  return {
    roles: entries.map(({ role }) => role),
    activeRoleId,
    jdTasksByRoleId: Object.fromEntries(entries.map(({ role, jdTask }) => [role.id, jdTask])),
    matchingStatesByRoleId: Object.fromEntries(
      entries.map(({ role, analysis }) => [role.id, analysis]),
    ),
  }
}

export function createRoleStoryRole(
  scenario: Exclude<RolesStoryScenario, "noRoles">,
): RoleResponse {
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
  for (const role of response.roles) {
    response.jdTasksByRoleId[role.id] ??= { status: "idle", error: null }
    response.matchingStatesByRoleId[role.id] ??= { status: "idle", error: null }
  }
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
  const match = response.roles[0]!.matching
  match.result!.interviewPreparationSuggestions.push(
    "Prepare a concise architecture narrative that connects user impact, system constraints, delivery milestones, and measurable reliability improvements.",
    "Rehearse trade-off discussions for performance budgets, observability coverage, and incremental platform migration.",
    "Select two cross-functional projects that demonstrate technical leadership without relying on formal authority.",
  )
  match.result!.resumeOptimizationSuggestions.push(
    "Expand the existing project descriptions with documented accessibility audit findings, the improvements you implemented, and the validation results.",
    "Clarify the scale of products you worked on with verified usage metrics and your personal architecture responsibilities.",
  )
  return response
}

export function createStaleWhileExtractingResponse() {
  const response = createRoleStoryResponse("matchingAnalysisStale")
  const id = response.roles[0]!.id
  response.jdTasksByRoleId[id] = { status: "running", error: null }
  return response
}
