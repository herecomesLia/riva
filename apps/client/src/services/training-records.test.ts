import { afterEach, describe, expect, it, vi } from "vitest"

import { trainingRecordsFaker } from "@/mocks/fakers/training-records"
import { getMockInterviewRecord, getTargetedPracticeRecord } from "./training-records"

describe("training record detail errors", () => {
  afterEach(() => vi.restoreAllMocks())

  it.each([
    ["targetedPractice", "practice", getTargetedPracticeRecord],
    ["mockInterview", "interview", getMockInterviewRecord],
  ] as const)(
    "maps missing %s details to a structured not-found error",
    async (kind, method, get) => {
      vi.spyOn(trainingRecordsFaker, method).mockReturnValue(null)
      await expect(get("missing")).rejects.toEqual(
        expect.objectContaining({
          code: "trainingRecordNotFound",
          recordKind: kind,
          recordId: "missing",
        }),
      )
    },
  )
})
