export const trainingRecordQueryKeys = {
  all: ["training-records"] as const,
  overview: () => ["training-records", "overview"] as const,
  lists: () => ["training-records", "list"] as const,
  list: (search: object) => ["training-records", "list", search] as const,
  details: () => ["training-records", "detail"] as const,
  targetedPracticeDetail: (recordId: string) =>
    ["training-records", "detail", "targeted-practice", recordId] as const,
  mockInterviewDetail: (recordId: string) =>
    ["training-records", "detail", "mock-interview", recordId] as const,
}

export const trainingRecordCacheTime = 60_000
