import { getCareerProfileMock, getHealthMock } from "@/api/generated/endpoints/index.msw"
import {
  getDeleteUserAvatarMockHandler,
  getSetUserAvatarMockHandler,
  getUpdateCurrentUserMockHandler,
} from "@/api/generated/endpoints/users/users.msw"
import { authHandlers } from "@/mocks/handlers/auth"

export const handlers = [
  ...authHandlers,
  ...getCareerProfileMock(),
  ...getHealthMock(),
  getUpdateCurrentUserMockHandler(),
  getSetUserAvatarMockHandler(),
  getDeleteUserAvatarMockHandler(),
]
