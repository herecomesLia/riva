import { HttpResponse, http } from "msw"

import type { ErrorResponse, LoginCredentials, RegisterCredentials } from "@/api/generated/models"
import { authFaker } from "@/mocks/fakers/auth"

const requestId = "mock-auth-request-id"

function errorResponse(code: string, message: string): ErrorResponse {
  return {
    error: { code, message },
    requestId,
  }
}

export const authHandlers = [
  http.post("*/api/auth/register", async ({ request }) => {
    const result = authFaker.register((await request.json()) as RegisterCredentials)

    if (!result.ok) {
      return HttpResponse.json(
        errorResponse("auth.username_taken", "Username is already registered."),
        { status: 409 },
      )
    }

    return HttpResponse.json(result.user, { status: 201 })
  }),
  http.post("*/api/auth/login", async ({ request }) => {
    const user = authFaker.login((await request.json()) as LoginCredentials)

    if (!user) {
      return HttpResponse.json(
        errorResponse("auth.invalid_credentials", "Invalid username or password."),
        { status: 401 },
      )
    }

    return HttpResponse.json(user)
  }),
  http.post("*/api/auth/logout", () => {
    authFaker.logout()
    return new HttpResponse(null, { status: 204 })
  }),
  http.get("*/api/users/me", () => {
    const user = authFaker.getCurrentUser()

    if (!user) {
      return HttpResponse.json(
        errorResponse("auth.not_authenticated", "Authentication is required."),
        { status: 401 },
      )
    }

    return HttpResponse.json(user)
  }),
]
