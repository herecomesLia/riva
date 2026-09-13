import { ApiError } from "@/api/error"
import { getCareerProfileApi } from "@/api/generated/endpoints/career-profile/career-profile"
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
import type { RecognizeRoleInput } from "@/mocks/models/role"
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

const JD_QUEUE_DURATION_MS = 500
const JD_PROCESSING_DURATION_MS = 2000
const JD_ABORT_DURATION_MS = 500

const careerProfileApi = getCareerProfileApi()

type JdExtractionMock = {
  startedAt: number
  outcome: "success" | "failed"
  abortStartedAt?: number
}

type MatchRecord = {
  startedAt: number
  profileUpdatedAt: string | null
  jdUpdatedAt: string
  abortStartedAt?: number
}
const MATCH_QUEUE_DURATION_MS = 500
const MATCH_PROCESSING_DURATION_MS = 2000
const MATCH_ABORT_DURATION_MS = 500

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
  const snapshots = new Map<string, { profileUpdatedAt: string | null; jdUpdatedAt: string }>()
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

  function applyJd(role: RoleResponse, jd: JobDescriptionResponse) {
    const { updatedAt: _oldTime, ...oldContent } = role.jd
    const { updatedAt: _newTime, ...newContent } = jd
    if (JSON.stringify(oldContent) === JSON.stringify(newContent)) return structuredClone(role)
    const updatedAt = nextTime()
    return replaceRole({
      ...role,
      jd: { ...jd, updatedAt },
      updatedAt,
      matching: { ...role.matching, isStale: role.matching.result !== null },
    })
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
    applyJd(role, extractedJdFixture)
    jdExtractions.delete(roleId)
    return { status: "idle", error: null }
  }

  async function getProfileUpdatedAt() {
    return careerProfileApi
      .getCareerProfile()
      .then((profile) => profile.updatedAt)
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.code === "resource.not_found") return null
        throw error
      })
  }

  async function clear(roleId: string) {
    jdExtractions.delete(roleId)
    matches.delete(roleId)
    snapshots.delete(roleId)
  }

  function getMatchingState(roleId: string): TaskStatusResponse | TaskFailureResponse {
    const role = requireRole(roleId)
    const task = matches.get(roleId)
    if (!task) return { status: "idle", error: null }
    if (task.abortStartedAt !== undefined) {
      if (Date.now() - task.abortStartedAt < MATCH_ABORT_DURATION_MS)
        return { status: "aborting", error: null }
      matches.delete(roleId)
      return { status: "idle", error: null }
    }
    const elapsed = Date.now() - task.startedAt
    if (elapsed < MATCH_QUEUE_DURATION_MS) return { status: "queued", error: null }
    if (elapsed < MATCH_QUEUE_DURATION_MS + MATCH_PROCESSING_DURATION_MS)
      return { status: "running", error: null }
    if (task.profileUpdatedAt === null)
      return {
        status: "failed",
        error: { code: "internal_error", message: "Career profile is missing." },
      }
    snapshots.set(roleId, task)
    replaceRole({
      ...role,
      matching: {
        result: structuredClone(matchResultFixture),
        generatedAt: nextTime(),
        isStale: task.jdUpdatedAt !== role.jd.updatedAt,
      },
    })
    matches.delete(roleId)
    return { status: "idle", error: null }
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
      jd: { ...structuredClone(emptyJd), updatedAt: createdAt },
      matching: { result: null, generatedAt: null, isStale: false },
      createdAt,
      updatedAt: createdAt,
    }

    const storedRole = structuredClone(role)
    state = { ...state, roles: [...state.roles, storedRole] }
    return structuredClone(storedRole)
  }

  return {
    async listRoles(): Promise<RoleListResponse> {
      const profileUpdatedAt = await getProfileUpdatedAt()
      for (const role of state.roles) {
        const snapshot = snapshots.get(role.id)
        if (role.matching.result && snapshot) {
          role.matching.isStale =
            snapshot.profileUpdatedAt !== profileUpdatedAt ||
            snapshot.jdUpdatedAt !== role.jd.updatedAt
        }
      }
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

    async startRoleMatching(roleId: string): Promise<void> {
      if (getExtractionState(roleId).status !== "idle")
        throw createMockApiError("resource.conflict", "JD extraction must be idle.")
      const role = requireRole(roleId)
      const task: MatchRecord = {
        startedAt: Date.now(),
        profileUpdatedAt: null,
        jdUpdatedAt: role.jd.updatedAt,
      }
      matches.set(roleId, task)
      task.profileUpdatedAt = await getProfileUpdatedAt()
    },

    async getRoleMatchingState(roleId: string): Promise<TaskStatusResponse | TaskFailureResponse> {
      return getMatchingState(roleId)
    },

    async abortRoleMatching(roleId: string): Promise<void> {
      const { status } = getMatchingState(roleId)
      if (status === "aborting") return
      if (status !== "queued" && status !== "running")
        throw createMockApiError("resource.conflict", "No active matching task.")
      matches.get(roleId)!.abortStartedAt = Date.now()
    },

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
      const updatedRole = applyJd(role, {
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
        ...(input.businessDomains !== undefined ? { businessDomains: input.businessDomains } : {}),
      })
      jdExtractions.delete(roleId)
      return updatedRole
    },
  }
}

export const roleFaker = createRoleFaker(roleListFixture)
