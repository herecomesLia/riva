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
import type { RecognizeTargetRoleInput } from "@/models/roles"
import {
  imageRecognitionFixture,
  targetRoleListFixture,
  textRecognitionFixture,
  urlRecognitionFixture,
} from "@/mocks/fixtures/target-role"
import { createMockApiError } from "@/mocks/utils"

const emptyJobDescription = {
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

export function createTargetRoleFaker(initialState: TargetRoleListResponse) {
  let state = structuredClone(initialState)
  let createdRoleSequence = 0
  let timestampSequence = 0

  function nextId() {
    createdRoleSequence += 1
    return `00000000-0000-4000-8000-${String(createdRoleSequence).padStart(12, "0")}`
  }

  function nextTimestamp() {
    const timestamp = new Date(Date.UTC(2026, 7, 1, 8, timestampSequence)).toISOString()
    timestampSequence += 1
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
      targetRoles: state.targetRoles.map((candidate) =>
        candidate.id === storedRole.id ? storedRole : candidate,
      ),
    }
    return structuredClone(storedRole)
  }

  async function create(input: CreateTargetRoleRequest): Promise<TargetRoleResponse> {
    const createdAt = nextTimestamp()
    const role: TargetRoleResponse = {
      id: nextId(),
      title: input.title,
      company: input.company ?? null,
      recruitmentTrack: input.recruitmentTrack ?? null,
      location: input.location ?? null,
      isArchived: false,
      jd: structuredClone(emptyJobDescription),
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

    async recognize(input: RecognizeTargetRoleInput): Promise<TargetRoleResponse> {
      switch (input.sourceType) {
        case "text":
          return create(textRecognitionFixture)
        case "image":
          return create(imageRecognitionFixture)
        case "url":
          return create(urlRecognitionFixture)
      }
    },

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
        updatedAt: nextTimestamp(),
      })
    },

    async delete(roleId: string): Promise<void> {
      requireRole(roleId)
      state = {
        targetRoles: state.targetRoles.filter(({ id }) => id !== roleId),
        activeTargetRoleId: state.activeTargetRoleId === roleId ? null : state.activeTargetRoleId,
      }
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
      return replaceRole({ ...role, isArchived: true, updatedAt: nextTimestamp() })
    },

    async restore(roleId: string): Promise<TargetRoleResponse> {
      const role = requireRole(roleId)
      if (!role.isArchived) return structuredClone(role)
      return replaceRole({ ...role, isArchived: false, updatedAt: nextTimestamp() })
    },

    async updateJd(
      roleId: string,
      input: UpdateJobDescriptionRequest,
    ): Promise<TargetRoleResponse> {
      const role = requireRole(roleId)
      return replaceRole({
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
        updatedAt: nextTimestamp(),
      })
    },
  }
}

export const targetRoleFaker = createTargetRoleFaker(targetRoleListFixture)
