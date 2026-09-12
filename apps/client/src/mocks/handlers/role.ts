import {
  getArchiveRoleMockHandler,
  getCreateRoleMockHandler,
  getDeleteRoleMockHandler,
  getListRolesMockHandler,
  getRestoreRoleMockHandler,
  getSetActiveRoleMockHandler,
  getUpdateJdMockHandler,
  getExtractJdFromTextMockHandler,
  getGetJdExtractionStateMockHandler,
  getRetryJdExtractionMockHandler,
  getAbortJdExtractionMockHandler,
  getUpdateRoleMockHandler,
} from "@/api/generated/endpoints/roles/roles.msw"
import type {
  CreateRoleRequest,
  JDTextExtractionRequest,
  SetActiveRoleRequest,
  UpdateJobDescriptionRequest,
  UpdateRoleRequest,
} from "@/api/generated/models"
import { roleFaker as baseFaker } from "@/mocks/fakers/role"
import { asMswFaker } from "@/mocks/handlers/adapter"

const roleFaker = asMswFaker(baseFaker, {
  "resource.not_found": 404,
  "resource.conflict": 409,
})

export const roleHandlers = [
  getListRolesMockHandler(() => roleFaker.list()),
  getCreateRoleMockHandler(async ({ request }) => {
    const input = (await request.json()) as CreateRoleRequest
    return roleFaker.create(input)
  }),
  getUpdateRoleMockHandler(async ({ params, request }) => {
    const input = (await request.json()) as UpdateRoleRequest
    return roleFaker.update(params.roleId as string, input)
  }),
  getDeleteRoleMockHandler(({ params }) => roleFaker.delete(params.roleId as string)),
  getSetActiveRoleMockHandler(async ({ request }) => {
    const input = (await request.json()) as SetActiveRoleRequest
    return roleFaker.setActive(input)
  }),
  getArchiveRoleMockHandler(({ params }) => roleFaker.archive(params.roleId as string)),
  getRestoreRoleMockHandler(({ params }) => roleFaker.restore(params.roleId as string)),
  getUpdateJdMockHandler(async ({ params, request }) => {
    const input = (await request.json()) as UpdateJobDescriptionRequest
    return roleFaker.updateJd(params.roleId as string, input)
  }),
  getExtractJdFromTextMockHandler(async ({ params, request }) => {
    const input = (await request.json()) as JDTextExtractionRequest
    return roleFaker.extractJd(params.roleId as string, input)
  }),
  getGetJdExtractionStateMockHandler(({ params }) =>
    roleFaker.getJdExtractionState(params.roleId as string),
  ),
  getRetryJdExtractionMockHandler(({ params }) =>
    roleFaker.retryJdExtraction(params.roleId as string),
  ),
  getAbortJdExtractionMockHandler(({ params }) =>
    roleFaker.abortJdExtraction(params.roleId as string),
  ),
]
