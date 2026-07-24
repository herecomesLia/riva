import { describe, expect, it } from "vitest"

import { parseInterviewEntrySearch, parsePracticeEntrySearch } from "@/app/training-entry-search"

import { defaultHistorySearch, parseHistorySearch } from "./history-navigation"
import { trainingRecordQueryKeys } from "./history-query-keys"

describe("training history navigation contracts", () => {
  it("normalizes missing and invalid history search values for direct URLs", () => {
    expect(parseHistorySearch({ kind: "invalid", page: "-2", timeRange: "today" })).toEqual(
      defaultHistorySearch,
    )
    expect(
      parseHistorySearch({
        kind: "mockInterview",
        targetRoleId: "role-1",
        timeRange: "last30Days",
        page: "3",
      }),
    ).toEqual({
      kind: "mockInterview",
      targetRoleId: "role-1",
      timeRange: "last30Days",
      page: 3,
    })
  })

  it("keeps list pages and detail identities in separate query-key namespaces", () => {
    const firstPage = { ...defaultHistorySearch, page: 1 }
    const secondPage = { ...defaultHistorySearch, page: 2 }

    expect(trainingRecordQueryKeys.list(firstPage)).not.toEqual(
      trainingRecordQueryKeys.list(secondPage),
    )
    expect(trainingRecordQueryKeys.targetedPracticeDetail("record-1")).not.toEqual(
      trainingRecordQueryKeys.targetedPracticeDetail("record-2"),
    )
    expect(trainingRecordQueryKeys.targetedPracticeDetail("record-1")).not.toEqual(
      trainingRecordQueryKeys.mockInterviewDetail("record-1"),
    )
  })

  it("only accepts stable business parameters at the existing training entries", () => {
    expect(
      parsePracticeEntrySearch({
        targetRoleId: "role-1",
        questionType: "behavioral",
        difficulty: "pressure",
        source: "history",
        prioritizeWeaknesses: "true",
        record: { id: "must-not-pass" },
      }),
    ).toEqual({
      targetRoleId: "role-1",
      questionType: "behavioral",
      difficulty: "pressure",
      source: "history",
      prioritizeWeaknesses: true,
    })
    expect(
      parseInterviewEntrySearch({
        targetRoleId: "role-1",
        round: "technical",
        difficulty: "pressure",
        durationMinutes: "30",
        recordId: "must-not-pass",
      }),
    ).toEqual({
      targetRoleId: "role-1",
      round: "technical",
      difficulty: "pressure",
      durationMinutes: 30,
    })
  })
})
