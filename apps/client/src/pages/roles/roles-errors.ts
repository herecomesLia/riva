export type RolesActionErrorCode = "requestFailed" | "versionConflict"

export class RolesActionError extends Error {
  readonly code: RolesActionErrorCode

  constructor(code: RolesActionErrorCode) {
    super(code)
    this.name = "RolesActionError"
    this.code = code
  }
}

export function getRolesActionErrorCode(error: unknown): RolesActionErrorCode {
  if (error instanceof RolesActionError) return error.code
  if (error instanceof ApiError && error.code === "target_role_version_conflict") {
    return "versionConflict"
  }
  return "requestFailed"
}
import { ApiError } from "@/services/api"
