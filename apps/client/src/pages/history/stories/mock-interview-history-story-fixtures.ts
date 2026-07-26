import { mockInterviewRecordDetailsMock } from "@/mocks/data/training-records"

export const completeMockInterviewHistoryStoryFixture = structuredClone(
  mockInterviewRecordDetailsMock[0],
)

export const partialMockInterviewHistoryStoryFixture = structuredClone(
  mockInterviewRecordDetailsMock[1],
)

export const unavailableReviewMockInterviewHistoryStoryFixture = structuredClone(
  mockInterviewRecordDetailsMock[2],
)
