import { trainingRecordsFixture } from "@/mocks/fixtures/training-records"
import type { MockInterviewRecordDetailResponse } from "@/models/training-records"

export const completeMockInterviewHistoryStoryFixture: MockInterviewRecordDetailResponse =
  structuredClone(trainingRecordsFixture.interview)
const complete = completeMockInterviewHistoryStoryFixture
complete.id = "mock-interview-record-001"
complete.answeredQuestionCount = 2
complete.totalQuestionCount = 2
complete.recommendation = {
  ...structuredClone(trainingRecordsFixture.interview.recommendation),
  questionType: "technicalFoundation",
}
complete.questions.push(structuredClone(complete.questions[0]))
complete.questions[0].followUps = []
complete.questions[1].id = "interview-question-2"
complete.questions[1].order = 2
complete.questions[1].prompt = "当验证结果不符合预期时，你如何调整行动？"
complete.questions[1].answer!.id = "interview-answer-2"
complete.questions[1].referenceAnswer = {
  status: "unavailable",
  content: null,
  reason: "generationFailed",
}
complete.questions[1].followUps[0].referenceAnswer = { status: "generating", content: null }

export const partialMockInterviewHistoryStoryFixture: MockInterviewRecordDetailResponse =
  structuredClone(complete)
const partial = partialMockInterviewHistoryStoryFixture
partial.id = "mock-interview-record-002"
partial.status = "endedEarly"
partial.completionReason = "userEndedEarly"
partial.answeredQuestionCount = 1
partial.overallScore = null
partial.overallReview = {
  status: "partial",
  content: structuredClone(trainingRecordsFixture.interview.overallReview.content),
}
partial.candidateQuestionExchanges = []
partial.questions[0].followUps = structuredClone(
  trainingRecordsFixture.interview.questions[0].followUps,
)
partial.questions[0].followUps[0].answer = null
partial.questions[0].followUps[0].evaluation = null
partial.questions[0].followUps[0].review = null
partial.questions[1].answer = null
partial.questions[1].evaluation = null
partial.questions[1].review = null
partial.questions[1].followUps = []

export const unavailableReviewMockInterviewHistoryStoryFixture: MockInterviewRecordDetailResponse =
  structuredClone(trainingRecordsFixture.interview)
const unavailable = unavailableReviewMockInterviewHistoryStoryFixture
unavailable.id = "mock-interview-record-003"
unavailable.status = "endedEarly"
unavailable.completionReason = "userEndedEarly"
unavailable.answeredQuestionCount = 0
unavailable.overallScore = null
unavailable.overallReview = { status: "unavailable", content: null, reason: "insufficientAnswers" }
unavailable.questions[0].answer = null
unavailable.questions[0].evaluation = null
unavailable.questions[0].review = null
unavailable.questions[0].followUps = []
unavailable.candidateQuestionExchanges = []
unavailable.exposedWeaknesses = []
unavailable.recommendation = {
  action: "mockInterview",
  reason: "准备好案例后再进行一轮面试。",
  interviewType: "professional",
  difficulty: "pressure",
  focusAreas: ["结果证据"],
}
