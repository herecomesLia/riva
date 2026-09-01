import { HttpResponse, http } from "msw"

import { ApiError } from "@/api/error"
import type { ErrorResponse, LoginCredentials, RegisterCredentials } from "@/api/generated/models"
import { getCurrentUser, login, logout, register } from "@/mocks/fakers/auth"

async function handle<T>(operation: () => Promise<T>, respond: (result: T) => Response) {
  try {
    return respond(await operation())
  } catch (error) {
    if (!(error instanceof ApiError)) throw error

    const response: ErrorResponse = {
      error: {
        code: error.code ?? "request.http_error",
        message: error.message,
        ...(error.issues ? { issues: error.issues } : {}),
      },
      requestId: error.requestId ?? "mock-auth-request-id",
    }
    return HttpResponse.json(response, { status: error.status })
  }
}

export const authHandlers = [
  http.post("*/api/auth/register", async ({ request }) => {
    const credentials = (await request.json()) as RegisterCredentials
    return handle(
      () => register(credentials),
      (user) => HttpResponse.json(user, { status: 201 }),
    )
  }),
  http.post("*/api/auth/login", async ({ request }) => {
    const credentials = (await request.json()) as LoginCredentials
    return handle(() => login(credentials), HttpResponse.json)
  }),
  http.post("*/api/auth/logout", () =>
    handle(logout, () => new HttpResponse(null, { status: 204 })),
  ),
  http.get("*/api/users/me", () => handle(getCurrentUser, HttpResponse.json)),
]
