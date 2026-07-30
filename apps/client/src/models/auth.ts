export type User = {
  id: string
  username: string
  displayName: string
  avatarUrl: string | null
  avatarFallback: string
}

export type AuthenticatedUser = Pick<User, "id" | "username">

export type LoginCredentials = {
  username: string
  password: string
}

export type LoginErrorCode = "invalidCredentials" | "serviceUnavailable" | "unknown"

export class LoginError extends Error {
  readonly code: LoginErrorCode

  constructor(code: LoginErrorCode) {
    super(code)
    this.code = code
    this.name = "LoginError"
  }
}

export function isLoginError(error: unknown): error is LoginError {
  return error instanceof LoginError
}
