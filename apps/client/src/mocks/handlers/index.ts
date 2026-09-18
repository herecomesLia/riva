import { getHealthApiMock } from "@/api/generated/endpoints/health/health.msw"
import {
  getDeleteUserAvatarMockHandler,
  getSetUserAvatarMockHandler,
  getUpdateCurrentUserMockHandler,
} from "@/api/generated/endpoints/users/users.msw"
import { authHandlers } from "@/mocks/handlers/auth"
import { careerProfileHandlers } from "@/mocks/handlers/career-profile"
import { roleHandlers } from "@/mocks/handlers/role"
import { practiceHandlers } from "@/mocks/handlers/practices"

export const handlers = [
  ...authHandlers,
  ...careerProfileHandlers,
  ...roleHandlers,
  ...practiceHandlers,
  ...getHealthApiMock(),
  getUpdateCurrentUserMockHandler(),
  getSetUserAvatarMockHandler(),
  getDeleteUserAvatarMockHandler(),
]
