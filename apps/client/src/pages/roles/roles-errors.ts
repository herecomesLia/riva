export type RolesActionErrorCode = "requestFailed"

export class RolesActionError extends Error {
  readonly code: RolesActionErrorCode

  constructor(code: RolesActionErrorCode) {
    super(code)
    this.name = "RolesActionError"
    this.code = code
  }
}

export function getRolesActionErrorCode(error: unknown): RolesActionErrorCode {
  return error instanceof RolesActionError ? error.code : "requestFailed"
}
