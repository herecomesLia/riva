import { createRolesMockResponse, type RolesMockScenario } from "@/mocks/data/roles"
import type { RolesPageResponse, TargetRole } from "@/models/roles"

export function createRoleStoryResponse(scenario: RolesMockScenario): RolesPageResponse {
  return createRolesMockResponse(scenario)
}

export function createRoleStoryRole(scenario: Exclude<RolesMockScenario, "noRoles">): TargetRole {
  return createRolesMockResponse(scenario).roles[0]!
}

export function createNoCurrentRoleResponse() {
  const response = createRolesMockResponse("multipleRoles")
  response.currentRoleId = null
  response.roles.forEach((role) => {
    role.isCurrent = false
  })
  return response
}

export function createManyRolesResponse() {
  const response = createRolesMockResponse("multipleRoles")
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
      isCurrent: false,
      createdAt: `2026-07-${String(index + 1).padStart(2, "0")}T08:00:00.000Z`,
      updatedAt: `2026-07-${String(index + 1).padStart(2, "0")}T09:00:00.000Z`,
    })),
  )
  return response
}

export function createLongJobDescriptionResponse() {
  const response = createRolesMockResponse("roleWithParsedJobDescription")
  const role = response.roles[0]!
  if (role.jobDescription.status !== "ready" || !role.jobDescriptionAnalysis) {
    throw new Error("Expected a ready JD fixture.")
  }
  role.jobDescription.rawText = [
    "Own the architecture and delivery of a multi-region merchant operations platform used by thousands of internal users.",
    "Partner with product, design, data, and infrastructure teams to turn complex workflows into reliable, accessible interfaces.",
    "Establish frontend quality standards covering performance budgets, observability, automated testing, and incident response.",
    "Mentor engineers, lead technical planning, and communicate trade-offs to both engineering and business stakeholders.",
    "Candidates should have deep TypeScript and React experience, strong systems thinking, and a record of shipping large SaaS products.",
  ].join("\n\n")
  role.jobDescriptionAnalysis.responsibilities.push(
    "Define measurable frontend reliability and performance standards across product teams.",
    "Lead cross-functional technical planning for multi-quarter platform initiatives.",
    "Coach engineers through architecture reviews and production incident follow-up.",
  )
  return response
}

export function createLongMatchingAnalysisResponse() {
  const response = createRolesMockResponse("matchingAnalysisCurrent")
  const analysis = response.roles[0]!.matchingAnalysis
  if (analysis?.status !== "current") {
    throw new Error("Expected a current matching-analysis fixture.")
  }
  analysis.result.preparationRecommendations.push(
    "Prepare a concise architecture narrative that connects user impact, system constraints, delivery milestones, and measurable reliability improvements.",
    "Rehearse trade-off discussions for performance budgets, observability coverage, and incremental platform migration.",
    "Select two cross-functional projects that demonstrate technical leadership without relying on formal authority.",
  )
  analysis.result.highRiskQuestions.push(
    "How would you recover a multi-quarter platform migration that is missing both its reliability goals and product milestones?",
    "Which frontend metrics would you use to distinguish perceived speed problems from backend latency or workflow design issues?",
  )
  return response
}

export function createStaleWhileParsingResponse() {
  const response = createRolesMockResponse("matchingAnalysisStale")
  const staleAnalysis = response.roles[0]!.matchingAnalysis
  const parsingRole = createRolesMockResponse("roleWithJobDescriptionParsing").roles[0]!
  if (staleAnalysis?.status !== "stale") {
    throw new Error("Expected a stale matching-analysis fixture.")
  }
  response.roles[0] = {
    ...parsingRole,
    matchingAnalysis: structuredClone(staleAnalysis),
  }
  return response
}

export function createParsingJobDescriptionResponse(initial: RolesPageResponse, rawText: string) {
  const response = structuredClone(initial)
  const role = response.roles[0]!
  const version = (role.jobDescription.version ?? 0) + 1
  response.roles[0] = {
    ...role,
    version: role.version + 1,
    jobDescription: {
      status: "parsing",
      rawText,
      version,
      parsingFailureReason: null,
    },
    jobDescriptionAnalysis: null,
    matchingAnalysis:
      role.matchingAnalysis?.status === "current"
        ? { ...role.matchingAnalysis, status: "stale" }
        : role.matchingAnalysis,
  }
  return response
}

export function createReadyJobDescriptionResponse(parsing: RolesPageResponse, summary: string) {
  const response = structuredClone(parsing)
  const role = response.roles[0]!
  if (role.jobDescription.status !== "parsing") {
    throw new Error("Expected a parsing JD fixture.")
  }
  const template = createRolesMockResponse("roleWithParsedJobDescription").roles[0]!
    .jobDescriptionAnalysis!
  response.roles[0] = {
    ...role,
    version: role.version + 1,
    jobDescription: { ...role.jobDescription, status: "ready" },
    jobDescriptionAnalysis: {
      ...template,
      rivaSummary: summary,
      jobDescriptionVersion: role.jobDescription.version,
    },
  }
  return response
}

export function createGeneratingAnalysisResponse(initial: RolesPageResponse) {
  const response = structuredClone(initial)
  const role = response.roles[0]!
  if (
    !response.profileContext.exists ||
    !response.profileContext.completed ||
    role.jobDescription.status !== "ready" ||
    !role.jobDescriptionAnalysis
  ) {
    throw new Error("Expected complete analysis prerequisites.")
  }
  response.roles[0] = {
    ...role,
    version: role.version + 1,
    matchingAnalysis: {
      status: "generating",
      profileVersion: response.profileContext.version,
      jobDescriptionVersion: role.jobDescription.version,
      jobDescriptionAnalysisVersion: role.jobDescriptionAnalysis.analysisVersion,
      generatedAt: null,
      failureReason: null,
      result: null,
    },
  }
  return response
}

export function createCurrentAnalysisResponse(generating: RolesPageResponse) {
  const response = structuredClone(generating)
  const role = response.roles[0]!
  const source = createRolesMockResponse("matchingAnalysisCurrent").roles[0]!.matchingAnalysis
  if (role.matchingAnalysis?.status !== "generating" || source?.status !== "current") {
    throw new Error("Expected generating and current analysis fixtures.")
  }
  response.roles[0] = {
    ...role,
    version: role.version + 1,
    matchingAnalysis: {
      ...role.matchingAnalysis,
      status: "current",
      generatedAt: "2026-07-18T09:00:00.000Z",
      result: structuredClone(source.result),
    },
  }
  return response
}
