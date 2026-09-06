import { ApiError } from "@/api/error"
import type { ErrorCode } from "@/api/generated/models"

export function createMockApiError(code: ErrorCode, message: string): ApiError {
  return new ApiError({ error: { code, message, issues: [] } })
}
