import {
  getAuthMock,
  getCareerProfileMock,
  getHealthMock,
  getUsersMock,
} from "@/api/generated/endpoints/index.msw"

export const handlers = [
  ...getAuthMock(),
  ...getCareerProfileMock(),
  ...getHealthMock(),
  ...getUsersMock(),
]
