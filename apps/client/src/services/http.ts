import { getAccessToken } from '../stores/session.store'
import type { ApiErrorData, ApiResponse } from '../types/api'

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

export class ApiError extends Error {
  code: string
  requestId: string
  status: number

  constructor(message: string, code: string, requestId: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.requestId = requestId
    this.status = status
  }
}

export async function request<T>(path: string, options: RequestOptions = {}) {
  const token = getAccessToken()
  const headers = new Headers()

  headers.set('Accept', 'application/json')

  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json')
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })

  const payload = (await response.json()) as ApiResponse<T> | ApiErrorData

  if (!response.ok || !payload.success) {
    const error = payload as ApiErrorData
    throw new ApiError(error.message, error.code, error.requestId, response.status)
  }

  return payload.data
}
