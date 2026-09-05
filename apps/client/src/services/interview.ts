import { interviewFaker } from "@/mocks/fakers/interview"
import type {
  InterviewConfiguration,
  InterviewData,
  InterviewReview,
  InterviewSetup,
} from "@/models/interview-workflow"
import type { RolesData } from "@/models/target-role-workflow"
import { resolveInterviewTrainingEntry } from "@/models/training-entry"
import type {
  InterviewTrainingEntryParameters,
  InterviewTrainingEntryPreparationResponse,
  TrainingEntryRoleAvailability,
} from "@/models/training-entry"
import { getRoles } from "@/services/roles"

function buildSetup(data: RolesData): InterviewSetup {
  const roles = data.roles.filter((role) => !role.isArchived)
  const ready = roles.filter((role) => role.jdState.status === "ready")
  return {
    availability:
      roles.length === 0
        ? { status: "available" }
        : !data.profile.complete
          ? { status: "blocked", reason: "profileIncomplete" }
          : ready.length === 0
            ? { status: "blocked", reason: "jobDescriptionMissing" }
            : { status: "available" },
    targetRoles: ready.map(({ id, title, company }) => ({
      id,
      title,
      company,
      supportedRounds: ["hr", "firstBusiness", "technical", "manager", "final", "comprehensive"],
    })),
    availableDifficulties: ["basic", "pressure"],
    availableDurationMinutes: [15, 30, 45],
    defaultConfiguration: {
      targetRoleId: ready.find(({ id }) => id === data.activeRoleId)?.id ?? ready[0]?.id ?? null,
      round: "technical",
      difficulty: "pressure",
      durationMinutes: 30,
    },
  }
}

export async function getInterviewPage(): Promise<InterviewData> {
  return { setup: buildSetup(await getRoles()), session: interviewFaker.get() }
}

export async function prepareInterviewTrainingEntry(
  input: InterviewTrainingEntryParameters,
): Promise<InterviewTrainingEntryPreparationResponse> {
  const roles = await getRoles()
  const setup = buildSetup(roles)
  const role = roles.roles.find(({ id }) => id === input.targetRoleId)
  const availability: TrainingEntryRoleAvailability = !role
    ? { status: "unavailable", reason: "targetRoleDeleted" }
    : role.isArchived
      ? { status: "unavailable", reason: "targetRoleArchived" }
      : !roles.profile.complete || role.jdState.status !== "ready"
        ? { status: "unavailable", reason: "targetRolePrerequisiteUnavailable" }
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
