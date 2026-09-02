import { HttpResponse } from "msw"

import { ApiError } from "@/api/error"
import type { ErrorCode, ErrorResponse } from "@/api/generated/models"

type AsyncMethod = (...args: never[]) => Promise<unknown>

export function asMswFaker<T extends Record<string, AsyncMethod>>(
  faker: T,
  errorStatuses: Partial<Record<ErrorCode, number>>,
): T {
  return new Proxy(faker, {
    get(target, property, receiver) {
      const method = Reflect.get(target, property, receiver)
      if (typeof method !== "function") return method

      return async (...args: never[]) => {
        try {
          return await Reflect.apply(method, target, args)
        } catch (error) {
          if (!(error instanceof ApiError)) throw error

          const status = errorStatuses[error.code]
          if (status === undefined) {
            throw new Error(`Missing mock HTTP status for ${error.code}.`, { cause: error })
          }

          const response: ErrorResponse = {
            error: {
              code: error.code,
              message: error.message,
              ...(error.issues ? { issues: error.issues } : {}),
            },
          }
          throw HttpResponse.json(response, { status })
        }
      }
    },
  })
}
