import { z } from "zod"

import type { AuthenticatedUser, UserAccountDto } from "@/models/auth"

const authenticatedUserObjectSchema = z
  .object({
    id: z.uuid(),
    username: z.string().min(1),
  })
  .strict()

export const authenticatedUserSchema: z.ZodType<AuthenticatedUser> = authenticatedUserObjectSchema

export const userAccountSchema: z.ZodType<UserAccountDto> = authenticatedUserObjectSchema
  .extend({
    avatarUrl: z.string().nullable(),
    displayName: z.string().trim().min(1),
  })
  .strict()
