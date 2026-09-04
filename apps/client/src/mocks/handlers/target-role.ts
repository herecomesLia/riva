import {
  getArchiveTargetRoleMockHandler,
  getCreateTargetRoleMockHandler,
  getDeleteTargetRoleMockHandler,
  getListTargetRolesMockHandler,
  getRestoreTargetRoleMockHandler,
  getSetActiveTargetRoleMockHandler,
  getUpdateTargetRoleJdMockHandler,
  getUpdateTargetRoleMockHandler,
} from "@/api/generated/endpoints/target-roles/target-roles.msw"
import type {
  CreateTargetRoleRequest,
  SetActiveTargetRoleRequest,
  UpdateJobDescriptionRequest,
  UpdateTargetRoleRequest,
} from "@/api/generated/models"
import { targetRoleFaker as baseFaker } from "@/mocks/fakers/target-role"
import { asMswFaker } from "@/mocks/handlers/adapter"

const roleFaker = asMswFaker(baseFaker, {
  "resource.not_found": 404,
  "resource.conflict": 409,
})

export const targetRoleHandlers = [
  getListTargetRolesMockHandler(() => roleFaker.list()),
  getCreateTargetRoleMockHandler(async ({ request }) => {
    const input = (await request.json()) as CreateTargetRoleRequest
    return roleFaker.create(input)
  }),
  getUpdateTargetRoleMockHandler(async ({ params, request }) => {
    const input = (await request.json()) as UpdateTargetRoleRequest
    return roleFaker.update(params.targetRoleId as string, input)
  }),
  getDeleteTargetRoleMockHandler(({ params }) => roleFaker.delete(params.targetRoleId as string)),
  getSetActiveTargetRoleMockHandler(async ({ request }) => {
    const input = (await request.json()) as SetActiveTargetRoleRequest
    return roleFaker.setActive(input)
  }),
  getArchiveTargetRoleMockHandler(({ params }) => roleFaker.archive(params.targetRoleId as string)),
  getRestoreTargetRoleMockHandler(({ params }) => roleFaker.restore(params.targetRoleId as string)),
  getUpdateTargetRoleJdMockHandler(async ({ params, request }) => {
    const input = (await request.json()) as UpdateJobDescriptionRequest
    return roleFaker.updateJd(params.targetRoleId as string, input)
  }),
]
