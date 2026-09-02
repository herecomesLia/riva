import {
  getLoginMockHandler,
  getLogoutMockHandler,
  getRegisterMockHandler,
} from "@/api/generated/endpoints/auth/auth.msw"
import { getGetCurrentUserMockHandler } from "@/api/generated/endpoints/users/users.msw"
import type { LoginCredentials, RegisterCredentials } from "@/api/generated/models"
import { authFaker as rawAuthFaker } from "@/mocks/fakers/auth"
import { asMswFaker } from "@/mocks/handlers/adapter"

const authFaker = asMswFaker(rawAuthFaker, {
  "auth.invalid_credentials": 401,
  "auth.not_authenticated": 401,
  "auth.username_taken": 409,
})

export const authHandlers = [
  getRegisterMockHandler(async ({ request }) => {
    const credentials = (await request.json()) as RegisterCredentials
    return authFaker.register(credentials)
  }),
  getLoginMockHandler(async ({ request }) => {
    const credentials = (await request.json()) as LoginCredentials
    return authFaker.login(credentials)
  }),
  getLogoutMockHandler(() => authFaker.logout()),
  getGetCurrentUserMockHandler(() => authFaker.getCurrentUser()),
]
