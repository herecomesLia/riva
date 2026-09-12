import { ApiError } from "@/api/error"
import { getCareerProfileApi } from "@/api/generated/endpoints/career-profile/career-profile"
import { getRolesApi } from "@/api/generated/endpoints/roles/roles"
import { hasJobDescription } from "@/lib/job-description"
import { isCareerProfileComplete } from "@/lib/career-profile"
import type {
  CreateRoleRequest,
  HardSkillsRequest,
  HardSkillsResponse,
  JobDescriptionResponse,
  JobRequirementsRequest,
  JobRequirementsResponse,
  JDTextExtractionRequest,
  TaskStatusResponse,
  TaskFailureResponse,
  SetActiveRoleRequest,
  RoleListResponse,
  RoleResponse,
  UpdateJobDescriptionRequest,
  UpdateRoleRequest,
} from "@/api/generated/models"
import type {
  MatchingAnalysisResult,
  MatchingAnalysisState,
  RecognizeRoleInput,
} from "@/mocks/models/role"
import {
  jdFailInput,
  jdFailReason,
  matchResultFixture,
  extractedJdFixture,
  roleListFixture,
  textRoleFixture,
  imageRoleFixture,
  urlRoleFixture,
} from "@/mocks/fixtures/role"
import { createMockApiError } from "@/mocks/utils"

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

const JD_QUEUE_DURATION_MS = 500
const JD_PROCESSING_DURATION_MS = 2000
const JD_ABORT_DURATION_MS = 500

const careerProfileApi = getCareerProfileApi()
const rolesApi = getRolesApi()

type JdExtractionMock = {
  startedAt: number
  outcome: "success" | "failed"
  abortStartedAt?: number
}

type MatchRecord =
  | {
      status: "running"
      startedAt: number
      result: MatchingAnalysisResult
    }
  | {
      status: "success"
      result: MatchingAnalysisResult
    }
  | {
      status: "stale"
      result: MatchingAnalysisResult
    }

function toMatchState(match: MatchRecord | undefined): MatchingAnalysisState {
  if (!match) return { status: "none" }
  if (match.status === "running") return { status: "generating" }
  return {
    status: match.status === "success" ? "current" : "stale",
    result: structuredClone(match.result),
  }
}

function normalizeRequirements(input: JobRequirementsRequest): JobRequirementsResponse {
  return {
    education: input.education ?? [],
    graduationCohorts: input.graduationCohorts ?? [],
    majors: input.majors ?? [],
    experience: input.experience ?? [],
    languages: input.languages ?? [],
    certifications: input.certifications ?? [],
  }
}

function normalizeHardSkills(input: HardSkillsRequest): HardSkillsResponse {
  return {
    programmingLanguages: input.programmingLanguages ?? [],
    frameworksAndLibraries: input.frameworksAndLibraries ?? [],
    platforms: input.platforms ?? [],
    tools: input.tools ?? [],
    conceptsAndMethods: input.conceptsAndMethods ?? [],
    databasesAndMiddleware: input.databasesAndMiddleware ?? [],
    other: input.other ?? [],
  }
}

