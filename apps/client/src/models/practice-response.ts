import type {
  PracticeDimensionScoresResponse,
  PracticeQuestionTurnResponse,
  PracticeResponse,
  TaskFailureResponse,
  TaskStatusResponse,
} from "@/api/generated/models"
import type {
  PracticeQuestion,
  PracticeSession,
  ProcessingSession,
  ScoreDimension,
  SetupSession,
} from "./practice-workflow"

const scoreDimensions = {
  relevance: "relevance",
  structure: "structure",
  specificity: "specificity",
  contribution: "personalContribution",
  evidence: "resultsAndEvidence",
  roleAlignment: "roleAlignment",
  communication: "communication",
  riskAwareness: "riskControl",
} satisfies Record<keyof PracticeDimensionScoresResponse, ScoreDimension>

export function toPracticeQuestion(turn: PracticeQuestionTurnResponse): PracticeQuestion {
  return {
    id: turn.id,
    prompt: turn.content,
    criteria: structuredClone(turn.criteria),
    guidance: structuredClone(turn.guidance),
    referenceAnswer: turn.referenceAnswer,
  }
}

/**
 * Project a loaded session and its current round's task into display data.
 * The caller handles no-active-session (204), loading and transport errors,
 * and passes task.status === "failed" to the View's task-error presentation.
 */
export function toPracticeSession(
  practice: PracticeResponse,
  task: TaskStatusResponse | TaskFailureResponse,
): Exclude<PracticeSession, SetupSession> {
  const round = practice.rounds.at(-1)
  if (!round) throw new Error("Practice response has no current round.")

  const base = {
    context: {
      practiceId: practice.id,
      roundId: round.id,
      role: { ...practice.role },
    },
    selection: {
      roleId: practice.role.id,
      questionType: practice.questionType,
      difficulty: practice.difficulty,
    },
  }

  if (practice.endedAt !== null) {
    const results = practice.rounds.flatMap(({ result }) => (result ? [result] : []))
    if (results.length === 0) throw new Error("Ended practice has no completed rounds.")
    return {
      ...base,
      status: "completed",
      questionsCompleted: results.length,
      finalAttemptAverageScore:
        results.reduce((sum, result) => sum + result.score, 0) / results.length,
    }
  }

  const [mainQuestion, mainAnswer] = round.turns
  if (!mainQuestion) {
    if (round.result !== null) throw new Error("Practice result has no question.")
    return { ...base, status: "generatingQuestion", question: null }
  }
  if (mainQuestion.role !== "assistant") throw new Error("Practice must start with a question.")
  const question = toPracticeQuestion(mainQuestion)
  if (!mainAnswer) {
    if (round.result !== null) throw new Error("Practice result has no answer.")
    return task.status === "idle"
      ? { ...base, status: "answering", question }
      : { ...base, status: "generatingQuestion", question }
  }
  if (mainAnswer.role !== "user") throw new Error("Practice main answer is out of order.")

  const followUps: ProcessingSession["followUps"] = []
  let currentFollowUp: PracticeQuestion | null = null
  for (let index = 2; index < round.turns.length; index += 2) {
    const followUp = round.turns[index]
    const answer = round.turns[index + 1]
    if (followUp.role !== "assistant") throw new Error("Practice follow-up is out of order.")
    if (!answer) {
      currentFollowUp = toPracticeQuestion(followUp)
    } else {
      if (answer.role !== "user") throw new Error("Practice follow-up answer is out of order.")
      followUps.push({
        question: toPracticeQuestion(followUp),
        answer: { id: answer.id, content: answer.content },
      })
    }
  }
  const conversation = {
    ...base,
    question,
    mainAnswer: { id: mainAnswer.id, content: mainAnswer.content },
    followUps,
  }

  if (round.result !== null) {
    if (currentFollowUp) throw new Error("Completed practice round has an unanswered follow-up.")
    const result = round.result
    return {
      ...conversation,
      status: "review",
      evaluation: {
        overallScore: result.score,
        dimensionScores: (Object.keys(scoreDimensions) as (keyof typeof scoreDimensions)[]).map(
          (key) => ({ dimension: scoreDimensions[key], ...result.dimensionScores[key] }),
        ),
      },
      review: {
        overallPerformance: result.summary,
        highlights: [...result.strengths],
        mainIssues: [...result.issues],
        improvementSuggestions: [...result.suggestions],
      },
    }
  }
  if (currentFollowUp && task.status === "idle") {
    return { ...conversation, status: "answeringFollowUp", currentFollowUp }
  }
  return { ...conversation, status: "processing" }
}
