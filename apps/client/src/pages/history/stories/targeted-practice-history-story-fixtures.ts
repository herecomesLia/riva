import { trainingRecordsFixture } from "@/mocks/fixtures/training-records"
import type { TargetedPracticeRecordDetailResponse } from "@/models/training-records"

export const completedTargetedPracticeHistoryStoryFixture = {
  ...structuredClone<TargetedPracticeRecordDetailResponse>(trainingRecordsFixture.practice),
  recommendation: structuredClone(trainingRecordsFixture.practice.recommendation),
}
const complete = completedTargetedPracticeHistoryStoryFixture
complete.id = "targeted-practice-record-001"
complete.questions.push(structuredClone(complete.questions[0]))
complete.questions[0].followUps = []
complete.questions[0].referenceAnswer = {
  status: "unavailable",
  content: null,
  reason: "generationFailed",
}
complete.questions[1].id = "practice-question-retry"
complete.questions[1].attemptNumber = 2
complete.questions[1].retryOfQuestionId = complete.questions[0].id
complete.questions[1].answer!.id = "practice-answer-retry"
complete.questions[1].referenceAnswer = structuredClone(trainingRecordsFixture.reference)

export const partialTargetedPracticeHistoryStoryFixture: TargetedPracticeRecordDetailResponse =
  structuredClone(trainingRecordsFixture.practice)
const partial = partialTargetedPracticeHistoryStoryFixture
partial.id = "targeted-practice-record-002"
partial.startedAt = "2026-07-25T06:50:00.000Z"
partial.durationSeconds = 1200
partial.status = "partiallyCompleted"
partial.overallScore = 68
partial.setup = {
  questionType: "behavioral",
  difficulty: "basic",
  source: "history",
  prioritizedWeaknesses: true,
}
partial.questions[0].type = "behavioral"
partial.questions[0].evaluation!.overallScore = 68
partial.questions[0].review!.summary = "回答保留了关键行动，仍需补充协作结果。"
partial.questions[0].referenceAnswer = { status: "generating", content: null }
partial.questions[0].followUps[0].answer = null
partial.questions[0].followUps[0].evaluation = null
partial.questions[0].followUps[0].review = null
partial.questions[0].followUps[0].referenceAnswer = { status: "notRequested", content: null }
partial.recommendation = {
  action: "retryQuestion",
  reason: "补充结果证据后再次练习。",
  questionType: "behavioral",
  difficulty: "basic",
  focusAreas: ["结果证据"],
}

export const endedTargetedPracticeHistoryStoryFixture: TargetedPracticeRecordDetailResponse =
  structuredClone(trainingRecordsFixture.practice)
const ended = endedTargetedPracticeHistoryStoryFixture
ended.id = "targeted-practice-record-003"
ended.status = "endedEarly"
ended.answeredQuestionCount = 0
ended.overallScore = null
ended.questions[0].answer = null
ended.questions[0].evaluation = null
ended.questions[0].review = null
ended.questions[0].referenceAnswer = { status: "notRequested", content: null }
ended.questions[0].followUps = []
ended.exposedWeaknesses = []
ended.recommendation = null
