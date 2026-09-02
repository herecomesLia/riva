import { describe, expect, it } from "vitest"

import { ApiError } from "@/api/error"
import { asMswFaker } from "@/mocks/handlers/adapter"

describe("asMswFaker", () => {
  it("converts ApiError into a thrown HTTP error response", async () => {
    const faker = asMswFaker(
      {
        async fail() {
          throw new ApiError({
            error: { code: "auth.username_taken", message: "Already exists" },
          })
        },
      },
      { "auth.username_taken": 409 },
    )

    try {
      await faker.fail()
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(Response)
      const response = error as Response
      expect(response.status).toBe(409)
      await expect(response.json()).resolves.toEqual({
        error: { code: "auth.username_taken", message: "Already exists" },
      })
    }
  })
})
