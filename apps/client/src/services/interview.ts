import { interviewFaker } from "@/mocks/fakers/interview"
import type {
  InterviewConfiguration,
  InterviewData,
  InterviewReview,
  InterviewSetup,
} from "@/models/interview-workflow"
import type { RoleListResponse } from "@/api/generated/models"
import { resolveInterviewTrainingEntry } from "@/models/training-entry"
import type {
  InterviewTrainingEntryParameters,
  InterviewTrainingEntryPreparationResponse,
  TrainingEntryRoleAvailability,
} from "@/models/training-entry"
import { listRoles, getJdExtractionState } from "@/services/roles"
import { getCareerProfile } from "@/services/profile"
import { isCareerProfileComplete } from "@/lib/career-profile"
import { hasJobDescription } from "@/lib/job-description"

function buildSetup(
  data: RoleListResponse,
  profileComplete: boolean,
  readyRoleIds: Set<string>,
): InterviewSetup {
  const roles = data.roles.filter((role) => !role.isArchived)
  const ready = roles.filter((role) => readyRoleIds.has(role.id))
  return {
    availability:
      roles.length === 0
        ? { status: "available" }
        : !profileComplete
          ? { status: "blocked", reason: "profileIncomplete" }
          : ready.length === 0
            ? { status: "blocked", reason: "jobDescriptionMissing" }
            : { status: "available" },
    roles: ready.map(({ id, title, company }) => ({
      id,
      title,
      company,
      supportedRounds: ["hr", "firstBusiness", "technical", "manager", "final", "comprehensive"],
    })),
    availableDifficulties: ["basic", "pressure"],
    availableDurationMinutes: [15, 30, 45],
    defaultConfiguration: {
      roleId: ready.find(({ id }) => id === data.activeRoleId)?.id ?? ready[0]?.id ?? null,
      round: "technical",
      difficulty: "pressure",
      durationMinutes: 30,
    },
  }
}

export async function getInterviewPage(): Promise<InterviewData> {
  const { roles, profileComplete, readyRoleIds } = await getSetupResources()
  return { setup: buildSetup(roles, profileComplete, readyRoleIds), session: interviewFaker.get() }
}

async function getSetupResources() {
  const [initialRoles, profile] = await Promise.all([listRoles(), getCareerProfile()])
  const tasks = new Map(
    await Promise.all(
      initialRoles.roles
        .filter((role) => !role.isArchived)
        .map(async (role) => [role.id, await getJdExtractionState(role.id)] as const),
    ),
  )
  // Read the saved JD after observing completion, as extraction can finish during these reads.
  const roles = [...tasks.values()].some((task) => task.status === "idle")
    ? await listRoles()
    : initialRoles
  const readyRoleIds = new Set(
    roles.roles
      .filter((role) => tasks.get(role.id)?.status === "idle" && hasJobDescription(role.jd))
      .map((role) => role.id),
  )
  return { roles, profileComplete: isCareerProfileComplete(profile), readyRoleIds }
}

export async function prepareInterviewTrainingEntry(
  input: InterviewTrainingEntryParameters,
): Promise<InterviewTrainingEntryPreparationResponse> {
  const { roles, profileComplete, readyRoleIds } = await getSetupResources()
  const setup = buildSetup(roles, profileComplete, readyRoleIds)
  const role = roles.roles.find(({ id }) => id === input.roleId)
  const availability: TrainingEntryRoleAvailability = !role
    ? { status: "unavailable", reason: "roleDeleted" }
    : role.isArchived
      ? { status: "unavailable", reason: "roleArchived" }
      : !profileComplete || !readyRoleIds.has(role.id)
        ? { status: "unavailable", reason: "rolePrerequisiteUnavailable" }
        : { status: "available" }
  const resolution = resolveInterviewTrainingEntry(setup, input, availability)
  return {
    page: { setup: { ...setup, defaultConfiguration: resolution.configuration }, session: null },
    resolution,
  }
}

export async function startInterview(configuration: InterviewConfiguration) {
  return interviewFaker.start(configuration)
}
export async function beginInterviewQuestions() {
  return interviewFaker.begin()
}
export async function submitInterviewAnswer(content: string) {
  return interviewFaker.answer(content)
}
export async function submitCandidateQuestion(content: string) {
  return interviewFaker.ask(content)
}
export async function finishInterview() {
  return interviewFaker.finish()
}
export async function endInterview() {
  return interviewFaker.end()
}

export async function getInterviewReview(sessionId: string): Promise<InterviewReview | null> {
  const session = interviewFaker.get()
  return session?.status === "completed" && session.sessionId === sessionId
    ? interviewFaker.getReview()
    : null
}
