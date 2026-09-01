import {
  getAuthMock,
  getCareerProfileMock,
  getHealthMock,
  getUsersMock,
} from "@/api/generated/endpoints/index.msw"
import { authHandlers } from "@/mocks/handlers/auth"

export const handlers = [
  ...authHandlers,
  ...getAuthMock(),
  ...getCareerProfileMock(),
  ...getHealthMock(),
  ...getUsersMock(),
]