export function createRoleFaker(initialState: RoleListResponse) {
  let state = structuredClone(initialState)
  const jdExtractions = new Map<string, JdExtractionMock>()
  const matches = new Map<string, MatchRecord>()
  let roleSeq = 0
  let timeSeq = 0

  function nextId() {
    roleSeq += 1
    return `00000000-0000-4000-8000-${String(roleSeq).padStart(12, "0")}`
  }

  function nextTime() {
    const timestamp = new Date(Date.UTC(2026, 7, 1, 8, timeSeq)).toISOString()
    timeSeq += 1
    return timestamp
  }

  function requireRole(roleId: string) {
    const role = state.roles.find(({ id }) => id === roleId)
    if (!role) throw createMockApiError("resource.not_found", "Target role was not found.")
    return role
  }

  function replaceRole(role: RoleResponse) {
    const storedRole = structuredClone(role)
    state = {
      ...state,
      roles: state.roles.map((item) => (item.id === storedRole.id ? storedRole : item)),
    }
    return structuredClone(storedRole)
  }

  function getExtractionState(roleId: string): TaskStatusResponse | TaskFailureResponse {
    const role = requireRole(roleId)
    const extraction = jdExtractions.get(roleId)
    if (!extraction) return { status: "idle", error: null }
    if (extraction.abortStartedAt !== undefined) {
      if (Date.now() - extraction.abortStartedAt < JD_ABORT_DURATION_MS) {
        return { status: "aborting", error: null }
      }
      jdExtractions.delete(roleId)
      return { status: "idle", error: null }
    }
    const elapsed = Date.now() - extraction.startedAt
    if (elapsed < JD_QUEUE_DURATION_MS) return { status: "queued", error: null }
    if (elapsed < JD_QUEUE_DURATION_MS + JD_PROCESSING_DURATION_MS) {
      return { status: "running", error: null }
    }
    if (extraction.outcome === "failed") {
      return { status: "failed", error: { code: "invalid_output", message: jdFailReason } }
    }
    replaceRole({ ...role, jd: extractedJdFixture, updatedAt: nextTime() })
    jdExtractions.delete(roleId)
    return { status: "idle", error: null }
  }

  async function staleMatch(roleId: string) {
    const match = matches.get(roleId)
    if (match?.status === "running") {
      matches.delete(roleId)
      return
    }
    if (match?.status !== "success") return
    matches.set(roleId, { status: "stale", result: structuredClone(match.result) })
  }

  async function clear(roleId: string) {
    jdExtractions.delete(roleId)
    matches.delete(roleId)
  }

  // Provisional matching API: prerequisites are aggregated here, not by the Role UI.
  async function getMatch(roleId: string): Promise<MatchingAnalysisState> {
    const task = await rolesApi.getJdExtractionState(roleId)
    const [roles, profile] = await Promise.all([
      rolesApi.listRoles(),
      careerProfileApi.getCareerProfile().catch((error: unknown) => {
        if (error instanceof ApiError && error.code === "resource.not_found") return null
        throw error
      }),
    ])
    const role = roles.roles.find((item) => item.id === roleId)
    if (!role) throw createMockApiError("resource.not_found", "Target role was not found.")
    const reason = !profile
      ? "profileMissing"
      : !isCareerProfileComplete(profile)
        ? "profileIncomplete"
        : task.status === "failed"
          ? "jobDescriptionFailed"
          : task.status !== "idle"
            ? "jobDescriptionExtracting"
            : !hasJobDescription(role.jd)
              ? "jobDescriptionMissing"
              : null
    let record = matches.get(roleId)
    if (reason) {
      return {
        status: "blocked",
        reason,
        ...(record && record.status !== "running"
          ? { result: structuredClone(record.result) }
          : {}),
      }
    }
    if (record?.status === "running" && Date.now() - record.startedAt >= 1000) {
      record = { status: "success", result: record.result }
      matches.set(roleId, record)
    }
    return toMatchState(record)
  }

  async function create(input: CreateRoleRequest): Promise<RoleResponse> {
    const createdAt = nextTime()
    const role: RoleResponse = {
      id: nextId(),
      title: input.title,
      company: input.company ?? null,
      recruitmentTrack: input.recruitmentTrack ?? null,
      location: input.location ?? null,
      isArchived: false,
      jd: structuredClone(emptyJd),
      createdAt,
      updatedAt: createdAt,
    }

    const storedRole = structuredClone(role)
    state = { ...state, roles: [...state.roles, storedRole] }
    return structuredClone(storedRole)
  }

  return {
    async list(): Promise<RoleListResponse> {
      return {
        roles: structuredClone(state.roles).sort(
          (left, right) =>
            Date.parse(right.createdAt) - Date.parse(left.createdAt) ||
            right.id.localeCompare(left.id),
        ),
        activeRoleId: state.activeRoleId,
      }
    },

    clear,

    create,

    async recognizeRole(input: RecognizeRoleInput): Promise<RoleResponse> {
      const fixture =
        input.sourceType === "text"
          ? textRoleFixture
          : input.sourceType === "image"
            ? imageRoleFixture
            : urlRoleFixture
      const role = await create(fixture)
      return replaceRole({ ...role, jd: extractedJdFixture })
    },

    async extractJd(roleId: string, input: JDTextExtractionRequest): Promise<void> {
      getExtractionState(roleId)
      jdExtractions.set(roleId, {
        startedAt: Date.now(),
        outcome: input.text === jdFailInput ? "failed" : "success",
      })
    },

    async getJdExtractionState(roleId: string): Promise<TaskStatusResponse | TaskFailureResponse> {
      return getExtractionState(roleId)
    },

    async retryJdExtraction(roleId: string): Promise<void> {
      if (getExtractionState(roleId).status !== "failed") {
        throw createMockApiError("resource.conflict", "Only a failed JD extraction can be retried.")
      }
      jdExtractions.set(roleId, { startedAt: Date.now(), outcome: "success" })
    },

    async abortJdExtraction(roleId: string): Promise<void> {
      const { status } = getExtractionState(roleId)
      if (status === "aborting") return
      if (status !== "queued" && status !== "running") {
        throw createMockApiError(
          "resource.conflict",
          "Only an active JD extraction can be aborted.",
        )
      }
      jdExtractions.get(roleId)!.abortStartedAt = Date.now()
    },

    async match(roleId: string): Promise<MatchingAnalysisState> {
      const analysis = await getMatch(roleId)
      if (analysis.status === "blocked" || analysis.status === "generating") return analysis
      const task = {
        status: "running",
        startedAt: Date.now(),
        result: structuredClone(matchResultFixture),
      } satisfies MatchRecord
      matches.set(roleId, task)
      return { status: "generating" }
    },

    getMatch,

    staleMatch,

    async update(roleId: string, input: UpdateRoleRequest): Promise<RoleResponse> {
      const role = requireRole(roleId)
      return replaceRole({
        ...role,
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.company !== undefined ? { company: input.company } : {}),
        ...(input.recruitmentTrack !== undefined
          ? { recruitmentTrack: input.recruitmentTrack }
          : {}),
        ...(input.location !== undefined ? { location: input.location } : {}),
        updatedAt: nextTime(),
      })
    },

    async delete(roleId: string): Promise<void> {
      requireRole(roleId)
      state = {
        roles: state.roles.filter(({ id }) => id !== roleId),
        activeRoleId: state.activeRoleId === roleId ? null : state.activeRoleId,
      }
      await clear(roleId)
    },

    async setActive(input: SetActiveRoleRequest): Promise<void> {
      const role = requireRole(input.roleId)
      if (role.isArchived) {
        throw createMockApiError(
          "resource.conflict",
          "An archived target role cannot be activated.",
        )
      }
      state = { ...state, activeRoleId: role.id }
    },

    async archive(roleId: string): Promise<RoleResponse> {
      const role = requireRole(roleId)
      if (state.activeRoleId === roleId) {
        state = { ...state, activeRoleId: null }
      }
      if (role.isArchived) return structuredClone(role)
      return replaceRole({ ...role, isArchived: true, updatedAt: nextTime() })
    },

    async restore(roleId: string): Promise<RoleResponse> {
      const role = requireRole(roleId)
      if (!role.isArchived) return structuredClone(role)
      return replaceRole({ ...role, isArchived: false, updatedAt: nextTime() })
    },

    async updateJd(roleId: string, input: UpdateJobDescriptionRequest): Promise<RoleResponse> {
      const { status } = getExtractionState(roleId)
      if (status === "queued" || status === "running" || status === "aborting") {
        throw createMockApiError(
          "resource.conflict",
          "Abort the active extraction before updating the JD.",
        )
      }
      const role = requireRole(roleId)
      const updatedRole = replaceRole({
        ...role,
        jd: {
          ...role.jd,
          ...(input.responsibilities !== undefined
            ? { responsibilities: input.responsibilities }
            : {}),
          ...(input.requirements !== undefined
            ? { requirements: normalizeRequirements(input.requirements) }
            : {}),
          ...(input.hardSkills !== undefined
            ? { hardSkills: normalizeHardSkills(input.hardSkills) }
            : {}),
          ...(input.softSkills !== undefined ? { softSkills: input.softSkills } : {}),
          ...(input.preferredQualifications !== undefined
            ? { preferredQualifications: input.preferredQualifications }
            : {}),
          ...(input.businessDomains !== undefined
            ? { businessDomains: input.businessDomains }
            : {}),
        },
        updatedAt: nextTime(),
      })
      jdExtractions.delete(roleId)
      return updatedRole
    },
  }
}

export const roleFaker = createRoleFaker(roleListFixture)
