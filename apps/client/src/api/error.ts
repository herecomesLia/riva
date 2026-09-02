import { isAxiosError } from "axios"

import { ErrorCode } from "@/api/generated/models"
import type { ErrorIssue, ErrorResponse } from "@/api/generated/models"

export class ApiError extends Error {
  readonly status: number
  readonly code: ErrorCode | null
  readonly issues: ErrorIssue[] | null

  constructor(status: number, response: ErrorResponse | null, message: string) {
    super(response?.error.message ?? message)
    this.name = "ApiError"
    this.status = status
    this.code = response?.error.code ?? null
    this.issues = response?.error.issues ?? null
  }
}

export type TransportErrorKind = "network" | "timeout" | "cancelled"

export class TransportError extends Error {
  readonly kind: TransportErrorKind

  constructor(kind: TransportErrorKind, message: string) {
    super(message)
    this.name = "TransportError"
    this.kind = kind
  }
}

function isErrorResponse(value: unknown): value is ErrorResponse {
  if (typeof value !== "object" || value === null) return false

  const response = value as Record<string, unknown>
  if (typeof response.error !== "object" || response.error === null) return false

  const error = response.error as Record<string, unknown>
  return (
    Object.values(ErrorCode).includes(error.code as ErrorCode) && typeof error.message === "string"
  )
}

export function normalizeRequestError(error: unknown): Error {
  if (!isAxiosError(error)) return error instanceof Error ? error : new Error(String(error))

  if (error.response) {
    return new ApiError(
      error.response.status,
      isErrorResponse(error.response.data) ? error.response.data : null,
      error.message,
    )
  }

  if (error.code === "ERR_CANCELED") return new TransportError("cancelled", error.message)
  if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
    return new TransportError("timeout", error.message)
  }

  return new TransportError("network", error.message)
}
