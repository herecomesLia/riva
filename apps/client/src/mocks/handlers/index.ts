import { getHealthMock } from "@/api/generated/endpoints/index.msw"
import {
  getDeleteUserAvatarMockHandler,
  getSetUserAvatarMockHandler,
  getUpdateCurrentUserMockHandler,
} from "@/api/generated/endpoints/users/users.msw"
import { authHandlers } from "@/mocks/handlers/auth"
import { careerProfileHandlers } from "@/mocks/handlers/career-profile"
import { targetRoleHandlers } from "@/mocks/handlers/target-role"

export const handlers = [
  ...authHandlers,
  ...careerProfileHandlers,
  ...targetRoleHandlers,
  ...getHealthMock(),
  getUpdateCurrentUserMockHandler(),
  getSetUserAvatarMockHandler(),
  getDeleteUserAvatarMockHandler(),
]
