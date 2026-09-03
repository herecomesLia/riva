import { ApiError } from "@/api/error"
import type { ErrorCode } from "@/api/generated/models"

export function createMockApiError(code: ErrorCode, message: string): ApiError {
  return new ApiError({ error: { code, message, issues: [] } })
}

export function waitForMockDelay(delayMs: number = 1000) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, delayMs)
  })
}
