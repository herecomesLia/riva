import { describe, expect, it } from "vitest"

import {
  educationItemSchema,
  projectItemSchema,
  skillSchema,
  workItemSchema,
} from "@/schemas/profile"

const schemas: Array<[string, any, Record<string, unknown>]> = [
  [
    "education",
    educationItemSchema,
    {
      degree: "",
      id: "education_1",
      major: "",
      school: "Riva University",
    },
  ],
  [
    "work experience",
    workItemSchema,
    {
      achievements: "",
      company: "Riva",
      employmentType: "fullTime",
      id: "work_1",
      location: "",
      responsibilities: "",
      skillIds: "",
      title: "Engineer",
    },
  ],
  [
    "project experience",
    projectItemSchema,
    {
      achievements: "",
      background: "",
      contributions: "",
      id: "project_1",
      name: "Riva project",
      projectUrl: "",
      relatedWorkExperienceId: "",
      responsibilities: "",
      role: "",
      technologies: "",
    },
  ],
]

function dateFields(
  overrides: Partial<{ endDate: string; isCurrent: boolean; startDate: string }> = {},
) {
  return {
    endDate: "2024-06",
    isCurrent: false,
    startDate: "2024-01",
    ...overrides,
  }
}

describe("experience date schemas", () => {
  it.each(schemas)("skips date-range validation for a current %s", (_, schema, values) => {
    expect(
      schema.safeParse({ ...values, ...dateFields({ endDate: "2023-12", isCurrent: true }) })
        .success,
    ).toBe(true)
  })

  it.each(schemas)("requires an end date for a non-current %s", (_, schema, values) => {
    const result = schema.safeParse({ ...values, ...dateFields({ endDate: "" }) })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ message: "required", path: ["endDate"] }),
        ]),
      )
    }
  })

  it.each(schemas)(
    "rejects an end date before the start date for a non-current %s",
    (_, schema, values) => {
      const result = schema.safeParse({
        ...values,
        ...dateFields({ endDate: "2023-12" }),
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ message: "dateRange", path: ["endDate"] }),
          ]),
        )
      }
    },
  )
})

describe("skill schema", () => {
  it("requires and trims a skill name", () => {
    const result = skillSchema.safeParse({
      id: "skill_react",
      name: "  React  ",
    })

    expect(result).toEqual({ success: true, data: { id: "skill_react", name: "React" } })
  })

  it("rejects an empty skill name", () => {
    expect(skillSchema.safeParse({ id: "skill_react", name: "   " }).success).toBe(false)
  })
})
