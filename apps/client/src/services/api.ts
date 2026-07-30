import { env } from "@/app/env"

type ApiRequestOptions = Omit<RequestInit, "body" | "credentials"> & {
  json?: unknown
}

type APIErrorBody = {
  error: string
}

export class ApiError extends Error {
  readonly body: unknown
  readonly code: string | null
  readonly status: number

  constructor(status: number, code: string | null, body: unknown) {
    super(code ?? `API request failed with status ${status}`)
    this.body = body
    this.code = code
    this.name = "ApiError"
    this.status = status
  }
}

function buildApiUrl(path: string): string {
  const baseUrl = env.apiBaseUrl.replace(/\/+$/, "")
  const requestPath = path.replace(/^\/+/, "")

  return `${baseUrl}/${requestPath}`
}

function getErrorCode(body: unknown): string | null {
  if (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof (body as APIErrorBody).error === "string"
  ) {
    return (body as APIErrorBody).error
  }

  return null
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { headers: initialHeaders, json, ...requestOptions } = options
  const headers = new Headers(initialHeaders)

  if (json !== undefined) {
    headers.set("Content-Type", "application/json")
  }

  const response = await fetch(buildApiUrl(path), {
    ...requestOptions,
    body: json === undefined ? undefined : JSON.stringify(json),
    credentials: "include",
    headers,
  })

  if (response.status === 204) {
    return undefined as T
  }

  let body: unknown

  try {
    body = await response.json()
  } catch (error) {
    if (!response.ok) {
      throw new ApiError(response.status, null, null)
    }

    throw error
  }

  if (!response.ok) {
    throw new ApiError(response.status, getErrorCode(body), body)
  }

  return body as T
}
