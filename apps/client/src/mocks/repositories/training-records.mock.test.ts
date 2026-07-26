import { beforeEach, describe, expect, it } from "vitest"

import { targetedPracticeRecordDetailsMock } from "@/mocks/data/training-records"

import {
  getTrainingRecordSnapshot,
  listTrainingRecordSnapshots,
  resetTrainingRecordsRepository,
  saveTrainingRecordSnapshot,
} from "./training-records"

beforeEach(() => {
  resetTrainingRecordsRepository()
})

describe("training records mock repository", () => {
  it("reads, writes, and resets independent snapshots", () => {
    const record = structuredClone(targetedPracticeRecordDetailsMock[0])
    record.id = "new-record"
    saveTrainingRecordSnapshot(record)

    record.questions[0].prompt = "调用方后续修改"
    const firstRead = getTrainingRecordSnapshot("new-record")
    if (firstRead?.kind !== "targetedPractice") throw new Error("Expected practice record.")
    expect(firstRead.questions[0]?.prompt).not.toBe("调用方后续修改")

    firstRead.questions[0]!.prompt = "读取结果后续修改"
    const secondRead = getTrainingRecordSnapshot("new-record")
    if (secondRead?.kind !== "targetedPractice") throw new Error("Expected practice record.")
    expect(secondRead.questions[0]?.prompt).not.toBe("读取结果后续修改")

    resetTrainingRecordsRepository()
    expect(getTrainingRecordSnapshot("new-record")).toBeNull()
    expect(listTrainingRecordSnapshots()).toHaveLength(6)
  })

  it("keeps the first immutable snapshot for the same record identity", () => {
    const record = structuredClone(targetedPracticeRecordDetailsMock[0])
    const originalPrompt = record.questions[0].prompt
    saveTrainingRecordSnapshot(record)
    record.questions[0].prompt = "同一 session 的更新快照"
    saveTrainingRecordSnapshot(record)

    expect(
      listTrainingRecordSnapshots().filter((candidate) => candidate.id === record.id),
    ).toHaveLength(1)
    const saved = getTrainingRecordSnapshot(record.id)
    if (saved?.kind !== "targetedPractice") throw new Error("Expected practice record.")
    expect(saved.questions[0]?.prompt).toBe(originalPrompt)
  })

  it("supports an explicit empty reset", () => {
    resetTrainingRecordsRepository("empty")
    expect(listTrainingRecordSnapshots()).toEqual([])
  })
})
