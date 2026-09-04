import type {
  CreateTargetRoleRequest,
  HardSkillsRequest,
  HardSkillsResponse,
  JobDescriptionResponse,
  JobRequirementsRequest,
  JobRequirementsResponse,
  SetActiveTargetRoleRequest,
  TargetRoleListResponse,
  TargetRoleResponse,
  UpdateJobDescriptionRequest,
  UpdateTargetRoleRequest,
} from "@/api/generated/models"
import type {
  JdState,
  MatchingAnalysisResult,
  MatchState,
  RecognizeRoleInput,
} from "@/models/target-role-workflow"
import {
  imageRoleFixture,
  jdFailInput,
  jdFailReason,
  matchResultFixture,
  parsedJdFixture,
  roleListFixture,
  textRoleFixture,
  urlRoleFixture,
} from "@/mocks/fixtures/target-role"
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

type TaskRecord<T> =
  | { status: "running"; result: T | string }
  | { status: "success"; result: T }
  | { status: "failed"; result: string }

type MatchRecord =
  | {
      status: "running"
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

function hasJdContent(jd: JobDescriptionResponse) {
  return (
    jd.responsibilities.length > 0 ||
    Object.values(jd.requirements).some((items) => items.length > 0) ||
    Object.values(jd.hardSkills).some((items) => items.length > 0) ||
    jd.softSkills.length > 0 ||
    jd.preferredQualifications.length > 0 ||
    jd.businessDomains.length > 0
  )
}

function toJdState(
  task: TaskRecord<JobDescriptionResponse> | undefined,
  jd: JobDescriptionResponse,
): JdState {
  if (!task) {
    return hasJdContent(jd)
      ? { status: "ready", result: structuredClone(jd) }
      : { status: "missing" }
  }
  if (task.status === "running") return { status: "parsing" }
  if (task.status === "failed") return { status: "failed", reason: task.result }
  return { status: "ready", result: structuredClone(task.result) }
}

function toMatchState(match: MatchRecord | undefined): MatchState {
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
    other: input.other ?? [],
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

export function createRoleFaker(initialState: TargetRoleListResponse) {
  let state = structuredClone(initialState)
  const jdTasks = new Map<string, TaskRecord<JobDescriptionResponse>>()
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
    const role = state.targetRoles.find(({ id }) => id === roleId)
    if (!role) throw createMockApiError("resource.not_found", "Target role was not found.")
    return role
  }

  function replaceRole(role: TargetRoleResponse) {
    const storedRole = structuredClone(role)
    state = {
      ...state,
      targetRoles: state.targetRoles.map((item) => (item.id === storedRole.id ? storedRole : item)),
    }
    return structuredClone(storedRole)
  }

  function startJdTask(roleId: string, text?: string) {
    const result = text === jdFailInput ? jdFailReason : structuredClone(parsedJdFixture)
    const task = { status: "running", result } satisfies TaskRecord<JobDescriptionResponse>
    jdTasks.set(roleId, task)
  }

  async function staleMatch(roleId: string) {
    const match = matches.get(roleId)
    if (match?.status !== "success") return
    matches.set(roleId, { status: "stale", result: structuredClone(match.result) })
  }

  async function create(input: CreateTargetRoleRequest): Promise<TargetRoleResponse> {
    const createdAt = nextTime()
    const role: TargetRoleResponse = {
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
    state = { ...state, targetRoles: [...state.targetRoles, storedRole] }
    return structuredClone(storedRole)
  }

  return {
    async list(): Promise<TargetRoleListResponse> {
      return {
        targetRoles: structuredClone(state.targetRoles).sort(
          (left, right) =>
            Date.parse(right.createdAt) - Date.parse(left.createdAt) ||
            right.id.localeCompare(left.id),
        ),
        activeTargetRoleId: state.activeTargetRoleId,
      }
    },

    create,

    async recognize(input: RecognizeRoleInput): Promise<CreateTargetRoleRequest> {
      let fixture: CreateTargetRoleRequest
      switch (input.sourceType) {
        case "text":
          fixture = textRoleFixture
          break
        case "image":
          fixture = imageRoleFixture
          break
        case "url":
          fixture = urlRoleFixture
      }

      return structuredClone(fixture)
    },

    async parseJd(roleId: string, text: string): Promise<JdState> {
      await staleMatch(roleId)
      startJdTask(roleId, text)
      return { status: "parsing" }
    },

    async getJd(role: TargetRoleResponse): Promise<JdState> {
      return toJdState(jdTasks.get(role.id), role.jd)
    },

    async pollJd(role: TargetRoleResponse): Promise<JdState> {
      const task = jdTasks.get(role.id)
      if (!task || task.status !== "running") return toJdState(task, role.jd)

      if (typeof task.result === "string") {
        const failedTask = {
          status: "failed",
          result: task.result,
        } satisfies TaskRecord<JobDescriptionResponse>
        jdTasks.set(role.id, failedTask)
        return toJdState(failedTask, role.jd)
      }

      const doneTask = {
        status: "success",
        result: task.result,
      } satisfies TaskRecord<JobDescriptionResponse>
      jdTasks.set(role.id, doneTask)
      return toJdState(doneTask, role.jd)
    },

    async match(roleId: string): Promise<MatchState> {
      const task = {
        status: "running",
        result: structuredClone(matchResultFixture),
      } satisfies TaskRecord<MatchingAnalysisResult>
      matches.set(roleId, task)
      return { status: "generating" }
    },

    async getMatch(roleId: string): Promise<MatchState> {
      return toMatchState(matches.get(roleId))
    },

    async pollMatch(roleId: string): Promise<MatchState> {
      const match = matches.get(roleId)
      if (!match || match.status !== "running") return toMatchState(match)

      const doneMatch = {
        status: "success",
        result: structuredClone(match.result),
      } satisfies TaskRecord<MatchingAnalysisResult>
      matches.set(roleId, doneMatch)
      return toMatchState(doneMatch)
    },

    staleMatch,

    async update(roleId: string, input: UpdateTargetRoleRequest): Promise<TargetRoleResponse> {
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
        targetRoles: state.targetRoles.filter(({ id }) => id !== roleId),
        activeTargetRoleId: state.activeTargetRoleId === roleId ? null : state.activeTargetRoleId,
      }
      jdTasks.delete(roleId)
      matches.delete(roleId)
    },

    async setActive(input: SetActiveTargetRoleRequest): Promise<void> {
      const role = requireRole(input.targetRoleId)
      if (role.isArchived) {
        throw createMockApiError(
          "resource.conflict",
          "An archived target role cannot be activated.",
        )
      }
      state = { ...state, activeTargetRoleId: role.id }
    },

    async archive(roleId: string): Promise<TargetRoleResponse> {
      const role = requireRole(roleId)
      if (state.activeTargetRoleId === roleId) {
        state = { ...state, activeTargetRoleId: null }
      }
      if (role.isArchived) return structuredClone(role)
      return replaceRole({ ...role, isArchived: true, updatedAt: nextTime() })
    },

    async restore(roleId: string): Promise<TargetRoleResponse> {
      const role = requireRole(roleId)
      if (!role.isArchived) return structuredClone(role)
      return replaceRole({ ...role, isArchived: false, updatedAt: nextTime() })
    },

    async updateJd(
      roleId: string,
      input: UpdateJobDescriptionRequest,
    ): Promise<TargetRoleResponse> {
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
      return updatedRole
    },
  }
}

export const targetRoleFaker = createRoleFaker(roleListFixture)
